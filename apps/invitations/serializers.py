from rest_framework import serializers

from .models import MAX_CAPACITY, Delivery, Invitation
from .phones import PhoneError, normalise, pretty


class DeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = Delivery
        fields = ("id", "channel", "sequence", "status", "provider", "error", "created_at", "updated_at")


class InvitationSerializer(serializers.ModelSerializer):
    phone_display = serializers.SerializerMethodField()
    last_delivery = serializers.SerializerMethodField()
    public_url = serializers.CharField(read_only=True)
    initials = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            "id",
            "name",
            "phone",
            "phone_display",
            "initials",
            "capacity",
            "admitted_count",
            "card",
            "card_status",
            "card_error",
            "view_count",
            "first_viewed_at",
            "notes",
            "token",
            "public_url",
            "last_delivery",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "admitted_count",
            "card",
            "card_status",
            "card_error",
            "view_count",
            "first_viewed_at",
            "token",
            "created_at",
            "updated_at",
        )

    def get_phone_display(self, obj):
        return pretty(obj.phone)

    def get_initials(self, obj):
        parts = [p for p in obj.name.split() if p]
        return "".join(p[0] for p in parts[:2]).upper()

    def get_last_delivery(self, obj):
        d = getattr(obj, "_last_delivery", None)
        if d is None:
            d = obj.deliveries.order_by("-sequence").first()
        return DeliverySerializer(d).data if d else None

    def validate_phone(self, value):
        workspace = self.context["workspace"]
        try:
            return normalise(value, workspace.default_country)
        except PhoneError as exc:
            raise serializers.ValidationError(str(exc))

    def validate(self, attrs):
        event = self.context["event"]
        phone = attrs.get("phone")
        if phone:
            qs = Invitation.objects.filter(event=event, phone=phone)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"phone": "This number is already on the guest list for this event."})
        return attrs


class ImportPreviewSerializer(serializers.Serializer):
    source = serializers.ChoiceField(choices=["paste", "csv", "xlsx", "vcard", "rows"])
    text = serializers.CharField(required=False, allow_blank=True)
    file = serializers.FileField(required=False)
    rows = serializers.ListField(child=serializers.DictField(), required=False)


class ImportCommitRowSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    capacity = serializers.IntegerField(min_value=1, max_value=MAX_CAPACITY, default=1)


class ImportCommitSerializer(serializers.Serializer):
    rows = ImportCommitRowSerializer(many=True)


class SendSerializer(serializers.Serializer):
    invitation_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    only_unsent = serializers.BooleanField(default=False)
    only_failed = serializers.BooleanField(default=False)
