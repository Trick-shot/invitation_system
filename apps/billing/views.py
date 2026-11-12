"""The client's side of billing: what they owe per event. Never shows Beem cost or profit."""

import csv

from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenancy.context import workspace_context
from apps.tenancy.models import Workspace
from apps.tenancy.permissions import ADMIN, MANAGERS, active_membership

from .service import event_bill, workspace_billing


def _load(request, slug, roles):
    ws = Workspace.objects.filter(slug=slug, status=Workspace.Status.ACTIVE).first()
    m = active_membership(request.user, ws) if ws else None
    if m is None:
        raise Http404
    if m.role not in roles:
        raise PermissionDenied("Only an admin can see billing.")
    return ws


def _csv(name: str, header: list, rows: list) -> HttpResponse:
    resp = HttpResponse(content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{name}"'
    w = csv.writer(resp)
    w.writerow(header)
    w.writerows(rows)
    return resp


class WorkspaceBillingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _load(request, workspace_slug, {ADMIN})
        data = workspace_billing(ws)
        if request.query_params.get("download") == "csv":
            rows = [[e["name"], e["date"], e["sms"], e["price_per_sms"], e["amount"], e["bill"]["status"]] for e in data["events"]]
            return _csv(f"{ws.slug}-statement.csv", ["Event", "Date", "SMS", f"Price per SMS ({data['currency']})", f"Amount ({data['currency']})", "Bill"], rows)
        return Response(data)


class EventBillView(APIView):
    """Admins and coordinators: the Send page shows the running bill next to the estimate."""

    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_slug, event_pk):
        from apps.events.models import Event

        ws = _load(request, workspace_slug, MANAGERS)
        with workspace_context(ws):
            ev = get_object_or_404(Event.objects.select_related("workspace"), pk=event_pk)
            if request.query_params.get("download") == "csv":
                data = event_bill(ev, with_cost=False, latest=100_000)
                rows = [[c["recipient"], c["label"], c["sms"], c["price_per_sms"], c["amount"], c["at"].isoformat()] for c in data["charges"]]
                return _csv(f"{ws.slug}-{ev.pk}-bill.csv", ["Sent to", "What", "SMS", f"Price per SMS ({data['currency']})", f"Amount ({data['currency']})", "When"], rows)
            return Response(event_bill(ev, with_cost=False))
