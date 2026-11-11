from django.db.models import Count, Exists, OuterRef, Sum
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.invitations.models import Invitation
from apps.tenancy.permissions import EVERYONE, MANAGERS
from apps.tenancy.views import WorkspaceViewSet

from .dashboard import build_dashboard
from .models import DEFAULT_MESSAGES, CardTemplate, Event, MessageTemplate
from .serializers import (
    CardTemplateSerializer,
    EventSerializer,
    MessageTemplateSerializer,
)


class EventViewSet(WorkspaceViewSet):
    serializer_class = EventSerializer
    role_map = {"list": EVERYONE, "retrieve": EVERYONE, "dashboard": MANAGERS}

    def get_queryset(self):
        return (
            Event.objects.filter(workspace=self.workspace)
            .annotate(
                invitation_count=Count("invitations", distinct=True),
                people_expected=Coalesce(Sum("invitations__capacity"), 0),
                people_arrived=Coalesce(Sum("invitations__admitted_count"), 0),
                has_template=Exists(CardTemplate.objects.filter(event=OuterRef("pk"))),
                has_message=Exists(MessageTemplate.objects.filter(event=OuterRef("pk"))),
            )
            .order_by("-date", "-id")
        )

    def perform_create(self, serializer):
        event = serializer.save(workspace=self.workspace)
        # A starter message so step 4 of onboarding is never a blank box.
        body = DEFAULT_MESSAGES.get(event.kind) or DEFAULT_MESSAGES["other"]
        MessageTemplate.objects.create(workspace=self.workspace, event=event, language="en", body=body)

    @action(detail=True, methods=["get"])
    def dashboard(self, request, *args, **kwargs):
        event = self.get_object()
        return Response(build_dashboard(event))

    # Template and message are one-to-one with the event; expose them as
    # sub-resources with GET and PUT rather than separate list endpoints.

    @action(detail=True, methods=["get", "put", "patch", "delete"])
    def template(self, request, *args, **kwargs):
        event = self.get_object()
        instance = CardTemplate.objects.filter(event=event).first()
        if request.method == "GET":
            if instance is None:
                return Response(status=404)
            return Response(CardTemplateSerializer(instance, context={"request": request}).data)
        if request.method == "DELETE":
            if instance:
                instance.delete()
                Invitation.objects.filter(event=event).update(card="", card_status=Invitation.CardStatus.PENDING)
            return Response(status=204)
        ser = CardTemplateSerializer(instance, data=request.data, partial=request.method == "PATCH", context={"request": request})
        ser.is_valid(raise_exception=True)
        image_changed = "image" in request.FILES
        if instance is not None and image_changed:
            # New image: the cached size must be recomputed from the new file.
            instance.width = instance.height = 0
        obj = ser.save(workspace=self.workspace, event=event)
        # Any change to the slot or image invalidates every rendered card.
        from apps.invitations.cards import regenerate_event_cards

        regenerate_event_cards(event)
        return Response(
            CardTemplateSerializer(obj, context={"request": request}).data,
            status=status.HTTP_200_OK if instance else status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "put", "patch"])
    def message(self, request, *args, **kwargs):
        event = self.get_object()
        instance = MessageTemplate.objects.filter(event=event).first()
        if request.method == "GET":
            if instance is None:
                return Response(status=404)
            return Response(MessageTemplateSerializer(instance).data)
        ser = MessageTemplateSerializer(instance, data=request.data, partial=request.method == "PATCH")
        ser.is_valid(raise_exception=True)
        obj = ser.save(workspace=self.workspace, event=event)
        return Response(MessageTemplateSerializer(obj).data)
