from django.conf import settings
from django.db import models

from apps.events.models import Event
from apps.invitations.models import Invitation
from apps.tenancy.models import WorkspaceOwnedModel


class ScanLog(WorkspaceOwnedModel):
    """One row per scan attempt, accepted or not. This is the audit trail."""

    class Result(models.TextChoices):
        ACCEPTED = "accepted", "Admitted"
        EXHAUSTED = "exhausted", "Already fully admitted"
        UNKNOWN = "unknown", "Not recognised"
        WRONG_EVENT = "wrong_event", "Belongs to another event"
        CLOSED = "closed", "Event is not open"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="scans")
    invitation = models.ForeignKey(Invitation, null=True, blank=True, on_delete=models.SET_NULL, related_name="scans")
    staff = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="scans")
    device_id = models.CharField(max_length=64, blank=True)
    scanned_at = models.DateTimeField(help_text="Device time; server time is created_at")
    created_at = models.DateTimeField(auto_now_add=True)
    result = models.CharField(max_length=12, choices=Result.choices)
    manual = models.BooleanField(default=False, help_text="Admitted by name search rather than a scan")
    admitted_after = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]
