from django.http import Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .context import workspace_context
from .models import Workspace, WorkspaceCredential
from .permissions import ADMIN, active_membership, check_support_write
from .serializers import CredentialWriteSerializer, WorkspaceSettingsSerializer


class _AdminOnly(APIView):
    permission_classes = [IsAuthenticated]

    def load(self, request, slug) -> Workspace:
        ws = Workspace.objects.filter(slug=slug, status=Workspace.Status.ACTIVE).first()
        m = active_membership(request.user, ws) if ws else None
        if m is None:
            raise Http404
        if m.role != ADMIN:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only an admin can change workspace settings.")
        check_support_write(request, m)
        return ws


class WorkspaceSettingsView(_AdminOnly):
    def get(self, request, workspace_slug):
        ws = self.load(request, workspace_slug)
        return Response(WorkspaceSettingsSerializer(ws, context={"request": request}).data)

    def patch(self, request, workspace_slug):
        ws = self.load(request, workspace_slug)
        ser = WorkspaceSettingsSerializer(ws, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class WorkspaceCredentialView(_AdminOnly):
    """Write-only secrets. PUT stores, DELETE reverts to the platform account."""

    def put(self, request, workspace_slug):
        ws = self.load(request, workspace_slug)
        ser = CredentialWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(ws)
        return Response(WorkspaceSettingsSerializer(ws, context={"request": request}).data["messaging"])

    def delete(self, request, workspace_slug):
        ws = self.load(request, workspace_slug)
        WorkspaceCredential.objects.filter(workspace=ws).delete()
        return Response(status=204)


class WorkspaceExportView(_AdminOnly):
    """Everything the workspace owns, as JSON. The thing you will be asked for one day."""

    def get(self, request, workspace_slug):
        ws = self.load(request, workspace_slug)
        from apps.events.models import Event
        from apps.invitations.models import Invitation

        with workspace_context(ws):
            events = list(Event.objects.values("id", "name", "kind", "date", "venue", "status"))
            guests = list(Invitation.objects.values("event_id", "name", "phone", "capacity", "admitted_count", "view_count", "created_at"))
        return Response({"workspace": ws.name, "events": events, "guests": guests})


class WorkspaceActivityView(_AdminOnly):
    """Support visits and changes, as the client sees them."""

    def get(self, request, workspace_slug):
        from .models import AuditEvent

        ws = self.load(request, workspace_slug)
        rows = AuditEvent.objects.filter(workspace=ws).select_related("actor")[:50]
        return Response([{"kind": r.kind, "summary": r.summary, "reason": r.reason, "at": r.created_at} for r in rows])
