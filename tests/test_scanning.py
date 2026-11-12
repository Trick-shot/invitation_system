import pytest

from apps.events.models import Event
from apps.scanning.models import ScanLog
from apps.tenancy.context import workspace_context

from .conftest import client_for, make_invitation

pytestmark = pytest.mark.django_db


def scan(client, event, token=None, invitation_id=None, device="phone-1"):
    body = {"event_id": event.pk, "device_id": device, "scanned_at": "2026-12-14T19:40:00Z"}
    if token:
        body["token"] = token
    if invitation_id:
        body["invitation_id"] = invitation_id
    return client.post("/api/scan/", body, format="json")


def test_admit_until_capacity_then_exhausted_with_history(staff_a, ws_a, event_a, inv_a):
    c = client_for(staff_a)
    r1 = scan(c, event_a, inv_a.token)
    assert r1.status_code == 200 and r1.data["result"] == "accepted" and r1.data["admitted_count"] == 1 and r1.data["capacity"] == 2
    r2 = scan(c, event_a, inv_a.token)
    assert r2.data["result"] == "accepted" and r2.data["admitted_count"] == 2 and r2.data["event_arrived"] == 2
    r3 = scan(c, event_a, inv_a.token)
    assert r3.data["result"] == "exhausted"
    assert len(r3.data["previous_scans"]) == 2 and r3.data["previous_scans"][0]["by"] == "Joseph Mwita"
    with workspace_context(ws_a):
        assert ScanLog.objects.filter(invitation=inv_a).count() == 3
        assert ScanLog.objects.filter(result="exhausted").count() == 1


def test_unknown_and_foreign_tokens_look_identical(staff_a, event_a, inv_b):
    c = client_for(staff_a)
    unknown = scan(c, event_a, "nope-nope-nope")
    foreign = scan(c, event_a, inv_b.token)
    assert unknown.data == foreign.data and unknown.data["result"] == "unknown"
    assert "Grace" not in str(foreign.content)


def test_wrong_event_in_same_workspace(staff_a, ws_a, event_a, inv_a):
    from .conftest import make_event

    other = make_event(ws_a, name="Other")
    r = scan(client_for(staff_a), other, inv_a.token)
    assert r.data["result"] == "wrong_event" and r.data["guest_name"] == "Amina Hassan"
    with workspace_context(ws_a):
        inv_a.refresh_from_db()
    assert inv_a.admitted_count == 0


def test_closed_event_does_not_admit(staff_a, ws_a, event_a, inv_a):
    event_a.status = Event.Status.CLOSED
    with workspace_context(ws_a):
        event_a.save()
    assert scan(client_for(staff_a), event_a, inv_a.token).data["result"] == "closed"


def test_staff_from_other_workspace_cannot_scan_this_event(admin_b, event_a, inv_a):
    r = scan(client_for(admin_b), event_a, inv_a.token)
    assert r.status_code == 404


def test_manual_admit_by_name_is_flagged(staff_a, ws_a, event_a, inv_a):
    c = client_for(staff_a)
    s = c.get("/api/scan/search/", {"event_id": event_a.pk, "q": "ami"})
    assert s.status_code == 200 and s.data[0]["name"] == "Amina Hassan"
    r = scan(c, event_a, invitation_id=s.data[0]["id"])
    assert r.data["result"] == "accepted"
    with workspace_context(ws_a):
        assert ScanLog.objects.get(result="accepted").manual is True


def test_scan_events_lists_only_my_workspaces(staff_a, event_a, event_b):
    r = client_for(staff_a).get("/api/scan/events/")
    assert [e["name"] for e in r.data] == ["Moses Nyoni Communion"]


def test_scan_log_endpoint_for_admin(api_a, staff_a, ws_a, event_a, inv_a):
    scan(client_for(staff_a), event_a, inv_a.token)
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/scans/")
    assert r.status_code == 200 and r.data["results"][0]["guest"] == "Amina Hassan" and r.data["results"][0]["staff"] == "Joseph Mwita"


def test_two_cards_three_people(staff_a, ws_a, event_a):
    inv = make_invitation(ws_a, event_a, name="Lyimo", phone="+255768112450", capacity=3)
    c = client_for(staff_a)
    results = [scan(c, event_a, inv.token).data["result"] for _ in range(4)]
    assert results == ["accepted", "accepted", "accepted", "exhausted"]


@pytest.fixture
def welcomes(monkeypatch):
    sent = []
    monkeypatch.setattr("apps.scanning.welcome.send_transactional_sms", lambda **kw: sent.append(kw))
    return sent


def test_welcome_sms_once_per_card_on_first_admission(staff_a, ws_a, event_a, inv_a, welcomes, django_capture_on_commit_callbacks):
    c = client_for(staff_a)
    with django_capture_on_commit_callbacks(execute=True):
        scan(c, event_a, inv_a.token)
    assert len(welcomes) == 1
    assert welcomes[0]["to"] == inv_a.phone and "Amina Hassan" in welcomes[0]["body"] and event_a.name in welcomes[0]["body"]
    with django_capture_on_commit_callbacks(execute=True):
        scan(c, event_a, inv_a.token)  # second person on the same card
        scan(c, event_a, inv_a.token)  # card used up
    assert len(welcomes) == 1


def test_welcome_sms_respects_switch_and_custom_text(api_a, staff_a, ws_a, event_a, inv_a, welcomes, django_capture_on_commit_callbacks):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/message/"
    r = api_a.patch(url, {"welcome_body": "Karibu {name}! Karibu {event}."}, format="json")
    assert r.status_code == 200 and r.data["welcome_preview"].startswith("Karibu Amina Hassan!")
    assert api_a.patch(url, {"welcome_body": "Your card {link}"}, format="json").status_code == 400
    other = make_invitation(ws_a, event_a, name="Grace Kimaro", phone="+255713909544")
    with django_capture_on_commit_callbacks(execute=True):
        scan(client_for(staff_a), event_a, inv_a.token)
    assert welcomes[-1]["body"] == f"Karibu Amina Hassan! Karibu {event_a.name}."
    api_a.patch(url, {"welcome_enabled": False}, format="json")
    with django_capture_on_commit_callbacks(execute=True):
        scan(client_for(staff_a), event_a, other.token)
    assert len(welcomes) == 1
