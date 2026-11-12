import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.events.models import Event
from apps.tenancy.models import WorkspaceOwnedModel

# How many people one card may admit. One number, used by the model, the API,
# the importers, the Excel template and the front end (frontend/src/api/types.ts).
MAX_CAPACITY = 20


def make_token() -> str:
    # 12 chars of URL-safe base64: 72 bits of entropy, short enough for an SMS.
    return secrets.token_urlsafe(9)


def card_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    return f"ws/{instance.workspace.slug}/events/{instance.event_id}/cards/{instance.token}.{ext}"


class Invitation(WorkspaceOwnedModel):
    class CardStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        GENERATING = "generating", "Generating"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="invitations")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, help_text="E.164")
    token = models.CharField(max_length=24, default=make_token, unique=True, editable=False)
    capacity = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(MAX_CAPACITY)])
    admitted_count = models.PositiveSmallIntegerField(default=0)
    card = models.ImageField(upload_to=card_upload_path, blank=True)
    card_status = models.CharField(max_length=12, choices=CardStatus.choices, default=CardStatus.PENDING)
    card_error = models.CharField(max_length=200, blank=True)
    view_count = models.PositiveIntegerField(default=0)
    first_viewed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("event", "phone")]
        ordering = ["name"]
        indexes = [models.Index(fields=["token"])]

    def __str__(self):
        return f"{self.name} ({self.phone})"

    @property
    def is_full(self):
        return self.admitted_count >= self.capacity

    @property
    def public_url(self):
        from django.conf import settings

        return f"{settings.SITE_URL}/i/{self.token}"


class Delivery(WorkspaceOwnedModel):
    """One row per message attempt. Resends get a higher sequence number."""

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        WHATSAPP = "whatsapp", "WhatsApp"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent to network"
        DELIVERED = "delivered", "Delivered"
        FAILED = "failed", "Failed"

    invitation = models.ForeignKey(Invitation, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    sequence = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    provider = models.CharField(max_length=16, blank=True)
    provider_message_id = models.CharField(max_length=80, blank=True, db_index=True)
    body = models.TextField(blank=True)
    error = models.CharField(max_length=300, blank=True)
    sent_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
