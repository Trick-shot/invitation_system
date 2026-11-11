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
    InviteInfoSerializer,
    InviteMemberSerializer,
    MemberSerializer,
    MeSerializer,
    SetPasswordSerializer,
)


class ThrottledTokenView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        ser = MeSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


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
        invite = invite_member(workspace=self.workspace, invited_by=request.user, **ser.validated_data)
        membership = Membership.objects.get(user=invite.user, workspace=self.workspace)
        return Response(MemberSerializer(membership).data, status=status.HTTP_201_CREATED)

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
        return Response({"detail": "Invite sent.", "expires_at": invite.expires_at})
