"""SMS ledger, bills, rates, and the owner's support access."""

from decimal import Decimal

from apps.billing.models import SmsCharge, SmsRates

from .conftest import client_for


def send(api, ws, event, ids, **extra):
    return api.post(f"/api/workspaces/{ws.slug}/events/{event.pk}/invitations/send/", {"invitation_ids": ids, **extra}, format="json")


def test_each_accepted_sms_is_charged_at_the_rate_of_the_day(api_a, ws_a, event_a, inv_a):
    rates = SmsRates.current()
    rates.cost_per_sms, rates.price_per_sms = Decimal("25"), Decimal("35")
    rates.save()
    send(api_a, ws_a, event_a, [inv_a.pk])
    c = SmsCharge.objects.all_workspaces().get(invitation=inv_a)
    assert c.kind == "invitation" and c.event_id == event_a.pk and c.recipient == inv_a.name
    assert c.segments >= 1 and c.price_per_sms == 35 and c.cost_per_sms == 25

    # New rates only apply to SMS sent afterwards: an old bill never changes.
    rates.price_per_sms = Decimal("50")
    rates.save()
    c.refresh_from_db()
    assert c.price_per_sms == 35


def test_rejected_sms_costs_nothing(api_a, ws_a, event_a, inv_a, monkeypatch):
    from apps.invitations import sending
    from apps.messaging.providers import ConsoleProvider, ProviderError

    class Failing(ConsoleProvider):
        def send(self, **kw):
            raise ProviderError("number not in service")

    monkeypatch.setattr(sending, "get_provider_for", lambda ws: Failing())
    send(api_a, ws_a, event_a, [inv_a.pk])
    assert not SmsCharge.objects.all_workspaces().exists()


def test_client_bill_shows_amount_but_never_cost(api_a, ws_a, event_a, inv_a):
    send(api_a, ws_a, event_a, [inv_a.pk])
    bill = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/bill/").data
    assert bill["sms"] >= 1 and bill["amount"] > 0 and bill["bill"]["status"] == "open"
    assert "cost" not in bill and "profit" not in bill and "cost_per_sms" not in bill
    billing = api_a.get(f"/api/workspaces/{ws_a.slug}/billing/").data
    assert billing["running"] == bill["amount"] and billing["events"][0]["id"] == event_a.pk
    csv = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/bill/", {"download": "csv"})
    assert csv.status_code == 200 and b"Sent to" in csv.content


def test_owner_earnings_and_bill_status(owner, api_a, ws_a, event_a, inv_a):
    send(api_a, ws_a, event_a, [inv_a.pk])
    o = client_for(owner)
    e = o.get("/api/platform/earnings/").data
    assert e["sms"] >= 1 and e["profit"] == e["billed"] - e["cost"] and len(e["profit_by_month"]) == 6
    assert e["events"][0]["bill"]["status"] == "open" and e["unpaid"] > 0
    b = o.post(f"/api/platform/events/{event_a.pk}/bill/", {"status": "invoiced"}, format="json").data
    assert b["bill"]["status"] == "invoiced" and b["bill"]["due_at"]
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/billing/").data["to_pay_now"] > 0
    o.post(f"/api/platform/events/{event_a.pk}/bill/", {"status": "paid"}, format="json")
    assert o.get("/api/platform/earnings/").data["unpaid"] == 0


def test_rates_must_leave_a_profit(owner):
    o = client_for(owner)
    assert o.put("/api/platform/rates/", {"cost_per_sms": 25, "price_per_sms": 20}, format="json").status_code == 400
    r = o.put("/api/platform/rates/", {"cost_per_sms": 24, "price_per_sms": 36}, format="json")
    assert r.status_code == 200 and Decimal(str(r.data["price_per_sms"])) == 36


def test_support_view_is_read_only_and_logged(owner, ws_a, event_a, inv_a):
    o = client_for(owner)
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_a.pk}/"
    assert o.get(url).status_code == 404  # no session: the owner is a stranger
    s = o.post(f"/api/platform/workspaces/{ws_a.pk}/support/", {"mode": "view"}, format="json")
    assert s.status_code == 201
    assert o.get(url).status_code == 200
    assert o.patch(url, {"name": "Changed"}, format="json").status_code == 403
    me = o.get("/api/me/").data
    assert me["support"][0]["workspace"]["slug"] == ws_a.slug and me["support"][0]["mode"] == "view"
    from apps.tenancy.models import AuditEvent

    assert AuditEvent.objects.filter(workspace=ws_a, kind="support_view").exists()


def test_edit_mode_needs_a_reason_logs_changes_and_sends_a_summary(owner, admin_a, ws_a, event_a, inv_a, mailoutbox):
    o = client_for(owner)
    assert o.post(f"/api/platform/workspaces/{ws_a.pk}/support/", {"mode": "edit"}, format="json").status_code == 400
    o.post(f"/api/platform/workspaces/{ws_a.pk}/support/", {"mode": "edit", "reason": "Fix a wrong guest phone"}, format="json")
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_a.pk}/"
    assert o.patch(url, {"name": "Amina Hassan Juma"}, format="json").status_code == 200
    mailoutbox.clear()
    assert o.post(f"/api/platform/workspaces/{ws_a.pk}/support/leave/").status_code == 204
    assert len(mailoutbox) == 1 and "changed a guest" in mailoutbox[0].body and "Fix a wrong guest phone" in mailoutbox[0].body
    activity = client_for(admin_a).get(f"/api/workspaces/{ws_a.slug}/activity/").data
    kinds = [a["kind"] for a in activity]
    assert "support_edit" in kinds and "support_change" in kinds and "support_end" in kinds


def test_change_details_needs_a_reason_and_tells_the_client(owner, admin_a, ws_a, mailoutbox):
    o = client_for(owner)
    base = f"/api/platform/workspaces/{ws_a.pk}/"
    assert o.patch(base, {"name": "Sneaky"}, format="json").status_code == 400
    assert o.post(base + "details/", {"name": "New Name"}, format="json").status_code == 400
    r = o.post(base + "details/", {"name": "Nyoni Family Events Ltd", "reason": "Client asked by phone"}, format="json")
    assert r.status_code == 200 and r.data["name"] == "Nyoni Family Events Ltd"
    assert any("Client asked by phone" in m.body for m in mailoutbox)
    d = o.get(base).data
    assert d["activity"][0]["kind"] == "details_changed" and "money" in d and d["contact"]["email"]
