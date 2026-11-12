import uuid

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

from .managers import WorkspaceManager


class Workspace(models.Model):
    """The tenant. Everything else hangs off one of these."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=60, unique=True)
    logo = models.ImageField(upload_to="workspaces/logos/", blank=True)
    timezone = models.CharField(max_length=64, default="Africa/Dar_es_Salaam")
    default_country = models.CharField(max_length=2, default="TZ", help_text="ISO 3166 alpha-2, used to normalise phone numbers")
    default_language = models.CharField(max_length=8, default="en")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class WorkspaceOwnedModel(models.Model):
    """
    Abstract base for every tenant-owned table. Carries the workspace FK and
    the scoped default manager. There is no way to make a tenant model
    without inheriting this, which is the point.
    """

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="+", editable=False)

    objects = WorkspaceManager()

    class Meta:
        abstract = True


class Membership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        COORDINATOR = "coordinator", "Coordinator"
        DOOR_STAFF = "door_staff", "Door staff"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Role.choices)
    is_active = models.BooleanField(default=False, help_text="Activates once the member has set a password")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "workspace")]

    def __str__(self):
        return f"{self.user} as {self.role} in {self.workspace}"


def _fernet():
    key = settings.FIELD_ENCRYPTION_KEY
    if not key:
        raise RuntimeError("FIELD_ENCRYPTION_KEY is not set; cannot store credentials")
    return Fernet(key.encode() if isinstance(key, str) else key)


class WorkspaceCredential(models.Model):
    """
    Per-workspace messaging credentials, encrypted at rest. Absent row means
    the platform account is used. Secrets are write-only through the API.
    """

    class Provider(models.TextChoices):
        BEEM = "beem", "Beem Africa"

    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name="credential")
    provider = models.CharField(max_length=16, choices=Provider.choices, default=Provider.BEEM)
    sender_id = models.CharField(max_length=11, blank=True)
    api_key_enc = models.BinaryField(blank=True)
    secret_key_enc = models.BinaryField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.workspace} {self.provider} credentials"

    def set_secrets(self, api_key: str, secret_key: str):
        f = _fernet()
        self.api_key_enc = f.encrypt(api_key.encode())
        self.secret_key_enc = f.encrypt(secret_key.encode())

    def get_secrets(self) -> tuple[str, str]:
        f = _fernet()
        try:
            return f.decrypt(bytes(self.api_key_enc)).decode(), f.decrypt(bytes(self.secret_key_enc)).decode()
        except InvalidToken as exc:
            raise RuntimeError("Credential cannot be decrypted; was FIELD_ENCRYPTION_KEY rotated?") from exc

    @property
    def api_key_masked(self) -> str:
        try:
            key, _ = self.get_secrets()
        except RuntimeError:
            return ""
        return f"{key[:4]}…{key[-2:]}" if len(key) > 8 else "••••"


class UsageRecord(models.Model):
    """Messages sent per workspace per month. Billing and limits read this."""

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="usage")
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    channel = models.CharField(max_length=16)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [("workspace", "year", "month", "channel")]

    def __str__(self):
        return f"{self.workspace} {self.year}-{self.month:02d} {self.channel}: {self.count}"


class MemberInvite(models.Model):
    """
    One-time set-password link for a new member. Created by an admin (or by
    the platform owner for a workspace's first admin), consumed exactly once.
    """

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invites")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="invites")
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invite for {self.user} to {self.workspace}"

    @property
    def is_valid(self):
        from django.utils import timezone

        return self.used_at is None and self.expires_at > timezone.now()


class SupportSession(models.Model):
    """
    The platform owner looking at a client's workspace to help them.
    View mode is read-only. Edit mode needs a reason and ends on its own after 30 minutes.
    Decided 12 Nov 2026 (project doc claude/platform-owner.md).
    """

    class Mode(models.TextChoices):
        VIEW = "view", "Support view"
        EDIT = "edit", "Edit mode"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_sessions")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="support_sessions")
    mode = models.CharField(max_length=4, choices=Mode.choices, default=Mode.VIEW)
    reason = models.CharField(max_length=300, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    summary_sent = models.BooleanField(default=False)

    class Meta:
        ordering = ["-started_at"]

    @property
    def is_active(self) -> bool:
        from django.utils import timezone

        return self.ended_at is None and self.expires_at > timezone.now()


class AuditEvent(models.Model):
    """What the client sees in their activity: support visits, edits made in edit mode, details changed."""

    class Kind(models.TextChoices):
        SUPPORT_VIEW = "support_view", "Support viewed the workspace"
        SUPPORT_EDIT = "support_edit", "Support entered edit mode"
        SUPPORT_CHANGE = "support_change", "Support changed something"
        SUPPORT_END = "support_end", "Support left"
        DETAILS_CHANGED = "details_changed", "Workspace details changed"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    summary = models.CharField(max_length=300)
    reason = models.CharField(max_length=300, blank=True)
    session = models.ForeignKey(SupportSession, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
