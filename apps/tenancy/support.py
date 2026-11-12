"""
Support access: the platform owner opens a client's workspace to help.

- View mode: read-only, every visit logged in the client's activity.
- Edit mode: needs a reason, lasts 30 minutes, every change logged; when it ends
  (by hand or by time) the workspace's admins get a summary email.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import AuditEvent, Membership, SupportSession

VIEW_HOURS = 4
EDIT_MINUTES = 30

# Plain words for what a change in edit mode touched, from the DRF view basename.
_THINGS = {"invitation": "a guest", "event": "an event", "member": "a team member", "scanlog": "the scan log"}
_VERBS = {"POST": "added or sent", "PUT": "changed", "PATCH": "changed", "DELETE": "removed"}


def active_session(user, workspace) -> SupportSession | None:
    if not (user and user.is_authenticated and getattr(user, "is_platform_owner", False) and workspace):
        return None
    return SupportSession.objects.filter(user=user, workspace=workspace, ended_at__isnull=True, expires_at__gt=timezone.now()).order_by("-started_at").first()


def support_membership(user, workspace) -> Membership | None:
    """An unsaved admin membership standing in for the owner during a support session."""
    session = active_session(user, workspace)
    if session is None:
        return None
    m = Membership(user=user, workspace=workspace, role=Membership.Role.ADMIN, is_active=True)
    m.support = session
    return m


@transaction.atomic
def start(user, workspace, *, mode: str, reason: str = "") -> SupportSession:
    now = timezone.now()
    # One session per owner and workspace: entering edit mode replaces the view session.
    SupportSession.objects.filter(user=user, workspace=workspace, ended_at__isnull=True).update(ended_at=now)
    if mode == SupportSession.Mode.EDIT:
        session = SupportSession.objects.create(user=user, workspace=workspace, mode=mode, reason=reason, expires_at=now + timedelta(minutes=EDIT_MINUTES))
        AuditEvent.objects.create(workspace=workspace, actor=user, kind=AuditEvent.Kind.SUPPORT_EDIT, summary=f"{name_of(user)} from Trickshot entered edit mode for {EDIT_MINUTES} minutes", reason=reason, session=session)
        transaction.on_commit(lambda: _schedule_finish(session))
    else:
        session = SupportSession.objects.create(user=user, workspace=workspace, mode=mode, expires_at=now + timedelta(hours=VIEW_HOURS))
        AuditEvent.objects.create(workspace=workspace, actor=user, kind=AuditEvent.Kind.SUPPORT_VIEW, summary=f"{name_of(user)} from Trickshot viewed the workspace (read-only)", session=session)
    return session


def end(session: SupportSession) -> None:
    if session.ended_at is None:
        session.ended_at = min(timezone.now(), session.expires_at)
        session.save(update_fields=["ended_at"])
    if session.mode == SupportSession.Mode.EDIT:
        finish(session.pk)


def log_change(session: SupportSession, *, method: str, basename: str, action: str) -> None:
    thing = _THINGS.get(basename, (basename or "settings").replace("_", " "))
    if action and action not in {"create", "update", "partial_update", "destroy"}:
        what = f"{action.replace('_', ' ')} on {thing}"
    else:
        what = f"{_VERBS.get(method, 'changed')} {thing}"
    AuditEvent.objects.create(workspace=session.workspace, actor=session.user, kind=AuditEvent.Kind.SUPPORT_CHANGE, summary=what[:300], session=session)


def finish(session_id: int) -> str:
    """Runs when edit mode ends, by hand or at expiry. Sends the admins one summary, once."""
    from apps.accounts.emails import _send

    session = SupportSession.objects.select_related("workspace", "user").filter(pk=session_id).first()
    if session is None or session.summary_sent or session.mode != SupportSession.Mode.EDIT:
        return "skipped"
    if session.ended_at is None:
        if session.expires_at > timezone.now():
            return "still running"
        session.ended_at = session.expires_at
    session.summary_sent = True
    session.save(update_fields=["ended_at", "summary_sent"])
    changes = list(session.events.filter(kind=AuditEvent.Kind.SUPPORT_CHANGE).order_by("created_at").values_list("summary", "created_at"))
    AuditEvent.objects.create(workspace=session.workspace, actor=session.user, kind=AuditEvent.Kind.SUPPORT_END, summary=f"Edit mode ended. {len(changes)} change{'s' if len(changes) != 1 else ''} made.", session=session)
    ws = session.workspace
    who = name_of(session.user)
    lines = [f"{timezone.localtime(at):%H:%M}  {what}" for what, at in changes] or ["No changes were made."]
    admins = Membership.objects.filter(workspace=ws, role=Membership.Role.ADMIN, is_active=True).select_related("user")
    for m in admins:
        if not m.user.email:
            continue
        _send(
            m.user.email,
            f"Trickshot support finished helping with {ws.name}",
            "email/button.html",
            {
                "kicker": ws.name,
                "title": f"{who} from Trickshot finished in edit mode",
                "paragraphs": [f"Reason given: {session.reason}", *lines],
                "cta": "Open your workspace",
                "url": f"{_site()}/app/{ws.slug}/settings",
                "footer": f"Sent by Trickshot Invitations for {ws.name}.",
            },
            f"{who} from Trickshot finished in edit mode.\nReason: {session.reason}\n\n" + "\n".join(lines),
        )
    return "sent"


def name_of(user) -> str:
    return (user.full_name or "").strip() or user.email


def _site() -> str:
    from django.conf import settings

    return settings.SITE_URL.rstrip("/")


def _schedule_finish(session: SupportSession) -> None:
    """Send the summary when edit mode times out even if nobody presses End."""
    try:
        from django_q.models import Schedule
        from django_q.tasks import schedule

        schedule("apps.tenancy.support.finish", session.pk, schedule_type=Schedule.ONCE, next_run=session.expires_at + timedelta(seconds=30), name=f"support-finish-{session.pk}")
    except Exception:  # noqa: BLE001  (the queue being down must not block support)
        pass
