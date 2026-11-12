from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.tenancy.models import WorkspaceOwnedModel


def template_upload_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower()
    return f"ws/{instance.workspace.slug}/events/{instance.event_id}/template.{ext}"


class Event(WorkspaceOwnedModel):
    class Kind(models.TextChoices):
        WEDDING = "wedding", "Wedding"
        COMMUNION = "communion", "First communion or confirmation"
        GRADUATION = "graduation", "Graduation"
        OTHER = "other", "Something else"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Doors open"
        CLOSED = "closed", "Closed"

    name = models.CharField(max_length=140)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.OTHER)
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    venue = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)

    class GuestBand(models.TextChoices):
        UNDER_100 = "under_100", "Under 100"
        TO_300 = "100_300", "100 to 300"
        TO_1000 = "300_1000", "300 to 1,000"
        OVER_1000 = "over_1000", "More than 1,000"

    # Asked during onboarding so Trickshot can see how big events are getting and plan SMS volume.
    guests_estimate_band = models.CharField(max_length=10, choices=GuestBand.choices, blank=True)
    guests_estimate = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.name


class CardTemplate(WorkspaceOwnedModel):
    """
    The template image and where the QR goes on it. Slot values are
    fractions of the image (0 to 1) so they stay correct at any resolution.
    """

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name="template")
    image = models.ImageField(upload_to=template_upload_path)
    width = models.PositiveIntegerField(editable=False, default=0)
    height = models.PositiveIntegerField(editable=False, default=0)
    slot_x = models.FloatField(default=0.375, validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    slot_y = models.FloatField(default=0.6, validators=[MinValueValidator(0.0), MaxValueValidator(1.0)])
    slot_size = models.FloatField(
        default=0.25, validators=[MinValueValidator(0.05), MaxValueValidator(1.0)], help_text="QR edge as a fraction of image width"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def slot_pixels(self) -> tuple[int, int, int]:
        size = int(round(self.width * self.slot_size))
        x = int(round(self.width * self.slot_x))
        y = int(round(self.height * self.slot_y))
        # Keep the slot inside the image whatever the admin dragged.
        x = max(0, min(x, self.width - size))
        y = max(0, min(y, self.height - size))
        return x, y, size

    def save(self, *args, **kwargs):
        if self.image and (not self.width or not self.height):
            from PIL import Image

            with Image.open(self.image) as im:
                self.width, self.height = im.size
        super().save(*args, **kwargs)


DEFAULT_WELCOME = "Welcome, {name}. You have arrived at {event}. Enjoy the celebration."


class MessageTemplate(WorkspaceOwnedModel):
    """Per-event message body. {name}, {link} and {event} are substituted at send time."""

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        WHATSAPP = "whatsapp", "WhatsApp"

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name="message")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    language = models.CharField(max_length=8, default="en")
    body = models.TextField()
    # Sent once per card, when the first person on it is admitted at the door.
    welcome_enabled = models.BooleanField(default=True)
    welcome_body = models.TextField(default=DEFAULT_WELCOME)
    updated_at = models.DateTimeField(auto_now=True)

    PLACEHOLDERS = ("{name}", "{link}", "{event}")

    def render(self, *, name: str, link: str) -> str:
        return self.body.replace("{name}", name).replace("{link}", link).replace("{event}", self.event.name)

    def render_welcome(self, *, name: str) -> str:
        return self.welcome_body.replace("{name}", name).replace("{event}", self.event.name).strip()


DEFAULT_MESSAGES = {
    "wedding": "With great joy we invite you, {name}, to our wedding. Your invitation card: {link}",
    "communion": "We would be honoured to have you, {name}, at the first communion. Your invitation card: {link}",
    "graduation": "You are invited, {name}, to our graduation. Your invitation card: {link}",
    "other": "You are invited, {name}, to {event}. Your invitation card: {link}",
}
