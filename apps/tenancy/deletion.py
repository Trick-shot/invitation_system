"""
Deleting a client workspace. Decided 12 Nov 2026 (project doc claude/platform-owner.md).

Two steps, on purpose:
1. schedule(): the workspace closes at once. Nobody can sign in to it, scan for it,
   send from it or open its guest links. Its admins get an email with the date.
2. purge(): GRACE_DAYS later everything is removed for good: events, guests, cards,
   photos, team, activity, and the accounts of people who belonged to no other workspace.

Until then the owner can restore() it exactly as it was. Ten days covers a wrong
click, a client who changes their mind, and a weekend in between.

The only thing kept is money: each month's SMS totals move into an anonymous
RetiredTotal row, so the owner's earnings history does not change after the fact.
"""

import logging
from datetime import timedelta

from django.apps import apps
from django.db import models, transaction
from django.db.models import Sum
from django.db.models.functions import ExtractMonth, ExtractYear
from django.utils import timezone

from .models import AuditEvent, Membership, SupportSession, Workspace

log = logging.getLogger(__name__)
GRACE_DAYS = 10


class DeletionError(Exception):
    pass


def preview(ws: Workspace) -> dict:
    """What a deletion removes, in counts, for the confirm dialog."""
    from apps.events.models import Event
    from apps.invitations.models import Invitation

    return {
        "events": Event.objects.all_workspaces().filter(workspace=ws).count(),
        "guests": Invitation.objects.all_workspaces().filter(workspace=ws).count(),
        "team": ws.memberships.count(),
        "accounts": len(_accounts_to_remove(ws)),
    }


def schedule(ws: Workspace, *, by, reason: str) -> Workspace:
    if ws.status == Workspace.Status.DELETING:
        raise DeletionError("This workspace is already being deleted.")
    from . import support

    now = timezone.now()
    with transaction.atomic():
        ws.status_before_deletion = ws.status
        ws.status = Workspace.Status.DELETING
        ws.delete_after = now + timedelta(days=GRACE_DAYS)
        ws.deletion_reason = reason
        ws.deletion_requested_by = by
        ws.save(update_fields=["status", "status_before_deletion", "delete_after", "deletion_reason", "deletion_requested_by"])
        for s in SupportSession.objects.filter(workspace=ws, ended_at__isnull=True):
            support.end(s)
        AuditEvent.objects.create(workspace=ws, actor=by, kind=AuditEvent.Kind.DELETION_SCHEDULED, summary=f"Deletion scheduled for {timezone.localtime(ws.delete_after):%d %b %Y}", reason=reason)
        transaction.on_commit(lambda: _after_schedule(ws))
    return ws


def restore(ws: Workspace, *, by) -> Workspace:
    if ws.status != Workspace.Status.DELETING:
        raise DeletionError("This workspace is not being deleted.")
    with transaction.atomic():
        ws.status = ws.status_before_deletion or Workspace.Status.ACTIVE
        ws.status_before_deletion = ""
        ws.delete_after = None
        ws.deletion_reason = ""
        ws.deletion_requested_by = None
        ws.save(update_fields=["status", "status_before_deletion", "delete_after", "deletion_reason", "deletion_requested_by"])
        AuditEvent.objects.create(workspace=ws, actor=by, kind=AuditEvent.Kind.RESTORED, summary="Deletion cancelled; the workspace is back as it was")
        transaction.on_commit(lambda: _tell_admins_restored(ws))
    return ws


def purge_due() -> int:
    """Remove every workspace whose hold has run out. Safe to run any number of times."""
    n = 0
    for ws in Workspace.objects.filter(status=Workspace.Status.DELETING, delete_after__lte=timezone.now()):
        try:
            purge(ws)
            n += 1
        except Exception as exc:  # noqa: BLE001  (one failure must not stop the others)
            log.exception("Purging workspace %s failed", ws.pk)
            from apps.accounts.emails import report

            report(exc)
    return n


def purge(ws: Workspace) -> None:
    if ws.status != Workspace.Status.DELETING:
        raise DeletionError("Only a workspace scheduled for deletion can be purged.")
    files = _files_of(ws)
    accounts = _accounts_to_remove(ws)
    with transaction.atomic():
        _retire_money(ws)
        from apps.accounts.models import User

        ws.delete()  # every tenant table cascades from the workspace
        User.objects.filter(pk__in=accounts).delete()
    transaction.on_commit(lambda: _remove_files(files))
    log.info("Workspace %s purged: %d files, %d accounts", ws.pk, len(files), len(accounts))


# ---------------------------------------------------------------------------


def _accounts_to_remove(ws: Workspace) -> list[int]:
    """People whose only workspace is this one. Platform owners and staff are never removed."""
    ids = set(Membership.objects.filter(workspace=ws).values_list("user_id", flat=True))
    elsewhere = set(Membership.objects.filter(user_id__in=ids).exclude(workspace=ws).values_list("user_id", flat=True))
    from apps.accounts.models import User

    return list(User.objects.filter(pk__in=ids - elsewhere, is_platform_owner=False, is_staff=False, is_superuser=False).values_list("pk", flat=True))


def _files_of(ws: Workspace) -> list[tuple]:
    """(storage, name) for every stored file that belongs to the workspace: logo, cards, photos."""
    out = []
    if ws.logo:
        out.append((ws.logo.storage, ws.logo.name))
    for model in apps.get_models():
        try:
            fk = model._meta.get_field("workspace")
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(fk, models.ForeignKey) or fk.related_model is not Workspace:
            continue
        for field in model._meta.fields:
            if isinstance(field, models.FileField):
                for name in model._base_manager.filter(workspace=ws).exclude(**{field.name: ""}).values_list(field.name, flat=True):
                    if name:
                        out.append((field.storage, name))
    return out


def _remove_files(files) -> None:
    for storage, name in files:
        try:
            storage.delete(name)
        except Exception:  # noqa: BLE001  (a missing file is already gone)
            log.warning("Could not delete %s", name)


def _retire_money(ws: Workspace) -> None:
    from apps.billing.models import RetiredTotal, SmsCharge
    from apps.billing.service import AMOUNT, COST

    rows = (
        SmsCharge.objects.all_workspaces()
        .filter(workspace=ws)
        .annotate(y=ExtractYear("created_at"), m=ExtractMonth("created_at"))
        .values("y", "m")
        .annotate(sms=Sum("segments"), cost=Sum(COST), billed=Sum(AMOUNT))
        .order_by()
    )
    for r in rows:
        t, _ = RetiredTotal.objects.select_for_update().get_or_create(year=r["y"], month=r["m"])
        t.sms += r["sms"] or 0
        t.cost += r["cost"] or 0
        t.billed += r["billed"] or 0
        t.save()


def _after_schedule(ws: Workspace) -> None:
    try:
        from django_q.models import Schedule
        from django_q.tasks import schedule as q_schedule

        q_schedule("apps.tenancy.deletion.purge_due", schedule_type=Schedule.ONCE, next_run=ws.delete_after + timedelta(minutes=1), name=f"purge-workspace-{ws.pk}-{ws.delete_after:%Y%m%d%H%M}")
    except Exception:  # noqa: BLE001  (the daily sweep still catches it)
        log.warning("Could not schedule the purge of workspace %s", ws.pk)
    _tell_admins_scheduled(ws)


def _admin_emails(ws: Workspace) -> list[str]:
    return [m.user.email for m in Membership.objects.filter(workspace=ws, role="admin").select_related("user") if m.user.email]


def _tell_admins_scheduled(ws: Workspace) -> None:
    from apps.accounts.emails import _send

    from .models import PlatformSettings

    when = f"{timezone.localtime(ws.delete_after):%-d %B %Y}"
    contact = PlatformSettings.current().support_email
    for email in _admin_emails(ws):
        _send(
            email,
            f"{ws.name} is being deleted",
            "email/base.html",
            {
                "kicker": ws.name,
                "title": f"Your workspace will be deleted on {when}",
                "paragraphs": [
                    "Trickshot has closed this workspace. Nobody can sign in to it, scan for it or send from it, and its guest links no longer open.",
                    f"On {when} everything in it is deleted for good: events, guest lists, cards and team accounts.",
                    f"If this is a mistake, or you need a copy of your guest lists first, reply to this email or write to {contact} before then.",
                ],
                "footer": f"Sent by Trickshot Invitations for {ws.name}.",
            },
            f"Your workspace {ws.name} will be deleted on {when}.\n\nIt is closed now. On {when} everything in it is deleted for good.\nIf this is a mistake, or you need a copy of your guest lists, write to {contact} before then.",
        )


def _tell_admins_restored(ws: Workspace) -> None:
    from apps.accounts.emails import _send

    from . import support

    for email in _admin_emails(ws):
        _send(
            email,
            f"{ws.name} is open again",
            "email/button.html",
            {"kicker": ws.name, "title": "Your workspace is back", "paragraphs": ["Trickshot has cancelled the deletion. Everything is as you left it: events, guests, cards and team."], "cta": "Open your workspace", "url": f"{support._site()}/app/{ws.slug}", "footer": f"Sent by Trickshot Invitations for {ws.name}."},
            f"Trickshot has cancelled the deletion of {ws.name}. Everything is as you left it.\n{support._site()}/app/{ws.slug}",
        )
