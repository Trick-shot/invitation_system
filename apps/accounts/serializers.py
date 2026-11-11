from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.tenancy.models import MemberInvite, Membership

from .models import User


class WorkspaceBriefSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    logo = serializers.ImageField(read_only=True)
    default_country = serializers.CharField()
    default_language = serializers.CharField()


class MembershipBriefSerializer(serializers.ModelSerializer):
    workspace = WorkspaceBriefSerializer()

    class Meta:
        model = Membership
        fields = ("workspace", "role")


class MeSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "phone", "initials", "is_platform_owner", "memberships")
        read_only_fields = ("email", "is_platform_owner")

    def get_memberships(self, user):
        qs = user.memberships.filter(is_active=True, workspace__status="active").select_related("workspace")
        return MembershipBriefSerializer(qs, many=True).data


class MemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    initials = serializers.CharField(source="user.initials", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "email", "full_name", "phone", "initials", "role", "is_active", "created_at")
        read_only_fields = ("is_active", "created_at")


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    role = serializers.ChoiceField(choices=Membership.Role.choices)


class SetPasswordSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        invite = MemberInvite.objects.filter(token=attrs["token"]).select_related("user", "workspace").first()
        if invite is None or not invite.is_valid:
            raise serializers.ValidationError({"token": "This link has expired or was already used."})
        validate_password(attrs["password"], invite.user)
        attrs["invite"] = invite
        return attrs


class InviteInfoSerializer(serializers.Serializer):
    """What the set-password page shows before the form: who invited you, where."""

    workspace_name = serializers.CharField()
    invited_by = serializers.CharField(allow_blank=True)
    email = serializers.EmailField()
    full_name = serializers.CharField(allow_blank=True)
    valid = serializers.BooleanField()
