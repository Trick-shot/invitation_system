from django.db.models import Q
from django.http import Http404
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.events.models import Event
from apps.invitations.models import Invitation
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Membership
from apps.tenancy.permissions import MANAGERS
from apps.tenancy.views import WorkspaceReadOnlyViewSet

from .models import ScanLog
from .service import admit, staff_membership


class ScanSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    token = serializers.CharField(max_length=24, required=False)
    invitation_id = serializers.IntegerField(required=False)
    device_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    scanned_at = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("token") and not attrs.get("invitation_id"):
            raise serializers.ValidationError("token or invitation_id is required")
        return attrs


def _event_for_staff(user, event_id) -> Event:
    """An event the user may scan for, or 404. No cross-tenant hints."""
    event = Event.objects.all_workspaces().select_related("workspace").filter(pk=event_id).first()
    if event is None or staff_membership(user, event) is None:
        raise Http404
    return event


class ScanEventsView(APIView):
    """Events the signed-in staff member can scan for, across their workspaces."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ws_ids = Membership.objects.filter(user=request.user, is_active=True).values_list("workspace_id", flat=True)
        events = (
            Event.objects.all_workspaces()
            .filter(workspace_id__in=ws_ids)
            .exclude(status=Event.Status.CLOSED)
            .select_related("workspace")
            .order_by("date")
        )
        return Response(
            [
                {"id": e.id, "name": e.name, "date": e.date, "venue": e.venue, "status": e.status, "workspace": e.workspace.name}
                for e in events
            ]
        )


class ScanView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "scan"

    def post(self, request):
        ser = ScanSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        event = _event_for_staff(request.user, d["event_id"])
        scanned_at = parse_datetime(d.get("scanned_at") or "") if d.get("scanned_at") else None
        invitation = None
        manual = False
        if d.get("invitation_id"):
            with workspace_context(event.workspace):
                invitation = Invitation.objects.filter(pk=d["invitation_id"], event=event).first()
            if invitation is None:
                raise Http404
            manual = True
        verdict = admit(
            event=event,
            token=d.get("token"),
            invitation=invitation,
            staff=request.user,
            device_id=d["device_id"],
            scanned_at=scanned_at,
            manual=manual,
        )
        with workspace_context(event.workspace):
            arrived = sum(Invitation.objects.filter(event=event).values_list("admitted_count", flat=True))
        return Response({**verdict.as_dict(), "event_arrived": arrived})


class ScanSearchView(APIView):
    """Find a guest by name when a card is lost. Every manual admit is flagged in the log."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "scan"

    def get(self, request):
        event = _event_for_staff(request.user, request.query_params.get("event_id"))
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response([])
        with workspace_context(event.workspace):
            rows = Invitation.objects.filter(event=event).filter(Q(name__icontains=q) | Q(phone__icontains=q))[:10]
            return Response(
                [{"id": i.id, "name": i.name, "phone": i.phone, "capacity": i.capacity, "admitted_count": i.admitted_count} for i in rows]
            )


class ScanLogViewSet(WorkspaceReadOnlyViewSet):
    """The admin's scan log for one event."""

    default_roles = MANAGERS
    role_map = {"list": MANAGERS, "retrieve": MANAGERS}

    def get_queryset(self):
        return ScanLog.objects.filter(workspace=self.workspace, event_id=self.kwargs["event_pk"]).select_related("staff", "invitation")

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        data = [
            {
                "id": s.id,
                "at": s.created_at,
                "result": s.result,
                "manual": s.manual,
                "device_id": s.device_id,
                "staff": (s.staff.full_name or s.staff.email) if s.staff else "",
                "guest": s.invitation.name if s.invitation else "",
                "admitted_after": s.admitted_after,
            }
            for s in page
        ]
        return self.get_paginated_response(data)
