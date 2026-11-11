import pytest

from apps.events.models import CardTemplate, MessageTemplate
from apps.tenancy.context import workspace_context

from .conftest import png_bytes

pytestmark = pytest.mark.django_db


def test_create_event_seeds_message_in_workspace_language(api_a, ws_a):
    r = api_a.post(f"/api/workspaces/{ws_a.slug}/events/", {"name": "Kimaro Wedding", "kind": "wedding", "date": "2027-03-06", "venue": "Kunduchi"})
    assert r.status_code == 201
    with workspace_context(ws_a):
        msg = MessageTemplate.objects.get(event_id=r.data["id"])
    assert "{link}" in msg.body and msg.language == "en"


def test_template_upload_and_slot_pixels(api_a, ws_a):
    ev = api_a.post(f"/api/workspaces/{ws_a.slug}/events/", {"name": "E", "date": "2027-01-01"}).data
    r = api_a.put(
        f"/api/workspaces/{ws_a.slug}/events/{ev['id']}/template/",
        {"image": png_bytes(800, 1200), "slot_x": 0.4, "slot_y": 0.6, "slot_size": 0.25},
        format="multipart",
    )
    assert r.status_code == 201, r.data
    assert r.data["width"] == 800 and r.data["height"] == 1200
    with workspace_context(ws_a):
        t = CardTemplate.objects.get(event_id=ev["id"])
    assert t.slot_pixels() == (320, 720, 200)


def test_slot_is_clamped_inside_image(ws_a, event_a):
    with workspace_context(ws_a):
        t = CardTemplate.objects.get(event=event_a)
    t.slot_x, t.slot_y, t.slot_size = 0.95, 0.99, 0.3
    x, y, size = t.slot_pixels()
    assert x + size <= t.width and y + size <= t.height


def test_message_requires_link_and_reports_segments(api_a, ws_a, event_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/message/"
    assert api_a.put(url, {"body": "no link here"}).status_code == 400
    r = api_a.put(url, {"body": "Welcome {name}. " + "x" * 150 + " {link}"})
    assert r.status_code == 200 and r.data["segments"]["segments"] == 2 and r.data["segments"]["encoding"] == "GSM-7"
    r = api_a.put(url, {"body": "Welcome {name} 🎉 {link}"})
    assert r.data["segments"]["encoding"] == "UCS-2"


def test_changing_template_invalidates_cards(api_a, ws_a, event_a, inv_a):
    assert inv_a.card_status == "ready"
    r = api_a.patch(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/template/", {"slot_x": 0.1})
    assert r.status_code == 200
    with workspace_context(ws_a):
        inv_a.refresh_from_db()
    assert inv_a.card_status == "ready"  # regenerated inline because Q runs sync in tests
    assert inv_a.card.name.endswith(f"{inv_a.token}.png")


def test_dashboard_shape(api_a, ws_a, event_a, inv_a):
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/dashboard/")
    assert r.status_code == 200
    assert r.data["tiles"]["arrived"]["of"] == 2
    assert [s["stage"] for s in r.data["funnel"]] == ["invited", "sent", "delivered", "opened", "arrived"]
