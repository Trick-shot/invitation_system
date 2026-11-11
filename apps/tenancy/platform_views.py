from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import viewsets

from .models import Workspace
from .permissions import IsPlatformOwner
from .serializers import PlatformWorkspaceSerializer


class PlatformWorkspaceViewSet(viewsets.ModelViewSet):
    """Platform owner's list. Counts only; never joins into guest tables."""

    permission_classes = [IsPlatformOwner]
    serializer_class = PlatformWorkspaceSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        from apps.events.models import Event

        events_all = (
            Event.objects.all_workspaces()
            .filter(workspace=OuterRef("pk"))
            .order_by()
            .values("workspace")
            .annotate(n=Count("id"))
            .values("n")
        )
        events_open = (
            Event.objects.all_workspaces()
            .filter(workspace=OuterRef("pk"), status=Event.Status.OPEN)
            .order_by()
            .values("workspace")
            .annotate(n=Count("id"))
            .values("n")
        )
        return Workspace.objects.annotate(
            members=Count("memberships", filter=Q(memberships__is_active=True), distinct=True),
            events=Coalesce(Subquery(events_all, output_field=IntegerField()), 0),
            events_open=Coalesce(Subquery(events_open, output_field=IntegerField()), 0),
        ).order_by("name")
