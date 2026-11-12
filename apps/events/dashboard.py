"""
Everything the event overview needs in one query-light call. Numbers come
from the invitation, delivery and scan tables; nothing is stored twice.
"""

from collections import Counter
from datetime import timedelta

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from apps.invitations.models import Delivery, Invitation
from apps.scanning.models import ScanLog


def build_dashboard(event) -> dict:
    inv = Invitation.objects.filter(event=event)
    totals = inv.aggregate(
        invitations=Count("id"),
        people_expected=Sum("capacity"),
        people_arrived=Sum("admitted_count"),
        cards_scanned=Count("id", filter=Q(admitted_count__gt=0)),
        opened=Count("id", filter=Q(view_count__gt=0)),
        cards_ready=Count("id", filter=Q(card_status=Invitation.CardStatus.READY)),
    )
    latest = Delivery.objects.filter(invitation__event=event).values("invitation_id").annotate(last=Max("sequence"))
    # Status of the most recent delivery per invitation.
    last_ids = Delivery.objects.filter(invitation__event=event, sequence__in=[row["last"] for row in latest]).values_list(
        "id", "invitation_id", "status", "sequence"
    )
    seen, sent, delivered, failed = set(), 0, 0, 0
    for _id, inv_id, st, _seq in last_ids:
        if inv_id in seen:
            continue
        seen.add(inv_id)
        sent += 1
        if st == Delivery.Status.DELIVERED:
            delivered += 1
        elif st == Delivery.Status.FAILED:
            failed += 1
    resends = Delivery.objects.filter(invitation__event=event, sequence__gt=1).count()

    now = timezone.now()
    since = now - timedelta(hours=1)
    last_hour = ScanLog.objects.filter(event=event, result=ScanLog.Result.ACCEPTED, scanned_at__gte=since).count()
    by_staff = (
        ScanLog.objects.filter(event=event, result=ScanLog.Result.ACCEPTED)
        .values("staff__full_name", "staff__email")
        .annotate(scans=Count("id"))
        .order_by("-scans")
    )
    rejections = ScanLog.objects.filter(event=event).exclude(result=ScanLog.Result.ACCEPTED).values("result").annotate(n=Count("id"))
    manual = ScanLog.objects.filter(event=event, result=ScanLog.Result.ACCEPTED, manual=True).count()
    # Hour buckets are counted here, not with TruncHour in SQL: on MySQL that needs the
    # server's time zone tables (CONVERT_TZ), which a fresh install does not have, and the
    # query then returns NULL and the overview 500s as soon as the first guest is scanned.
    # A few thousand timestamps per event is nothing to count in Python.
    hours = Counter(
        t.astimezone(timezone.get_current_timezone()).replace(minute=0, second=0, microsecond=0)
        for t in ScanLog.objects.filter(event=event, result=ScanLog.Result.ACCEPTED).values_list("scanned_at", flat=True)
    )

    expected = totals["people_expected"] or 0
    arrived = totals["people_arrived"] or 0
    return {
        "tiles": {
            "arrived": {"value": arrived, "of": expected, "last_hour": last_hour},
            "cards_scanned": {"value": totals["cards_scanned"], "of": totals["invitations"]},
            "sent": {"value": sent, "delivered": delivered, "failed": failed},
            "failed": {"value": failed},
        },
        "funnel": [
            {"stage": "invited", "count": totals["invitations"], "note": f"{expected} people expected"},
            {"stage": "sent", "count": sent},
            {"stage": "delivered", "count": delivered, "note": f"{failed} failed, retry available" if failed else ""},
            {
                "stage": "opened",
                "count": totals["opened"],
                "note": f"{max(delivered - totals['opened'], 0)} never opened the link" if delivered else "",
            },
            {"stage": "arrived", "count": totals["cards_scanned"], "note": f"{arrived} of {expected} people through the door"},
        ],
        "resends": resends,
        "cards_ready": totals["cards_ready"],
        "door": {
            "by_staff": [{"name": r["staff__full_name"] or r["staff__email"], "scans": r["scans"]} for r in by_staff],
            "rejections": {r["result"]: r["n"] for r in rejections},
            "manual_admits": manual,
        },
        "arrivals_by_hour": [{"hour": h.isoformat(), "count": n} for h, n in sorted(hours.items())],
        "generated_at": now.isoformat(),
    }
