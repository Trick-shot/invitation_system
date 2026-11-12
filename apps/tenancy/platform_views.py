from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import viewsets

from .models import Workspace
from .permissions import IsPlatformOwner
from .serializers import PlatformWorkspaceSerializer


class _PlatformWorkspaceList(viewsets.ModelViewSet):
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
        qs = Workspace.objects.annotate(
            members=Count("memberships", filter=Q(memberships__is_active=True), distinct=True),
            events=Coalesce(Subquery(events_all, output_field=IntegerField()), 0),
            events_open=Coalesce(Subquery(events_open, output_field=IntegerField()), 0),
        ).order_by("name")
        if self.action == "list":
            q = (self.request.query_params.get("q") or "").strip()
            if q:
                qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q) | Q(memberships__user__email__icontains=q) | Q(memberships__user__full_name__icontains=q)).distinct()
            status = self.request.query_params.get("status")
            if status in Workspace.Status.values:
                qs = qs.filter(status=status)
        return qs

    def list(self, request, *args, **kwargs):
        """One page of workspaces, plus totals across all of them for the tiles above the table."""
        resp = super().list(request, *args, **kwargs)
        resp.data["summary"] = _platform_summary()
        return resp


def _platform_summary() -> dict:
    """Counted in the database, so the tiles stay right however many pages the list has."""
    from datetime import timedelta

    from django.db.models import Exists
    from django.utils import timezone

    from apps.billing.models import SmsCharge
    from apps.billing.service import month_range, totals
    from apps.events.models import Event

    live = Workspace.objects.exclude(status=Workspace.Status.DELETING)
    month_ago = timezone.now() - timedelta(days=30)
    has_admin = Membership.objects.filter(workspace=OuterRef("pk"), role="admin", is_active=True)
    has_event = Event.objects.all_workspaces().filter(workspace=OuterRef("pk"))
    now = timezone.now()
    start, end = month_range(now.year, now.month)
    return {
        "workspaces": live.count(),
        "active_this_month": live.filter(memberships__user__last_login__gte=month_ago).distinct().count(),
        "sms_this_month": totals(SmsCharge.objects.all_workspaces().filter(created_at__gte=start, created_at__lt=end))["sms"],
        "events_open": Event.objects.all_workspaces().filter(status=Event.Status.OPEN, workspace__in=live).count(),
        "setup_stalled": live.annotate(a=Exists(has_admin), e=Exists(has_event)).filter(Q(a=False) | Q(e=False)).count(),
        "deleting": Workspace.objects.filter(status=Workspace.Status.DELETING).count(),
    }


# ---------------------------------------------------------------------------
# Workspace detail, change details, support access (platform owner only)
# ---------------------------------------------------------------------------
from django.db import transaction  # noqa: E402
from django.shortcuts import get_object_or_404  # noqa: E402
from rest_framework.decorators import action  # noqa: E402
from rest_framework.exceptions import ValidationError  # noqa: E402
from rest_framework.response import Response  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from . import support  # noqa: E402
from .models import AuditEvent, Membership, SupportSession  # noqa: E402

COUNTRIES = {"TZ": "Tanzania", "KE": "Kenya", "UG": "Uganda", "RW": "Rwanda", "BI": "Burundi", "CD": "DR Congo", "ZM": "Zambia", "MW": "Malawi", "MZ": "Mozambique", "KR": "South Korea"}


def _detail(ws) -> dict:
    from apps.billing.service import workspace_money
    from apps.events.models import Event

    team = {r: ws.memberships.filter(role=r, is_active=True).count() for r in ("admin", "coordinator", "door_staff")}
    events = Event.objects.all_workspaces().filter(workspace=ws)
    return {
        "money": workspace_money(ws),
        "events_total": events.count(),
        "events_running": events.filter(status=Event.Status.OPEN).count(),
        "team": team,
        "country_name": COUNTRIES.get(ws.default_country, ws.default_country),
        "activity": [
            {"kind": a.kind, "summary": a.summary, "reason": a.reason, "at": a.created_at}
            for a in AuditEvent.objects.filter(workspace=ws)[:20]
        ],
        "deletion": _deletion(ws),
        "support": next(
            ({"id": s.pk, "mode": s.mode, "expires_at": s.expires_at, "reason": s.reason} for s in SupportSession.objects.filter(workspace=ws, ended_at__isnull=True) if s.is_active),
            None,
        ),
    }


def _deletion(ws) -> dict | None:
    from . import deletion

    if ws.status != Workspace.Status.DELETING:
        return {"scheduled": False, "grace_days": deletion.GRACE_DAYS, "removes": deletion.preview(ws)}
    by = ws.deletion_requested_by
    return {"scheduled": True, "delete_after": ws.delete_after, "reason": ws.deletion_reason, "by": support.name_of(by) if by else "", "grace_days": deletion.GRACE_DAYS, "removes": deletion.preview(ws)}


def _not_deleting(ws):
    if ws.status == Workspace.Status.DELETING:
        raise ValidationError({"detail": "This workspace is being deleted. Restore it first."})


class PlatformWorkspaceDetailMixin:
    def retrieve(self, request, *args, **kwargs):
        ws = self.get_object()
        return Response({**self.get_serializer(ws).data, **_detail(ws)})

    def partial_update(self, request, *args, **kwargs):
        raise ValidationError({"detail": "Use Change details, which needs a reason and tells the client."})

    @action(detail=True, methods=["post"])
    def details(self, request, pk=None):
        """Change a client's details. Needs a reason; logged; the client's admins get an email."""
        ws = self.get_object()
        _not_deleting(ws)
        reason = (request.data.get("reason") or "").strip()
        if len(reason) < 5:
            raise ValidationError({"reason": ["Say why, so the client understands the change."]})
        contact = self.get_serializer(ws).data.get("contact") or {}
        changes = []
        with transaction.atomic():
            name = (request.data.get("name") or "").strip()
            if name and name != ws.name:
                changes.append(f"Workspace name: {ws.name} to {name}")
                ws.name = name
                ws.save(update_fields=["name"])
            country = (request.data.get("country") or "").strip().upper()
            if country and country != ws.default_country:
                changes.append(f"Country: {COUNTRIES.get(ws.default_country, ws.default_country)} to {COUNTRIES.get(country, country)}")
                ws.default_country = country
                ws.save(update_fields=["default_country"])
            if contact.get("user_id"):
                from apps.accounts.models import User
                from apps.invitations.phones import PhoneError, normalise

                u = User.objects.get(pk=contact["user_id"])
                cname = request.data.get("contact_name")
                if cname is not None and cname.strip() and cname.strip() != (u.full_name or ""):
                    changes.append(f"Contact name: {u.full_name or 'blank'} to {cname.strip()}")
                    u.full_name = cname.strip()
                    u.save(update_fields=["full_name"])
                cphone = (request.data.get("contact_phone") or "").strip()
                if cphone:
                    try:
                        cphone = normalise(cphone, ws.default_country or "TZ")
                    except PhoneError as exc:
                        raise ValidationError({"contact_phone": [str(exc)]})
                    if cphone != u.phone:
                        changes.append(f"Contact phone: {u.phone or 'blank'} to {cphone}")
                        u.phone = cphone
                        u.save(update_fields=["phone"])
            if not changes:
                raise ValidationError({"detail": "Nothing changed."})
            AuditEvent.objects.create(workspace=ws, actor=request.user, kind=AuditEvent.Kind.DETAILS_CHANGED, summary="; ".join(changes)[:300], reason=reason)
        transaction.on_commit(lambda: _tell_admins(ws, request.user, changes, reason))
        return Response({**self.get_serializer(ws).data, **_detail(ws)})

    @action(detail=True, methods=["post"], url_path="support/leave")
    def support_leave(self, request, pk=None):
        """Leave the workspace. Ending edit mode sends the client the summary."""
        ws = self.get_object()
        for s in SupportSession.objects.filter(user=request.user, workspace=ws, ended_at__isnull=True):
            support.end(s)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def support(self, request, pk=None):
        """{mode: view|edit, reason}: open the workspace read-only, or enter edit mode for 30 minutes."""
        ws = self.get_object()
        _not_deleting(ws)
        mode = request.data.get("mode", "view")
        reason = (request.data.get("reason") or "").strip()
        if mode == "edit" and len(reason) < 5:
            raise ValidationError({"reason": ["Edit mode needs a reason. The client sees it."]})
        if mode == "view":
            # Ending edit mode returns to view: close the edit session properly first so the summary goes out.
            for s in SupportSession.objects.filter(user=request.user, workspace=ws, ended_at__isnull=True, mode="edit"):
                support.end(s)
        s = support.start(request.user, ws, mode=mode, reason=reason)
        return Response({"id": s.pk, "mode": s.mode, "expires_at": s.expires_at, "slug": ws.slug}, status=201)


class PlatformWorkspaceDeletionMixin:
    @action(detail=True, methods=["post"], url_path="delete")
    def schedule_delete(self, request, pk=None):
        """{reason, confirm}: close the workspace now and remove it for good after the hold."""
        from . import deletion

        ws = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if len(reason) < 5:
            raise ValidationError({"reason": ["Say why. It is kept with the workspace until it goes."]})
        if (request.data.get("confirm") or "").strip().casefold() != ws.name.strip().casefold():
            raise ValidationError({"confirm": ["Type the workspace name exactly as shown."]})
        try:
            deletion.schedule(ws, by=request.user, reason=reason)
        except deletion.DeletionError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({**self.get_serializer(ws).data, **_detail(ws)})

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        from . import deletion

        ws = self.get_object()
        try:
            deletion.restore(ws, by=request.user)
        except deletion.DeletionError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response({**self.get_serializer(ws).data, **_detail(ws)})


def _tell_admins(ws, actor, changes, reason):
    from apps.accounts.emails import _send

    who = support.name_of(actor)
    for m in Membership.objects.filter(workspace=ws, role="admin", is_active=True).select_related("user"):
        if m.user.email:
            _send(
                m.user.email,
                "Your details on Trickshot Invitations were updated",
                "email/button.html",
                {"kicker": ws.name, "title": f"{who} from Trickshot updated your details", "paragraphs": [f"Why: {reason}", *changes], "cta": "Open your workspace", "url": f"{support._site()}/app/{ws.slug}/settings", "footer": f"Sent by Trickshot Invitations for {ws.name}."},
                f"{who} from Trickshot updated your details.\nWhy: {reason}\n\n" + "\n".join(changes),
            )


# ---------------------------------------------------------------------------
# Earnings, event bills, SMS rates
# ---------------------------------------------------------------------------
class EarningsView(APIView):
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        from django.utils import timezone

        from apps.billing.service import earnings

        today = timezone.localdate()
        year = int(request.query_params.get("year") or today.year)
        month = int(request.query_params.get("month") or today.month)
        return Response(earnings(year, month))


class PlatformEventBillView(APIView):
    permission_classes = [IsPlatformOwner]

    def _event(self, pk):
        from apps.events.models import Event

        return get_object_or_404(Event.objects.all_workspaces().select_related("workspace"), pk=pk)

    def get(self, request, pk):
        from apps.billing.service import event_bill
        from apps.billing.views import _page, _per_page

        return Response(event_bill(self._event(pk), with_cost=True, page=_page(request), per_page=_per_page(request)))

    def post(self, request, pk):
        from apps.billing.models import EventBill
        from apps.billing.service import event_bill, set_bill_status

        status = request.data.get("status")
        if status not in EventBill.Status.values:
            raise ValidationError({"status": ["open, invoiced or paid"]})
        ev = self._event(pk)
        set_bill_status(ev, status)
        return Response(event_bill(ev, with_cost=True))


class SmsRatesView(APIView):
    permission_classes = [IsPlatformOwner]

    def get(self, request):
        from apps.billing.models import SmsRates
        from apps.billing.service import open_bills_preview

        r = SmsRates.current()
        return Response({"cost_per_sms": r.cost_per_sms, "price_per_sms": r.price_per_sms, "currency": r.currency, "updated_at": r.updated_at, "open_bills": open_bills_preview()})

    def put(self, request):
        from decimal import Decimal, InvalidOperation

        from apps.billing.models import SmsRates

        try:
            cost = Decimal(str(request.data.get("cost_per_sms")))
            price = Decimal(str(request.data.get("price_per_sms")))
        except (InvalidOperation, TypeError):
            raise ValidationError({"detail": "Both rates must be numbers."})
        if cost < 0:
            raise ValidationError({"cost_per_sms": ["Cannot be negative."]})
        if price <= cost:
            raise ValidationError({"price_per_sms": ["Must be above what Beem charges, or every SMS loses money."]})
        r = SmsRates.current()
        r.cost_per_sms, r.price_per_sms, r.updated_by = cost, price, request.user
        r.save()
        return self.get(request)


class RepriceOpenBillsView(APIView):
    """{notify}: charge every open bill at today's price. Invoiced and paid bills never change."""

    permission_classes = [IsPlatformOwner]

    def post(self, request):
        from apps.billing.service import open_bills_preview, reprice_open_bills

        done = reprice_open_bills(by=request.user, notify=bool(request.data.get("notify", True)))
        return Response({"changed": done, "open_bills": open_bills_preview()})


class PlatformWorkspaceViewSet(PlatformWorkspaceDeletionMixin, PlatformWorkspaceDetailMixin, _PlatformWorkspaceList):
    """The owner's workspaces: list and create (above), detail, change details and support access."""


class PlatformSettingsView(APIView):
    """The owner's own settings: how Trickshot shows up on bills and emails."""

    permission_classes = [IsPlatformOwner]
    FIELDS = ("business_name", "support_email", "support_phone", "payment_instructions", "invoice_due_days")

    def _out(self, p):
        return {**{f: getattr(p, f) for f in self.FIELDS}, "updated_at": p.updated_at}

    def get(self, request):
        from .models import PlatformSettings

        return Response(self._out(PlatformSettings.current()))

    def patch(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email

        from .models import PlatformSettings

        p = PlatformSettings.current()
        errors = {}
        data = {f: request.data[f] for f in self.FIELDS if f in request.data}
        if "business_name" in data:
            data["business_name"] = str(data["business_name"]).strip()
            if not data["business_name"]:
                errors["business_name"] = ["Clients see this on every bill."]
        if "support_email" in data:
            data["support_email"] = str(data["support_email"]).strip()
            try:
                validate_email(data["support_email"])
            except DjangoValidationError:
                errors["support_email"] = ["Enter an email address clients can write to."]
        if data.get("support_phone"):
            from apps.invitations.phones import PhoneError, normalise

            try:
                data["support_phone"] = normalise(str(data["support_phone"]), "TZ")
            except PhoneError as exc:
                errors["support_phone"] = [str(exc)]
        if "payment_instructions" in data:
            data["payment_instructions"] = str(data["payment_instructions"]).strip()[:2000]
        if "invoice_due_days" in data:
            try:
                d = int(data["invoice_due_days"])
            except (TypeError, ValueError):
                d = -1
            if not 1 <= d <= 90:
                errors["invoice_due_days"] = ["Between 1 and 90 days."]
            data["invoice_due_days"] = d
        if errors:
            raise ValidationError(errors)
        for k, v in data.items():
            setattr(p, k, v)
        p.updated_by = request.user
        p.save()
        return Response(self._out(p))
