from rest_framework import serializers

from apps.messaging.service import sms_segments

from .models import CardTemplate, Event, MessageTemplate


class EventSerializer(serializers.ModelSerializer):
    invitation_count = serializers.IntegerField(read_only=True)
    people_expected = serializers.IntegerField(read_only=True)
    people_arrived = serializers.IntegerField(read_only=True)
    has_template = serializers.SerializerMethodField()
    has_message = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "name",
            "kind",
            "date",
            "start_time",
            "venue",
            "status",
            "guests_estimate_band",
            "guests_estimate",
            "invitation_count",
            "people_expected",
            "people_arrived",
            "has_template",
            "has_message",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_has_template(self, obj):
        return getattr(obj, "has_template", None) if hasattr(obj, "has_template") else CardTemplate.objects.filter(event=obj).exists()

    def get_has_message(self, obj):
        return getattr(obj, "has_message", None) if hasattr(obj, "has_message") else MessageTemplate.objects.filter(event=obj).exists()


class CardTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardTemplate
        fields = ("id", "image", "width", "height", "slot_x", "slot_y", "slot_size", "updated_at")
        read_only_fields = ("width", "height", "updated_at")


class MessageTemplateSerializer(serializers.ModelSerializer):
    segments = serializers.SerializerMethodField()
    preview = serializers.SerializerMethodField()
    welcome_segments = serializers.SerializerMethodField()
    welcome_preview = serializers.SerializerMethodField()

    class Meta:
        model = MessageTemplate
        fields = ("id", "channel", "language", "body", "segments", "preview", "welcome_enabled", "welcome_body", "welcome_segments", "welcome_preview", "updated_at")
        read_only_fields = ("updated_at",)

    def validate_body(self, body):
        if "{link}" not in body:
            raise serializers.ValidationError("The message must contain {link}, or guests cannot open their card.")
        return body

    def validate(self, attrs):
        enabled = attrs.get("welcome_enabled", getattr(self.instance, "welcome_enabled", True))
        body = attrs.get("welcome_body", getattr(self.instance, "welcome_body", "x"))
        if enabled and not (body or "").strip():
            raise serializers.ValidationError({"welcome_body": "Write the welcome message, or turn it off."})
        if "{link}" in (body or ""):
            raise serializers.ValidationError({"welcome_body": "The welcome message has no link to insert. Remove {link}."})
        return attrs

    def get_welcome_segments(self, obj):
        return sms_segments(obj.render_welcome(name="Amina Hassan"))

    def get_welcome_preview(self, obj):
        return obj.render_welcome(name="Amina Hassan")

    def get_segments(self, obj):
        sample = obj.render(name="Amina Hassan", link="https://trickshot.tech/i/x7k2mq9f")
        return sms_segments(sample)

    def get_preview(self, obj):
        return obj.render(name="Amina Hassan", link="https://trickshot.tech/i/x7k2mq9f")
