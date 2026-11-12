from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.tenancy.models import MemberInvite, Membership
from apps.tenancy.permissions import ADMIN, MANAGERS
from apps.tenancy.views import WorkspaceScopedMixin

from .invites import consume_invite, invite_member
from .serializers import (
    ForgotPasswordSerializer,
    InviteInfoSerializer,
    InviteMemberSerializer,
    MemberSerializer,
    MeSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
)


class ThrottledTokenView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(APIView):
    """POST email + password: creates the user, a workspace they own, and an admin
    membership, then returns tokens so the app can sign them straight in."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        from django.db import transaction
        from django.utils.text import slugify
        from rest_framework_simplejwt.tokens import RefreshToken

        from apps.tenancy.models import Workspace

        from .models import User

        email = ser.validated_data["email"]
        full_name = ser.validated_data.get("full_name", "")
        with transaction.atomic():
            user, _ = User.objects.get_or_create(email=email, defaults={"full_name": full_name})
            if full_name and not user.full_name:
                user.full_name = full_name
            user.set_password(ser.validated_data["password"])
            user.save()
            # Invited but never finished set-password: activate what they were invited to
            # instead of giving them a second, empty workspace.
            pending = Membership.objects.filter(user=user)
            if pending.exists():
                pending.update(is_active=True)
                ws = pending.select_related("workspace").order_by("id").first().workspace
                refresh = RefreshToken.for_user(user)
                return Response(
                    {"access": str(refresh.access_token), "refresh": str(refresh), "workspace": ws.slug}, status=status.HTTP_201_CREATED
                )
            local = email.split("@")[0]
            display = (full_name.split()[0] if full_name else local).strip()
            base = slugify(local)[:40] or "workspace"
            slug, n = base, 2
            while Workspace.objects.filter(slug=slug).exists():
                slug, n = f"{base}-{n}", n + 1
            ws = Workspace.objects.create(slug=slug, name=f"{display}'s workspace")
            Membership.objects.create(user=user, workspace=ws, role=ADMIN, is_active=True)
        refresh = RefreshToken.for_user(user)
        return Response(
            {"access": str(refresh.access_token), "refresh": str(refresh), "workspace": ws.slug}, status=status.HTTP_201_CREATED
        )


class ForgotPasswordView(APIView):
    """Always answers 200 so the form cannot be used to check which emails exist.
    When the email has a workspace, a fresh set-password link is sent the same way invites are."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        ser = ForgotPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        from django.utils import timezone

        from .invites import INVITE_TTL, deliver_invite
        from .models import User

        user = User.objects.filter(email__iexact=User.objects.normalize_email(ser.validated_data["email"])).first()
        membership = user.memberships.filter(workspace__status="active").order_by("id").first() if user else None
        if membership:
            invite = MemberInvite.objects.create(user=user, workspace=membership.workspace, expires_at=timezone.now() + INVITE_TTL)
            deliver_invite(invite, kind="reset")
        return Response({"detail": "If that email has an account, a link to set a new password is on its way."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        ser = MeSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class PasswordChangeView(APIView):
    """Change your own password while signed in: the current one, then the new one."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""
        if not request.user.check_password(current):
            return Response({"current_password": ["That is not your current password."]}, status=400)
        try:
            validate_password(new, request.user)
        except DjangoValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=400)
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        return Response(status=204)


class InviteView(APIView):
    """GET shows who the invite is for; POST sets the password and activates."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def get(self, request, token):
        invite = MemberInvite.objects.filter(token=token).select_related("user", "workspace", "invited_by").first()
        if invite is None:
            return Response(status=404)
        data = {
            "workspace_name": invite.workspace.name,
            "invited_by": str(invite.invited_by) if invite.invited_by else "",
            "email": invite.user.email,
            "full_name": invite.user.full_name,
            "valid": invite.is_valid,
        }
        return Response(InviteInfoSerializer(data).data)

    def post(self, request, token):
        ser = SetPasswordSerializer(
            data={
                "token": token,
                "password": request.data.get("password", ""),
                "full_name": request.data.get("full_name", ""),
            }
        )
        ser.is_valid(raise_exception=True)
        try:
            consume_invite(ser.validated_data["invite"], ser.validated_data["password"], ser.validated_data["full_name"])
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response({"detail": "Password set. You can sign in now."})


class MemberViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    """Members of one workspace. Admins manage; coordinators may list."""

    serializer_class = MemberSerializer
    queryset = Membership.objects.select_related("user").order_by("role", "user__full_name")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    role_map = {"list": MANAGERS, "retrieve": MANAGERS}
    default_roles = {ADMIN}

    def create(self, request, *args, **kwargs):
        ser = InviteMemberSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        if data.get("phone"):
            # Same rule as guest numbers: 0712 345 678 becomes +255712345678. The SMS
            # provider rejects anything else, which used to break the whole invite.
            from rest_framework.exceptions import ValidationError

            from apps.invitations.phones import PhoneError, normalise

            try:
                data["phone"] = normalise(data["phone"], self.workspace.default_country or "TZ")
            except PhoneError as exc:
                raise ValidationError({"phone": [f"{exc}. Use a number like 0712 345 678 or +255 712 345 678."]})
        invite = invite_member(workspace=self.workspace, invited_by=request.user, **data)
        membership = Membership.objects.get(user=invite.user, workspace=self.workspace)
        return Response({**MemberSerializer(membership).data, "delivery": getattr(invite, "delivery", {})}, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.user_id == self.request.user.id:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("You cannot remove yourself. Ask another admin.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="resend-invite")
    def resend_invite(self, request, *args, **kwargs):
        membership = self.get_object()
        invite = invite_member(
            workspace=self.workspace,
            email=membership.user.email,
            role=membership.role,
            invited_by=request.user,
        )
        return Response({"detail": "Invite sent.", "expires_at": invite.expires_at, "delivery": getattr(invite, "delivery", {})})
