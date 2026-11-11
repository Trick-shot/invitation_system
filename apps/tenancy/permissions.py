from rest_framework.permissions import BasePermission

from .models import Membership

ADMIN = Membership.Role.ADMIN
COORDINATOR = Membership.Role.COORDINATOR
DOOR_STAFF = Membership.Role.DOOR_STAFF

MANAGERS = {ADMIN, COORDINATOR}
EVERYONE = {ADMIN, COORDINATOR, DOOR_STAFF}


class IsPlatformOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_owner)


def active_membership(user, workspace):
    if not user or not user.is_authenticated:
        return None
    return Membership.objects.filter(user=user, workspace=workspace, is_active=True).select_related("workspace").first()
