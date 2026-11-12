from django.db.models import Max, OuterRef, Prefetch, Q, Subquery
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.events.models import Event
from apps.tenancy.permissions import EVERYONE, MANAGERS
from apps.tenancy.views import WorkspaceViewSet

from . import importers
from .cards import queue_card
from .models import Delivery, Invitation
from .sending import SendBlocked, queue_send
from .serializers import (
    ImportCommitSerializer,
    ImportPreviewSerializer,
    InvitationSerializer,
    SendSerializer,
)


class InvitationViewSet(WorkspaceViewSet):
    serializer_class = InvitationSerializer
    role_map = {"list": EVERYONE, "retrieve": EVERYONE}
    default_roles = MANAGERS

    def get_event(self):
        if not hasattr(self, "_event"):
            self._event = get_object_or_404(Event.objects.filter(workspace=self.workspace), pk=self.kwargs["event_pk"])
        return self._event

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx.update(workspace=self.workspace, event=self.get_event())
        return ctx

    def get_queryset(self):
        qs = Invitation.objects.filter(event=self.get_event()).prefetch_related(
            Prefetch("deliveries", queryset=Delivery.objects.order_by("-sequence"))
        )
        p = self.request.query_params
        if q := p.get("q"):
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q.replace(" ", "")))
        if p.get("filter") == "not_arrived":
            qs = qs.filter(admitted_count=0)
        elif p.get("filter") == "failed":
            last_status = Delivery.objects.filter(invitation=OuterRef("pk")).order_by("-sequence").values("status")[:1]
            qs = qs.annotate(_ls=Subquery(last_status)).filter(_ls=Delivery.Status.FAILED)
        elif p.get("filter") == "not_sent":
            qs = qs.filter(deliveries__isnull=True)
        return qs.distinct()

    def perform_create(self, serializer):
        invitation = serializer.save(workspace=self.workspace, event=self.get_event())
        queue_card(invitation)
        invitation.refresh_from_db()

    @action(detail=True, methods=["post"], url_path="regenerate-card")
    def regenerate_card(self, request, *args, **kwargs):
        invitation = self.get_object()
        Invitation.objects.filter(pk=invitation.pk).update(card_status=Invitation.CardStatus.PENDING)
        queue_card(invitation)
        return Response({"detail": "Card queued."})

    @action(detail=True, methods=["get"])
    def activity(self, request, *args, **kwargs):
        """What the guest sheet shows: who let this guest in and when."""
        from apps.scanning.models import ScanLog

        invitation = self.get_object()
        rows = ScanLog.objects.filter(invitation=invitation, result=ScanLog.Result.ACCEPTED).select_related("staff").order_by("created_at")
        return Response(
            {
                "admissions": [
                    {"at": r.created_at, "by": ((r.staff.full_name or "").strip() or r.staff.email) if r.staff else "", "manual": r.manual}
                    for r in rows
                ]
            }
        )

    @action(detail=False, methods=["get"], url_path="import/template")
    def import_template(self, request, *args, **kwargs):
        from django.http import HttpResponse

        from .template_xlsx import build_template

        data = build_template(self.workspace.default_country)
        resp = HttpResponse(data, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        resp["Content-Disposition"] = 'attachment; filename="guest-list-template.xlsx"'
        return resp

    @action(detail=False, methods=["post"], url_path="import/preview")
    def import_preview(self, request, *args, **kwargs):
        ser = ImportPreviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if d["source"] == "paste":
            rows = importers.parse_pasted(d.get("text", ""))
        elif d["source"] in ("csv", "xlsx"):
            if "file" not in d:
                raise ValidationError({"file": "Upload a .csv or .xlsx file."})
            name = (d["file"].name or "").lower()
            data = d["file"].read()
            if name.endswith((".xlsx", ".xlsm")) or d["source"] == "xlsx":
                rows = importers.parse_xlsx(data)
            elif name.endswith(".xls"):
                raise ValidationError(
                    {"code": "old_excel", "detail": "That is an old .xls file. In Excel choose Save As and pick .xlsx, then upload again."}
                )
            else:
                rows = importers.parse_csv(data)
        elif d["source"] == "vcard":
            if "file" not in d:
                raise ValidationError({"file": "Upload a .vcf file."})
            rows = importers.parse_vcard(d["file"].read())
        else:  # rows from the Android contact picker
            rows = ((r.get("name", ""), r.get("phone", ""), int(r.get("capacity", 1) or 1)) for r in d.get("rows", []))
        existing = set(Invitation.objects.filter(event=self.get_event()).values_list("phone", flat=True))
        try:
            preview = importers.build_preview(rows, default_country=self.workspace.default_country, existing_phones=existing)
        except importers.ImportError_ as exc:
            return Response({"code": exc.code, "detail": str(exc), "headings": exc.headings}, status=422)
        return Response(preview)

    @action(detail=False, methods=["post"], url_path="import/commit")
    def import_commit(self, request, *args, **kwargs):
        ser = ImportCommitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        event = self.get_event()
        existing = set(Invitation.objects.filter(event=event).values_list("phone", flat=True))
        created, skipped = [], []
        for row in ser.validated_data["rows"]:
            item = InvitationSerializer(data=row, context={"workspace": self.workspace, "event": event, "request": request})
            if not item.is_valid() or item.validated_data["phone"] in existing:
                skipped.append({"row": row, "errors": item.errors or {"phone": ["duplicate"]}})
                continue
            inv = item.save(workspace=self.workspace, event=event)
            existing.add(inv.phone)
            queue_card(inv)
            created.append(inv.pk)
        return Response({"created": len(created), "skipped": skipped}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def send(self, request, *args, **kwargs):
        ser = SendSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        event = self.get_event()
        qs = Invitation.objects.filter(event=event)
        if d.get("invitation_ids"):
            qs = qs.filter(pk__in=d["invitation_ids"])
        if d.get("only_unsent"):
            qs = qs.filter(deliveries__isnull=True)
        if d.get("only_failed"):
            last_status = Delivery.objects.filter(invitation=OuterRef("pk")).order_by("-sequence").values("status")[:1]
            qs = qs.annotate(_ls=Subquery(last_status)).filter(_ls=Delivery.Status.FAILED)
        ids = list(qs.values_list("pk", flat=True).distinct())
        if not ids:
            raise ValidationError("Nothing to send.")
        try:
            delivery_ids = queue_send(event=event, invitation_ids=ids, user=request.user)
        except SendBlocked as exc:
            raise ValidationError(str(exc))
        return Response({"queued": len(delivery_ids), "delivery_ids": delivery_ids}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=["get"], url_path="send/progress")
    def send_progress(self, request, *args, **kwargs):
        """Live counts for the sending screen, plus the most recent rows."""
        event = self.get_event()
        latest = Delivery.objects.filter(
            invitation__event=event,
            sequence=Subquery(
                Delivery.objects.filter(invitation=OuterRef("invitation")).values("invitation").annotate(m=Max("sequence")).values("m")[:1]
            ),
        )
        counts = {s: 0 for s, _ in Delivery.Status.choices}
        for s in latest.values_list("status", flat=True):
            counts[s] += 1
        recent = latest.select_related("invitation").order_by("-updated_at")[:20]
        return Response(
            {
                "counts": counts,
                "total": sum(counts.values()),
                "recent": [
                    {
                        "invitation_id": d.invitation_id,
                        "name": d.invitation.name,
                        "status": d.status,
                        "error": d.error,
                        "sequence": d.sequence,
                    }
                    for d in recent
                ],
            }
        )


class PublicInvitationView(APIView):
    """
    The guest's link. Anyone with the token sees the card; nothing in the
    response identifies the workspace. Unknown and foreign tokens both 404.

    The page polls with ?poll=1 so it can show "scanned" the moment the door
    admits the guest. Polls do not count as views and use their own, wider
    throttle: guests at a venue often share one carrier IP.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]

    @property
    def throttle_scope(self):
        return "public_poll" if self.request.query_params.get("poll") else "public_link"

    def get(self, request, token):
        from django.db.models import F
        from django.utils import timezone

        from apps.scanning.models import ScanLog

        inv = Invitation.objects.all_workspaces().select_related("event", "workspace").filter(token=token).first()
        if inv is None or inv.workspace.status != "active":
            return Response({"state": "invalid"}, status=404)
        if not request.query_params.get("poll"):
            Invitation.objects.all_workspaces().filter(pk=inv.pk).update(view_count=F("view_count") + 1)
            if inv.first_viewed_at is None:
                Invitation.objects.all_workspaces().filter(pk=inv.pk, first_viewed_at__isnull=True).update(first_viewed_at=timezone.now())
        event = inv.event
        state = "ready"
        if event.status == Event.Status.CLOSED:
            state = "finished"
        elif inv.card_status != Invitation.CardStatus.READY:
            state = "preparing"
        entries = list(
            ScanLog.objects.all_workspaces()
            .filter(invitation=inv, result=ScanLog.Result.ACCEPTED)
            .order_by("created_at")
            .values_list("created_at", flat=True)[: inv.capacity]
        )
        return Response(
            {
                "state": state,
                "guest_name": inv.name,
                "capacity": inv.capacity,
                "admitted_count": inv.admitted_count,
                "entries": entries,
                "event": {"name": event.name, "date": event.date, "start_time": event.start_time, "venue": event.venue, "status": event.status},
                # Relative on purpose: the page fetches it to save to Photos, and an absolute
                # URL built behind the proxy can come out as http:// and be blocked.
                # ?v= changes whenever the card is rebuilt, so browsers never show a stale cached card.
                "card_url": f"{inv.card.url}?v={int(inv.updated_at.timestamp())}" if state == "ready" and inv.card else None,
            }
        )
