"""
Writing charges and adding them up. Everything the bill pages show is computed
from SmsCharge rows here, so client and platform views can never disagree.
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import EventBill, SmsCharge, SmsRates

log = logging.getLogger(__name__)
ZERO = Decimal("0")
_money = DecimalField(max_digits=14, decimal_places=2)
COST = ExpressionWrapper(F("segments") * F("cost_per_sms"), output_field=_money)
AMOUNT = ExpressionWrapper(F("segments") * F("price_per_sms"), output_field=_money)


def _uses_own_keys(workspace) -> bool:
    return bool(getattr(workspace, "credential", None))


def record_charge(*, workspace, body: str, kind: str, event=None, invitation=None, recipient: str = "", provider_message_id: str = "") -> SmsCharge | None:
    """
    One row per SMS the provider accepted. Never raises: billing must not break sending.
    A workspace sending on its own Beem keys pays Beem directly, so its rows cost 0 and bill 0.
    """
    from apps.messaging.service import sms_segments

    try:
        rates = SmsRates.current()
        own = _uses_own_keys(workspace)
        charge = SmsCharge.objects.all_workspaces().create(
            workspace=workspace,
            event=event,
            invitation=invitation,
            kind=kind,
            recipient=(recipient or "")[:160],
            segments=sms_segments(body)["segments"],
            cost_per_sms=ZERO if own else rates.cost_per_sms,
            price_per_sms=ZERO if own else rates.price_per_sms,
            provider_message_id=(provider_message_id or "")[:120],
        )
        if event is not None:
            EventBill.objects.all_workspaces().get_or_create(event=event, defaults={"workspace": workspace})
        return charge
    except Exception as exc:  # noqa: BLE001
        log.exception("Could not record SMS charge: %s", exc)
        return None


def event_for_workspace_message(workspace):
    """Staff invites are not tied to an event; they go on the bill of the event being worked on."""
    from apps.events.models import Event

    qs = Event.objects.all_workspaces().filter(workspace=workspace)
    return (
        qs.filter(status=Event.Status.OPEN).order_by("-date").first()
        or qs.filter(status=Event.Status.DRAFT, date__gte=timezone.localdate()).order_by("date").first()
        or qs.order_by("-date").first()
    )


def totals(qs) -> dict:
    agg = qs.aggregate(
        messages=Count("id"),
        sms=Coalesce(Sum("segments"), 0),
        cost=Coalesce(Sum(COST), ZERO, output_field=_money),
        billed=Coalesce(Sum(AMOUNT), ZERO, output_field=_money),
    )
    agg["profit"] = agg["billed"] - agg["cost"]
    return agg


def used(qs, field: str = "price_per_sms") -> list[Decimal]:
    """The rates these charges were actually written at, lowest first.

    Each SMS keeps the rate of the day it was sent, so a bill can hold more than one.
    Pages show these, never today's rate, next to an amount that was worked out from them."""
    return sorted(set(qs.order_by().values_list(field, flat=True).distinct()))


def rate_label(rates: list) -> str:
    """35, "35 and 85", "35 to 85"."""
    nums = [f"{r:,.0f}" if r == int(r) else f"{r:,.2f}" for r in rates]
    if not nums:
        return ""
    if len(nums) == 1:
        return nums[0]
    return f"{nums[0]} and {nums[1]}" if len(nums) == 2 else f"{nums[0]} to {nums[-1]}"


def by_kind(qs, *, with_cost: bool) -> list[dict]:
    rows = []
    for kind, label in SmsCharge.Kind.choices:
        t = totals(qs.filter(kind=kind))
        if not t["messages"]:
            continue
        row = {"kind": kind, "label": label, "messages": t["messages"], "sms": t["sms"], "amount": t["billed"], "prices_used": used(qs.filter(kind=kind))}
        if with_cost:
            row.update(cost=t["cost"], profit=t["profit"])
        rows.append(row)
    return rows


def how_to_pay() -> dict:
    """What the client needs to settle a bill, from the owner's platform settings."""
    from apps.tenancy.models import PlatformSettings

    p = PlatformSettings.current()
    return {"business_name": p.business_name, "instructions": p.payment_instructions, "support_email": p.support_email, "support_phone": p.support_phone, "due_days": p.invoice_due_days}


def bill_of(event) -> EventBill:
    bill, _ = EventBill.objects.all_workspaces().get_or_create(event=event, defaults={"workspace_id": event.workspace_id})
    return bill


def bill_dict(bill: EventBill) -> dict:
    return {"status": bill.status, "invoiced_at": bill.invoiced_at, "due_at": bill.due_at, "paid_at": bill.paid_at}


def welcome_still_to_come(event) -> int:
    """Invitations not yet admitted will each get one welcome text at the door, if welcome texts are on."""
    from apps.events.models import MessageTemplate
    from apps.invitations.models import Invitation

    msg = MessageTemplate.objects.all_workspaces().filter(event=event).first()
    if not msg or not getattr(msg, "welcome_enabled", False):
        return 0
    return Invitation.objects.all_workspaces().filter(event=event, admitted_count=0).count()


def event_bill(event, *, with_cost: bool, latest: int = 20) -> dict:
    qs = SmsCharge.objects.all_workspaces().filter(event=event)
    t = totals(qs)
    rates = SmsRates.current()
    to_come = welcome_still_to_come(event)
    price = ZERO if _uses_own_keys(event.workspace) else rates.price_per_sms
    data = {
        "event": {"id": event.pk, "name": event.name, "date": event.date, "status": event.status, "workspace": event.workspace.name, "workspace_id": event.workspace_id},
        "bill": bill_dict(bill_of(event)),
        "currency": rates.currency,
        "price_per_sms": price,  # today's rate: what the next SMS will cost
        "prices_used": used(qs),  # the rates this bill was worked out at
        "messages": t["messages"],
        "sms": t["sms"],
        "amount": t["billed"],
        "still_to_come": {"welcome_texts": to_come, "amount": price * to_come},
        "by_kind": by_kind(qs, with_cost=with_cost),
        "charges": [
            {"recipient": c.recipient, "kind": c.kind, "label": c.get_kind_display(), "sms": c.segments, "price_per_sms": c.price_per_sms, "amount": c.amount, "at": c.created_at}
            for c in qs.order_by("-created_at")[:latest]
        ],
    }
    if with_cost:
        data.update(cost=t["cost"], profit=t["profit"], cost_per_sms=rates.cost_per_sms, costs_used=used(qs, "cost_per_sms"))
    else:
        data["how_to_pay"] = how_to_pay()
    return data


def workspace_billing(workspace) -> dict:
    """The client's Billing page: what they owe, what is running, what they paid. Never shows cost."""
    from apps.events.models import Event

    year = timezone.localdate().year
    rates = SmsRates.current()
    events = Event.objects.all_workspaces().filter(workspace=workspace, sms_charges__isnull=False).distinct().order_by("-date")
    rows, to_pay, running, paid_year, sms_year = [], ZERO, ZERO, ZERO, 0
    for ev in events:
        ev_qs = SmsCharge.objects.all_workspaces().filter(event=ev)
        t = totals(ev_qs)
        bill = bill_of(ev)
        rows.append({"id": ev.pk, "name": ev.name, "date": ev.date, "sms": t["sms"], "amount": t["billed"], "prices_used": used(ev_qs), "bill": bill_dict(bill)})
        if bill.status == EventBill.Status.INVOICED:
            to_pay += t["billed"]
        elif bill.status == EventBill.Status.OPEN:
            running += t["billed"]
        elif bill.paid_at and bill.paid_at.year == year:
            paid_year += t["billed"]
        if ev.date.year == year:
            sms_year += t["sms"]
    return {
        "currency": rates.currency,
        "price_per_sms": ZERO if _uses_own_keys(workspace) else rates.price_per_sms,
        "prices_used": sorted({p for r in rows for p in r["prices_used"]}),
        "to_pay_now": to_pay,
        "running": running,
        "paid_this_year": paid_year,
        "sms_this_year": sms_year,
        "events": rows,
        "how_to_pay": how_to_pay(),
    }


def month_range(year: int, month: int):
    start = timezone.make_aware(datetime(year, month, 1))
    end = timezone.make_aware(datetime(year + (month == 12), month % 12 + 1, 1))
    return start, end


def _with_retired(t: dict, year: int, month: int) -> dict:
    """Add the month's money from deleted workspaces (anonymous totals) to a month's totals."""
    from .models import RetiredTotal

    r = RetiredTotal.objects.filter(year=year, month=month).first()
    if r is None:
        return t
    t = {**t, "sms": t["sms"] + r.sms, "cost": t["cost"] + r.cost, "billed": t["billed"] + r.billed}
    t["profit"] = t["billed"] - t["cost"]
    return t


def earnings(year: int, month: int) -> dict:
    """The owner's Earnings page for one month, plus profit for the six months up to it."""
    from apps.events.models import Event

    start, end = month_range(year, month)
    all_rows = SmsCharge.objects.all_workspaces()
    month_qs = all_rows.filter(created_at__gte=start, created_at__lt=end)
    t = _with_retired(totals(month_qs), year, month)
    history = []
    y, m = year, month
    for _ in range(6):
        s, e = month_range(y, m)
        history.append({"year": y, "month": m, "profit": _with_retired(totals(all_rows.filter(created_at__gte=s, created_at__lt=e)), y, m)["profit"]})
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    history.reverse()
    # Events with charges this month, plus any not yet paid (money still owed shows until settled).
    ev_ids = set(month_qs.exclude(event=None).values_list("event_id", flat=True))
    ev_ids |= set(EventBill.objects.all_workspaces().exclude(status=EventBill.Status.PAID).values_list("event_id", flat=True))
    events = Event.objects.all_workspaces().filter(pk__in=ev_ids).select_related("workspace").order_by("-date")
    rows, unpaid, open_n, invoiced_n = [], ZERO, 0, 0
    for ev in events:
        et = totals(all_rows.filter(event=ev))
        if not et["messages"]:
            continue
        bill = bill_of(ev)
        rows.append({"id": ev.pk, "name": ev.name, "workspace": ev.workspace.name, "workspace_id": ev.workspace_id, "date": ev.date, "sms": et["sms"], "cost": et["cost"], "billed": et["billed"], "profit": et["profit"], "bill": bill_dict(bill)})
        if bill.status != EventBill.Status.PAID:
            unpaid += et["billed"]
            open_n += bill.status == EventBill.Status.OPEN
            invoiced_n += bill.status == EventBill.Status.INVOICED
    rates = SmsRates.current()
    return {
        "year": year, "month": month, "currency": rates.currency,
        "cost_per_sms": rates.cost_per_sms, "price_per_sms": rates.price_per_sms,
        "prices_used": used(month_qs), "costs_used": used(month_qs, "cost_per_sms"),
        "sms": t["sms"], "cost": t["cost"], "billed": t["billed"], "profit": t["profit"],
        "unpaid": unpaid, "unpaid_open": open_n, "unpaid_invoiced": invoiced_n,
        "profit_by_month": history,
        "events": rows,
    }


def set_bill_status(event, status: str) -> EventBill:
    bill = bill_of(event)
    now = timezone.now()
    bill.status = status
    if status == EventBill.Status.INVOICED:
        bill.invoiced_at = bill.invoiced_at or now
        bill.due_at = bill.due_at or (timezone.localdate() + timedelta(days=how_to_pay()["due_days"]))
        bill.paid_at = None
    elif status == EventBill.Status.PAID:
        bill.paid_at = now
    else:
        bill.invoiced_at = bill.due_at = bill.paid_at = None
    bill.save()
    return bill


def workspace_money(workspace) -> dict:
    """Tiles on the owner's workspace detail page."""
    year = timezone.localdate().year
    now = timezone.now()
    start, end = month_range(now.year, now.month)
    qs = SmsCharge.objects.all_workspaces().filter(workspace=workspace)
    year_t = totals(qs.filter(created_at__year=year))
    unpaid = ZERO
    open_n = invoiced_n = 0
    for bill in EventBill.objects.all_workspaces().filter(workspace=workspace).exclude(status=EventBill.Status.PAID):
        unpaid += totals(qs.filter(event_id=bill.event_id))["billed"]
        open_n += bill.status == EventBill.Status.OPEN
        invoiced_n += bill.status == EventBill.Status.INVOICED
    running = qs.filter(event__status="open", created_at__gte=start, created_at__lt=end).aggregate(n=Coalesce(Sum("segments"), 0))["n"]
    return {
        "sms_this_month": totals(qs.filter(created_at__gte=start, created_at__lt=end))["sms"],
        "sms_running_event": running,
        "billed_year": year_t["billed"],
        "profit_year": year_t["profit"],
        "bills_year": EventBill.objects.all_workspaces().filter(workspace=workspace, event__date__year=year).count(),
        "unpaid": unpaid,
        "unpaid_open": open_n,
        "unpaid_invoiced": invoiced_n,
    }


def sms_this_month(workspace) -> int:
    now = timezone.now()
    start, end = month_range(now.year, now.month)
    return SmsCharge.objects.all_workspaces().filter(workspace=workspace, created_at__gte=start, created_at__lt=end).aggregate(n=Coalesce(Sum("segments"), 0))["n"]


__all__ = ["record_charge", "event_bill", "workspace_billing", "earnings", "set_bill_status", "workspace_money", "sms_this_month", "event_for_workspace_message", "Q"]
