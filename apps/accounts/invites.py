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
        if phone and not user.phone:
            user.phone = phone
        user.save(update_fields=["full_name", "phone"])

    membership, _ = Membership.objects.get_or_create(
        user=user, workspace=workspace, defaults={"role": role, "is_active": user.has_usable_password()}
    )
    if membership.role != role:
        membership.role = role
        membership.save(update_fields=["role"])

    invite = MemberInvite.objects.create(user=user, workspace=workspace, invited_by=invited_by, expires_at=timezone.now() + INVITE_TTL)
    transaction.on_commit(lambda: deliver_invite(invite))
    return invite


def deliver_invite(invite: MemberInvite, *, kind: str = "invite"):
    """kind: "invite" for a new member, "reset" for a forgotten password. Same link, different words."""
    from .emails import send_invite_email, send_reset_email

    url = invite_url(invite)
    user = invite.user
    ws = invite.workspace
    if kind == "reset":
        if user.email:
            send_reset_email(user=user, url=url)
        return
    body = f"{ws.name} added you on Trickshot Invitations. Set your password: {url}"
    if user.phone:
        send_transactional_sms(workspace=ws, to=user.phone, body=body)
    if user.email:
        role = Membership.objects.filter(user=user, workspace=ws).values_list("role", flat=True).first() or "door_staff"
        send_invite_email(user=user, workspace=ws, url=url, inviter=invite.invited_by, role=role)


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
