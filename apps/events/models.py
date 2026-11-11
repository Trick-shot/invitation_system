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


class MessageTemplate(WorkspaceOwnedModel):
    """Per-event message body. {name}, {link} and {event} are substituted at send time."""

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        WHATSAPP = "whatsapp", "WhatsApp"

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name="message")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    language = models.CharField(max_length=8, default="en")
    body = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    PLACEHOLDERS = ("{name}", "{link}", "{event}")

    def render(self, *, name: str, link: str) -> str:
        return self.body.replace("{name}", name).replace("{link}", link).replace("{event}", self.event.name)


DEFAULT_MESSAGES = {
    "wedding": "With great joy we invite you, {name}, to our wedding. Your invitation card: {link}",
    "communion": "We would be honoured to have you, {name}, at the first communion. Your invitation card: {link}",
    "graduation": "You are invited, {name}, to our graduation. Your invitation card: {link}",
    "other": "You are invited, {name}, to {event}. Your invitation card: {link}",
}
