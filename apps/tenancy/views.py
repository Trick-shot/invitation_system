"""
The base viewset every tenant endpoint inherits. It resolves the workspace
from the URL, verifies the caller's membership, sets the workspace context
for the life of the request, scopes the queryset and injects the workspace
on create. A developer writing an ordinary ModelViewSet cannot forget any of
this, because they never write it.
"""

from django.http import Http404
from rest_framework import viewsets
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from .context import reset_current_workspace, set_current_workspace
from .models import Workspace
from .permissions import EVERYONE, MANAGERS, active_membership


class WorkspaceScopedMixin:
    workspace_url_kwarg = "workspace_slug"
    # Roles allowed per action. Anything not listed falls back to `default_roles`.
    role_map: dict = {}
    default_roles = MANAGERS

    def initial(self, request, *args, **kwargs):
        # Authenticate first so an anonymous caller gets 401, not a misleading 404.
        if not request.user or not request.user.is_authenticated:
            raise NotAuthenticated()
        slug = kwargs.get(self.workspace_url_kwarg)
        workspace = Workspace.objects.filter(slug=slug, status=Workspace.Status.ACTIVE).first()
        membership = active_membership(request.user, workspace) if workspace else None
        if membership is None:
            # 404, not 403: a non-member must not learn that the workspace exists.
            raise Http404
        self.workspace = workspace
        self.membership = membership
        self._ws_token = set_current_workspace(workspace)
        super().initial(request, *args, **kwargs)
        allowed = self.role_map.get(self.action, self.default_roles)
        if membership.role not in allowed:
            raise PermissionDenied("Your role cannot do this.")

    def finalize_response(self, request, response, *args, **kwargs):
        token = getattr(self, "_ws_token", None)
        if token is not None:
            reset_current_workspace(token)
            self._ws_token = None
        return super().finalize_response(request, response, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        # Belt and braces: the manager already scopes, this makes it visible.
        return qs.filter(workspace=self.workspace)

    def perform_create(self, serializer):
        serializer.save(workspace=self.workspace)


class WorkspaceViewSet(WorkspaceScopedMixin, viewsets.ModelViewSet):
    pass


class WorkspaceReadOnlyViewSet(WorkspaceScopedMixin, viewsets.ReadOnlyModelViewSet):
    default_roles = EVERYONE
