"""
Delivery report webhook. Beem posts status changes here; we only trust it
to move a Delivery forward by provider message id, nothing else.
"""

import logging

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invitations.models import Delivery

log = logging.getLogger(__name__)

STATUS_MAP = {
    "DELIVERED": Delivery.Status.DELIVERED,
    "SENT": Delivery.Status.SENT,
    "FAILED": Delivery.Status.FAILED,
    "REJECTED": Delivery.Status.FAILED,
    "UNDELIVERED": Delivery.Status.FAILED,
}


class DeliveryReportView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        request_id = str(payload.get("request_id") or payload.get("message_id") or "")
        status_text = str(payload.get("status") or "").upper()
        new_status = STATUS_MAP.get(status_text)
        if not request_id or new_status is None:
            log.warning("Unrecognised delivery report: %s", payload)
            return Response({"ok": False}, status=202)
        updated = (
            Delivery.objects.all_workspaces()
            .filter(provider_message_id=request_id)
            .update(
                status=new_status,
                error=str(payload.get("reason") or "") if new_status == Delivery.Status.FAILED else "",
                updated_at=timezone.now(),
            )
        )
        return Response({"ok": bool(updated)})
