"""
SMS billing. Decided 12 Nov 2026 (project doc claude/sms-billing.md):

- One SmsCharge row per SMS that the provider accepted. Rejected sends cost nothing.
- Segments, not messages: that is what Beem charges for.
- The rates are copied onto each row when it is written, so changing rates
  later never rewrites a past bill.
- Each event has a bill: Open, then Invoiced, then Paid. The platform owner moves it.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.tenancy.models import WorkspaceOwnedModel


class SmsRates(models.Model):
    """One row (pk=1). What Beem charges Trickshot, and what Trickshot charges every client."""

    cost_per_sms = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("25"))
    price_per_sms = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("35"))
    currency = models.CharField(max_length=3, default="TZS")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        verbose_name_plural = "SMS rates"

    @classmethod
    def current(cls) -> "SmsRates":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SmsCharge(WorkspaceOwnedModel):
    class Kind(models.TextChoices):
        INVITATION = "invitation", "Invitation"
        RESEND = "resend", "Resend"
        WELCOME = "welcome", "Welcome text"
        STAFF_INVITE = "staff_invite", "Staff invite"
        ACCOUNT = "account", "Account message"

    event = models.ForeignKey("events.Event", null=True, blank=True, on_delete=models.SET_NULL, related_name="sms_charges")
    invitation = models.ForeignKey("invitations.Invitation", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    recipient = models.CharField(max_length=160, blank=True, help_text="Name at send time, so the bill reads well even if the guest is removed")
    segments = models.PositiveSmallIntegerField(default=1)
    cost_per_sms = models.DecimalField(max_digits=8, decimal_places=2)
    price_per_sms = models.DecimalField(max_digits=8, decimal_places=2)
    provider_message_id = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["workspace", "event"]), models.Index(fields=["event", "kind"])]

    @property
    def cost(self) -> Decimal:
        return self.cost_per_sms * self.segments

    @property
    def amount(self) -> Decimal:
        return self.price_per_sms * self.segments


class EventBill(WorkspaceOwnedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        INVOICED = "invoiced", "Invoiced"
        PAID = "paid", "Paid"

    event = models.OneToOneField("events.Event", on_delete=models.CASCADE, related_name="bill")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    invoiced_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class RetiredTotal(models.Model):
    """
    SMS money from workspaces that have been deleted, one row per month, with no
    client attached. The client's data goes; the owner's own earnings history stays true.
    """

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    sms = models.PositiveIntegerField(default=0)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    billed = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    class Meta:
        unique_together = [("year", "month")]

    def __str__(self):
        return f"Retired {self.year}-{self.month:02d}: {self.sms} SMS"
