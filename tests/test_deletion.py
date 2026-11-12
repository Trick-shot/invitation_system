"""Deleting a client workspace (closed at once, removed after the hold) and the owner's settings."""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import RetiredTotal, SmsCharge
from apps.events.models import Event
from apps.invitations.models import Invitation
from apps.tenancy.deletion import GRACE_DAYS, purge_due
from apps.tenancy.models import Membership, PlatformSettings, Workspace

from .conftest import client_for, make_user, member


def send(api, ws, event, ids):
    return api.post(f"/api/workspaces/{ws.slug}/events/{event.pk}/invitations/send/", {"invitation_ids": ids}, format="json")


def schedule(o, ws, **body):
    return o.post(f"/api/platform/workspaces/{ws.pk}/delete/", {"reason": "Client asked to close the account", "confirm": ws.name, **body}, format="json")


def test_deleting_needs_a_reason_and_the_name(owner, ws_a):
    o = client_for(owner)
    assert schedule(o, ws_a, reason="").status_code == 400
    r = schedule(o, ws_a, confirm="something else")
    assert r.status_code == 400 and "confirm" in r.data
    ws_a.refresh_from_db()
    assert ws_a.status == "active"


def test_scheduling_closes_the_workspace_at_once(owner, api_a, admin_a, staff_a, ws_a, event_a, inv_a):
    mail.outbox.clear()
    r = schedule(client_for(owner), ws_a)
    assert r.status_code == 200 and r.data["status"] == "deleting"
    assert r.data["deletion"]["scheduled"] and r.data["deletion"]["removes"]["guests"] == 1
    ws_a.refresh_from_db()
    assert ws_a.delete_after - timezone.now() > timedelta(days=GRACE_DAYS - 1)
    # The client's admins are told the date.
    assert any(f"{ws_a.name} is being deleted" == m.subject for m in mail.outbox)
    # Nobody gets in: the app, the scanner, the guest link.
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/events/").status_code in (403, 404)
    assert api_a.get("/api/me/").data["memberships"] == []
    s = client_for(staff_a)
    assert s.get("/api/scan/events/").data == []
    assert s.post("/api/scan/", {"event_id": event_a.pk, "token": inv_a.token, "device_id": "t1", "scanned_at": timezone.now().isoformat()}, format="json").status_code in (403, 404)
    assert client_for(owner).get(f"/api/i/{inv_a.token}/").status_code == 404
    # Support access and detail changes wait until it is restored.
    assert client_for(owner).post(f"/api/platform/workspaces/{ws_a.pk}/support/", {"mode": "view"}, format="json").status_code == 400


def test_restore_brings_everything_back(owner, api_a, ws_a, event_a, inv_a):
    o = client_for(owner)
    schedule(o, ws_a)
    mail.outbox.clear()
    r = o.post(f"/api/platform/workspaces/{ws_a.pk}/restore/")
    assert r.status_code == 200 and r.data["status"] == "active" and r.data["deletion"]["scheduled"] is False
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/events/").status_code == 200
    assert any("open again" in m.subject for m in mail.outbox)
    # Purging now does nothing: it was restored.
    assert purge_due() == 0 and Workspace.objects.filter(pk=ws_a.pk).exists()


def test_purge_waits_for_the_hold(owner, ws_a):
    schedule(client_for(owner), ws_a)
    assert purge_due() == 0
    assert Workspace.objects.filter(pk=ws_a.pk).exists()


def test_purge_removes_everything_but_keeps_the_money(owner, api_a, admin_a, ws_a, ws_b, admin_b, event_a, inv_a):
    send(api_a, ws_a, event_a, [inv_a.pk])
    charge = SmsCharge.objects.all_workspaces().get(workspace=ws_a)
    earned_before = client_for(owner).get("/api/platform/earnings/").data
    # Someone who is in both workspaces keeps their account; a person only in A does not.
    both = make_user("both@example.com")
    member(both, ws_a, "coordinator")
    member(both, ws_b, "door_staff")
    schedule(client_for(owner), ws_a)
    Workspace.objects.filter(pk=ws_a.pk).update(delete_after=timezone.now() - timedelta(minutes=1))

    assert purge_due() == 1
    assert not Workspace.objects.filter(pk=ws_a.pk).exists()
    assert not Event.objects.all_workspaces().filter(pk=event_a.pk).exists()
    assert not Invitation.objects.all_workspaces().filter(pk=inv_a.pk).exists()
    assert not SmsCharge.objects.all_workspaces().filter(pk=charge.pk).exists()
    assert not User.objects.filter(pk=admin_a.pk).exists()
    assert User.objects.filter(pk=both.pk).exists() and Membership.objects.filter(user=both, workspace=ws_b).exists()
    assert User.objects.filter(pk=owner.pk).exists() and Workspace.objects.filter(pk=ws_b.pk).exists()
    # The owner's earnings for the month do not change: the totals live on, with no client attached.
    t = RetiredTotal.objects.get(year=charge.created_at.year, month=charge.created_at.month)
    assert t.sms == charge.segments and t.billed == charge.amount
    earned_after = client_for(owner).get("/api/platform/earnings/").data
    assert earned_after["billed"] == earned_before["billed"] and earned_after["profit"] == earned_before["profit"]


def test_platform_settings_reach_bills_and_emails(owner, api_a, ws_a, event_a, inv_a):
    o = client_for(owner)
    assert o.patch("/api/platform/settings/", {"support_email": "not an email"}, format="json").status_code == 400
    assert o.patch("/api/platform/settings/", {"invoice_due_days": 0}, format="json").status_code == 400
    r = o.patch("/api/platform/settings/", {"support_email": "help@trickshot.tech", "payment_instructions": "M-Pesa Lipa 123456", "invoice_due_days": 7, "support_phone": "0712 345 678"}, format="json")
    assert r.status_code == 200 and r.data["support_phone"] == "+255712345678"
    assert PlatformSettings.current().invoice_due_days == 7
    # Clients see how to pay; an invoice is due in the owner's number of days.
    send(api_a, ws_a, event_a, [inv_a.pk])
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/billing/").data["how_to_pay"]["instructions"] == "M-Pesa Lipa 123456"
    bill = o.post(f"/api/platform/events/{event_a.pk}/bill/", {"status": "invoiced"}, format="json").data
    assert bill["bill"]["due_at"] == timezone.localdate() + timedelta(days=7)
    # Emails carry the support address, and replies go there.
    mail.outbox.clear()
    from apps.accounts.emails import send_reset_email

    send_reset_email(user=owner, url="https://example.com/reset")
    assert mail.outbox[0].reply_to == ["help@trickshot.tech"] and "help@trickshot.tech" in mail.outbox[0].alternatives[0][0]


def test_settings_are_owner_only(api_a):
    assert api_a.get("/api/platform/settings/").status_code == 403


@pytest.mark.parametrize("current,new,ok", [("wrong-password", "another-good-pass-91", False), ("correct-horse-battery", "123", False), ("correct-horse-battery", "another-good-pass-91", True)])
def test_change_password(owner, current, new, ok):
    o = client_for(owner)
    r = o.post("/api/me/password/", {"current_password": current, "new_password": new}, format="json")
    assert (r.status_code == 204) is ok
    owner.refresh_from_db()
    assert owner.check_password(new) is ok
