from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .serializers import InvitationSerializer
from .models import Invitation


class InvitationViewSet(ModelViewSet):
    serializer_class = InvitationSerializer
    queryset = Invitation.objects.all()

    @action(detail=True, methods=['get', 'post'])
    def scan(self, request, pk=None):
        try:
            invitation = self.get_object()
            invitation.scanned = True
            invitation.save()
            return Response(
                {"message": f"Invitation for {invitation.guest.name} scanned successfully!"},
                status=status.HTTP_200_OK
            )
        except Invitation.DoesNotExist:
            return Response({"error": "Invitation not found"}, status=status.HTTP_404_NOT_FOUND)
