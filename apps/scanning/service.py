"""
The admission rule, in one place.

Atomic conditional update: increment admitted_count only while it is below
capacity. One UPDATE, no read-then-write, so two phones scanning the same
card at the same instant cannot both succeed past capacity.
"""

from dataclasses import dataclass, field

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.events.models import Event
from apps.invitations.models import Invitation
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Membership

from .models import ScanLog


@dataclass
class Verdict:
    result: str
    guest_name: str = ""
    capacity: int = 0
    admitted_count: int = 0
    previous_scans: list = field(default_factory=list)
    invitation_id: int | None = None

    def as_dict(self):
        return self.__dict__


def _history(invitation):
    rows = ScanLog.objects.filter(invitation=invitation, result=ScanLog.Result.ACCEPTED).select_related("staff").order_by("created_at")
    return [
        {"at": r.created_at.isoformat(), "by": (r.staff.full_name or r.staff.email) if r.staff else "", "manual": r.manual} for r in rows
    ]


def admit(
    *, event: Event, token: str | None, invitation: Invitation | None, staff, device_id: str, scanned_at, manual: bool = False
) -> Verdict:
    """
    Resolve a token (or an invitation chosen by name) against `event` and
    admit one person if there is room. Caller has already verified that
    `staff` is an active member of event.workspace.
    """
    scanned_at = scanned_at or timezone.now()
    with workspace_context(event.workspace):
        if invitation is None:
            invitation = Invitation.objects.all_workspaces().select_related("event").filter(token=token).first()
        log_kwargs = dict(workspace=event.workspace, event=event, staff=staff, device_id=device_id, scanned_at=scanned_at, manual=manual)

        if invitation is None or invitation.workspace_id != event.workspace_id:
            # Unknown and foreign tokens are reported identically: no probing across tenants.
            ScanLog.objects.create(result=ScanLog.Result.UNKNOWN, **log_kwargs)
            return Verdict(result="unknown")
        if invitation.event_id != event.id:
            ScanLog.objects.create(result=ScanLog.Result.WRONG_EVENT, invitation=invitation, **log_kwargs)
            return Verdict(result="wrong_event", guest_name=invitation.name)
        if event.status != Event.Status.OPEN:
            ScanLog.objects.create(result=ScanLog.Result.CLOSED, invitation=invitation, **log_kwargs)
            return Verdict(result="closed", guest_name=invitation.name)

        with transaction.atomic():
            updated = Invitation.objects.filter(pk=invitation.pk, admitted_count__lt=F("capacity")).update(
                admitted_count=F("admitted_count") + 1, updated_at=timezone.now()
            )
            invitation.refresh_from_db(fields=["admitted_count", "capacity"])
            if updated:
                ScanLog.objects.create(
                    result=ScanLog.Result.ACCEPTED, invitation=invitation, admitted_after=invitation.admitted_count, **log_kwargs
                )
                if invitation.admitted_count == 1:
                    # First person on this card: the increment is atomic, so exactly one scan ever sees 1.
                    from django_q.tasks import async_task

                    from .welcome import send_welcome

                    transaction.on_commit(lambda pk=invitation.pk, ws=event.workspace_id: async_task(send_welcome, pk, ws, group=f"welcome:{event.pk}"))
                return Verdict(
                    result="accepted",
                    guest_name=invitation.name,
                    capacity=invitation.capacity,
                    admitted_count=invitation.admitted_count,
                    invitation_id=invitation.pk,
                )
            ScanLog.objects.create(
                result=ScanLog.Result.EXHAUSTED, invitation=invitation, admitted_after=invitation.admitted_count, **log_kwargs
            )
            return Verdict(
                result="exhausted",
                guest_name=invitation.name,
                capacity=invitation.capacity,
                admitted_count=invitation.admitted_count,
                previous_scans=_history(invitation),
                invitation_id=invitation.pk,
            )


def staff_membership(user, event: Event) -> Membership | None:
    return Membership.objects.filter(user=user, workspace=event.workspace, is_active=True).first()
