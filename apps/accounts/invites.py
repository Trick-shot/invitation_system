"""
Creating a member and getting them a set-password link, used by both the
workspace members endpoint and the platform's create-workspace endpoint.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.messaging.service import send_transactional_sms
from apps.tenancy.models import MemberInvite, Membership

from .models import User

INVITE_TTL = timedelta(days=7)


def invite_url(invite: MemberInvite) -> str:
    return f"{settings.SITE_URL}/set-password/{invite.token}"


@transaction.atomic
def invite_member(*, workspace, email, role, full_name="", phone="", invited_by=None) -> MemberInvite:
    user, created = User.objects.get_or_create(
        email=User.objects.normalize_email(email),
        defaults={"full_name": full_name, "phone": phone},
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    else:
        # Keep the latest contact details without clobbering a real name with blank.
        if full_name and not user.full_name:
            user.full_name = full_name
        # A newer number wins: an earlier attempt may have stored it badly formatted.
        if phone and user.phone != phone:
            user.phone = phone
        user.save(update_fields=["full_name", "phone"])

    membership, _ = Membership.objects.get_or_create(
        user=user, workspace=workspace, defaults={"role": role, "is_active": user.has_usable_password()}
    )
    if membership.role != role:
        membership.role = role
        membership.save(update_fields=["role"])

    invite = MemberInvite.objects.create(user=user, workspace=workspace, invited_by=invited_by, expires_at=timezone.now() + INVITE_TTL)
    # Runs when this transaction commits (before the view responds); the result rides on the
    # invite so the view can tell the admin which channel reached the person.
    invite.delivery = {}
    transaction.on_commit(lambda: setattr(invite, "delivery", deliver_invite(invite)))
    return invite


def deliver_invite(invite: MemberInvite, *, kind: str = "invite") -> dict:
    """
    kind: "invite" for a new member, "reset" for a forgotten password. Same link, different words.

    Each channel is tried on its own. A rejected SMS must not stop the email, and neither
    may fail the request: the member already exists by now. Returns what happened per
    channel, e.g. {"email": "sent", "sms": "failed: Invalid phone number"}.
    """
    import logging

    from apps.invitations.phones import PhoneError, normalise
    from apps.messaging.service import send_transactional_sms

    from .emails import report, send_invite_email, send_reset_email

    log = logging.getLogger(__name__)
    url = invite_url(invite)
    user = invite.user
    ws = invite.workspace
    result: dict = {}
    if kind == "reset":
        if user.email:
            result["email"] = "sent" if send_reset_email(user=user, url=url) else "failed"
        return result
    if user.phone:
        try:
            to = normalise(user.phone, getattr(ws, "default_country", "TZ") or "TZ")
            from apps.billing.service import event_for_workspace_message

            send_transactional_sms(
                workspace=ws, to=to, body=f"{ws.name} added you on Trickshot Invitations. Set your password: {url}",
                kind="staff_invite", event=event_for_workspace_message(ws), recipient=user.full_name or user.email,
            )
            result["sms"] = "sent"
        except PhoneError as exc:
            result["sms"] = f"failed: {exc}"
        except Exception as exc:  # noqa: BLE001  (provider rejected or unreachable)
            log.warning("Invite SMS to user %s failed: %s", user.pk, exc)
            report(exc)
            result["sms"] = f"failed: {exc}"
    if user.email:
        role = Membership.objects.filter(user=user, workspace=ws).values_list("role", flat=True).first() or "door_staff"
        result["email"] = "sent" if send_invite_email(user=user, workspace=ws, url=url, inviter=invite.invited_by, role=role) else "failed"
    return result


@transaction.atomic
def consume_invite(invite: MemberInvite, password: str, full_name: str = "") -> User:
    if not invite.is_valid:
        raise ValueError("This link has expired or was already used.")
    user = invite.user
    user.set_password(password)
    if full_name:
        user.full_name = full_name
    user.save()
    Membership.objects.filter(user=user, workspace=invite.workspace).update(is_active=True)
    invite.used_at = timezone.now()
    invite.save(update_fields=["used_at"])
    return user
