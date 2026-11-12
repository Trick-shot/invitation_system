from django.utils.text import slugify
from rest_framework import serializers

from .models import UsageRecord, Workspace, WorkspaceCredential


class WorkspaceSettingsSerializer(serializers.ModelSerializer):
    """What a workspace admin can see and change about their own workspace."""

    messaging = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ("name", "slug", "logo", "timezone", "default_country", "default_language", "messaging")
        read_only_fields = ("slug",)

    def get_messaging(self, ws):
        cred = getattr(ws, "credential", None)
        if cred is None or not cred.api_key_enc:
            return {"mode": "platform", "sender_id": "", "api_key_masked": ""}
        return {"mode": "own", "provider": cred.provider, "sender_id": cred.sender_id, "api_key_masked": cred.api_key_masked}


class CredentialWriteSerializer(serializers.Serializer):
    sender_id = serializers.CharField(max_length=11)
    api_key = serializers.CharField(write_only=True)
    secret_key = serializers.CharField(write_only=True)

    def save(self, workspace):
        cred, _ = WorkspaceCredential.objects.get_or_create(workspace=workspace)
        cred.sender_id = self.validated_data["sender_id"]
        cred.set_secrets(self.validated_data["api_key"], self.validated_data["secret_key"])
        cred.save()
        return cred


class PlatformWorkspaceSerializer(serializers.ModelSerializer):
    """Counts and usage only. No guest data, by design."""

    admin_email = serializers.EmailField(write_only=True, required=False)
    admin_name = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    admin_phone = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    members = serializers.IntegerField(read_only=True)
    events = serializers.IntegerField(read_only=True)
    events_open = serializers.IntegerField(read_only=True)
    messages_this_month = serializers.SerializerMethodField()
    sms_this_month = serializers.SerializerMethodField()
    contact = serializers.SerializerMethodField()
    sends_on = serializers.SerializerMethodField()
    last_active = serializers.SerializerMethodField()
    setup = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            "id",
            "name",
            "slug",
            "status",
            "default_country",
            "default_language",
            "created_at",
            "members",
            "events",
            "events_open",
            "messages_this_month",
            "sms_this_month",
            "contact",
            "sends_on",
            "last_active",
            "setup",
            "admin_email",
            "admin_name",
            "admin_phone",
        )
        read_only_fields = ("slug", "created_at")

    def get_messages_this_month(self, ws):
        from django.utils import timezone

        now = timezone.now()
        return sum(UsageRecord.objects.filter(workspace=ws, year=now.year, month=now.month).values_list("count", flat=True))

    def get_sms_this_month(self, ws):
        from apps.billing.service import sms_this_month

        return sms_this_month(ws)

    def get_contact(self, ws):
        """The first admin: the person to call. Name, email and phone, read-only here."""
        m = ws.memberships.filter(role="admin").select_related("user").order_by("-is_active", "created_at").first()
        if m is None:
            return None
        u = m.user
        return {"name": (u.full_name or "").strip(), "email": u.email, "phone": u.phone, "user_id": u.pk}

    def get_sends_on(self, ws):
        return "own_keys" if getattr(ws, "credential", None) else "platform"

    def get_last_active(self, ws):
        from django.db.models import Max

        return ws.memberships.aggregate(t=Max("user__last_login"))["t"]

    def get_setup(self, ws):
        if not ws.memberships.filter(is_active=True, role="admin").exists():
            return "invite_not_accepted"
        return "complete" if getattr(ws, "events", 0) else "no_events"

    def create(self, validated):
        admin_email = validated.pop("admin_email", None)
        admin_name = validated.pop("admin_name", "")
        admin_phone = validated.pop("admin_phone", "")
        base = slugify(validated["name"])[:50] or "workspace"
        slug, n = base, 2
        while Workspace.objects.filter(slug=slug).exists():
            slug, n = f"{base}-{n}", n + 1
        ws = Workspace.objects.create(slug=slug, **validated)
        if admin_email:
            from apps.accounts.invites import invite_member

            invite_member(
                workspace=ws,
                email=admin_email,
                role="admin",
                full_name=admin_name,
                phone=admin_phone,
                invited_by=self.context["request"].user,
            )
        return ws
