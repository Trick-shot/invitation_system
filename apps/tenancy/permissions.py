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
    real = Membership.objects.filter(user=user, workspace=workspace, is_active=True).select_related("workspace").first()
    if real is not None:
        return real
    # The platform owner inside a support session acts as an admin (read-only unless in edit mode).
    from .support import support_membership

    return support_membership(user, workspace)


def check_support_write(request, membership, view=None):
    """Support view is read-only. In edit mode, record what was changed for the client's summary."""
    from rest_framework.exceptions import PermissionDenied
    from rest_framework.permissions import SAFE_METHODS

    session = getattr(membership, "support", None)
    if session is None or request.method in SAFE_METHODS:
        return
    if session.mode != "edit":
        raise PermissionDenied("Support view is read-only. Enter edit mode to change anything.")
    from .support import log_change

    log_change(session, method=request.method, basename=getattr(view, "basename", "") or "", action=getattr(view, "action", "") or "")
