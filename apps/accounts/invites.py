"""
Creating a member and getting them a set-password link, used by both the
workspace members endpoint and the platform's create-workspace endpoint.
"""

from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
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


def deliver_invite(invite: MemberInvite):
    url = invite_url(invite)
    user = invite.user
    ws = invite.workspace
    body = f"{ws.name} invited you to Trickshot Invitations. Set your password: {url}"
    if user.phone:
        send_transactional_sms(workspace=ws, to=user.phone, body=body)
    if user.email:
        send_mail(
            subject=f"You have been invited to {ws.name}",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )


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
