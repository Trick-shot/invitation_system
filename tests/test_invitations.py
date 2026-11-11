import pytest
from PIL import Image

from apps.invitations.importers import (
    build_preview,
    parse_csv,
    parse_pasted,
    parse_vcard,
)
from apps.invitations.models import Delivery, Invitation
from apps.invitations.phones import PhoneError, normalise
from apps.tenancy.context import workspace_context
from apps.tenancy.models import UsageRecord

pytestmark = pytest.mark.django_db


def test_phone_normalisation_uses_workspace_country():
    assert normalise("0712 345 678", "TZ") == "+255712345678"
    assert normalise("0712 345 678", "KE") == "+254712345678"
    assert normalise("+255 712 345 678", "KE") == "+255712345678"
    with pytest.raises(PhoneError):
        normalise("0712", "TZ")
    with pytest.raises(PhoneError):
        normalise("", "TZ")


def test_create_invitation_normalises_and_generates_card(api_a, ws_a, event_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/"
    r = api_a.post(url, {"name": "Joseph Mwita", "phone": "0755 111 222", "capacity": 3})
    assert r.status_code == 201, r.data
    assert r.data["phone"] == "+255755111222" and r.data["card_status"] == "ready"
    assert len(r.data["token"]) >= 12
    with workspace_context(ws_a):
        inv = Invitation.objects.get(pk=r.data["id"])
    with Image.open(inv.card.path) as im:
        assert im.size == (600, 900)
        # The QR sits at the slot: a dark module should exist inside it, none at the top-left corner.
        assert im.getpixel((5, 5)) == (250, 248, 244)
        x, y, size = event_a.template.slot_pixels()
        assert any(im.getpixel((x + i, y + size // 2)) == (17, 17, 17) for i in range(size))


def test_duplicate_phone_per_event_rejected_but_allowed_across_events(api_a, ws_a, event_a, inv_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/"
    assert api_a.post(url, {"name": "Twin", "phone": "0712345678"}).status_code == 400
    from .conftest import make_event

    other = make_event(ws_a, name="Second")
    assert (
        api_a.post(f"/api/workspaces/{ws_a.slug}/events/{other.pk}/invitations/", {"name": "Twin", "phone": "0712345678"}).status_code
        == 201
    )


def test_capacity_bounds(api_a, ws_a, event_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/"
    assert api_a.post(url, {"name": "A", "phone": "0712000001", "capacity": 0}).status_code == 400
    assert api_a.post(url, {"name": "A", "phone": "0712000001", "capacity": 21}).status_code == 400
    assert api_a.post(url, {"name": "A", "phone": "0712000001", "capacity": 12}).status_code == 201


def test_import_flags_capacity_over_limit(api_a, ws_a, event_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/import/preview/"
    r = api_a.post(
        url,
        {
            "source": "rows",
            "rows": [{"name": "Bus", "phone": "0712000009", "capacity": 40}, {"name": "Table", "phone": "0712000010", "capacity": 8}],
        },
        format="json",
    )
    assert r.status_code == 200
    by = {row["name"]: row for row in r.data["rows"]}
    assert by["Bus"]["status"] == "needs_attention" and "1 and 20" in by["Bus"]["reason"]
    assert by["Table"]["status"] == "ready" and by["Table"]["capacity"] == 8


def test_parse_pasted_variants():
    rows = list(parse_pasted("Amina Hassan, 0712 345 678\nJoseph Mwita 0755111222 2\n+255784330905\nGrace;0713909544;3"))
    assert rows[0] == ("Amina Hassan", "0712 345 678", 1)
    assert rows[1] == ("Joseph Mwita", "0755111222", 2)
    assert rows[2] == ("", "+255784330905", 1)
    assert rows[3] == ("Grace", "0713909544", 3)


def test_parse_csv_with_and_without_header():
    assert list(parse_csv(b"name,phone,admits\nAmina,0712345678,2\n")) == [("Amina", "0712345678", 2)]
    assert list(parse_csv(b"Amina,0712345678\n")) == [("Amina", "0712345678", 1)]


def test_parse_vcard_prefers_mobile():
    vcf = b"BEGIN:VCARD\nVERSION:3.0\nFN:Amina Hassan\nTEL;TYPE=WORK:+255222111000\nTEL;TYPE=CELL:+255712345678\nEND:VCARD\n"
    assert list(parse_vcard(vcf)) == [("Amina Hassan", "+255712345678", 1)]


def test_preview_flags_duplicates_and_bad_numbers():
    rows = [("Amina", "0712345678", 1), ("Amina again", "+255 712 345 678", 1), ("", "0712", 1), ("Existing", "0755111222", 1)]
    p = build_preview(rows, default_country="TZ", existing_phones={"+255755111222"})
    assert [r["status"] for r in p["rows"]] == ["ready", "duplicate", "needs_attention", "duplicate"]
    assert p["counts"] == {"ready": 1, "duplicate": 2, "needs_attention": 1}


def test_import_preview_and_commit(api_a, ws_a, event_a):
    base = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/import/"
    p = api_a.post(base + "preview/", {"source": "paste", "text": "Amina Hassan, 0712 345 678\nJoseph, 0755111222, 2\nBroken, 0712"})
    assert p.status_code == 200 and p.data["counts"]["ready"] == 2
    ready = [{"name": r["name"], "phone": r["phone"], "capacity": r["capacity"]} for r in p.data["rows"] if r["status"] == "ready"]
    c = api_a.post(base + "commit/", {"rows": ready}, format="json")
    assert c.status_code == 201 and c.data["created"] == 2
    c2 = api_a.post(base + "commit/", {"rows": ready}, format="json")
    assert c2.data["created"] == 0 and len(c2.data["skipped"]) == 2


def test_send_creates_delivery_and_meters_usage(api_a, ws_a, event_a, inv_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/send/"
    r = api_a.post(url, {"invitation_ids": [inv_a.pk]}, format="json")
    assert r.status_code == 202 and r.data["queued"] == 1
    with workspace_context(ws_a):
        d = Delivery.objects.get(invitation=inv_a)
    assert d.status == "sent" and d.sequence == 1 and inv_a.public_url in d.body and "Amina" in d.body
    assert UsageRecord.objects.get(workspace=ws_a, channel="sms").count == 1
    prog = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/send/progress/")
    assert prog.data["counts"]["sent"] == 1


def test_send_blocked_without_ready_card(api_a, ws_a, event_a):
    from .conftest import make_event

    bare = make_event(ws_a, name="No template", with_template=False)
    with workspace_context(ws_a):
        inv = Invitation.objects.create(workspace=ws_a, event=bare, name="X", phone="+255712000000")
    r = api_a.post(f"/api/workspaces/{ws_a.slug}/events/{bare.pk}/invitations/send/", {"invitation_ids": [inv.pk]}, format="json")
    assert r.status_code == 400 and "not generated" in str(r.data)


def test_failed_send_then_resend_increments_sequence(api_a, ws_a, event_a, inv_a, monkeypatch):
    from apps.invitations import sending
    from apps.messaging.providers import ConsoleProvider, ProviderError

    class Failing(ConsoleProvider):
        def send(self, **kw):
            raise ProviderError("number not in service")

    monkeypatch.setattr(sending, "get_provider_for", lambda ws: Failing())
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/send/"
    api_a.post(url, {"invitation_ids": [inv_a.pk]}, format="json")
    with workspace_context(ws_a):
        assert Delivery.objects.get(invitation=inv_a).status == "failed"
    monkeypatch.setattr(sending, "get_provider_for", lambda ws: ConsoleProvider())
    r = api_a.post(url, {"only_failed": True}, format="json")
    assert r.data["queued"] == 1
    with workspace_context(ws_a):
        seqs = list(Delivery.objects.filter(invitation=inv_a).order_by("sequence").values_list("sequence", "status"))
    assert seqs == [(1, "failed"), (2, "sent")]
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/dashboard/").data["resends"] == 1


def test_delivery_webhook_updates_status(api_a, ws_a, event_a, inv_a):
    from rest_framework.test import APIClient

    api_a.post(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/send/", {"invitation_ids": [inv_a.pk]}, format="json")
    with workspace_context(ws_a):
        d = Delivery.objects.get(invitation=inv_a)
    r = APIClient().post("/api/webhooks/delivery/", {"request_id": d.provider_message_id, "status": "DELIVERED"}, format="json")
    assert r.status_code == 200 and r.data["ok"]
    with workspace_context(ws_a):
        assert Delivery.objects.get(pk=d.pk).status == "delivered"


def test_public_link_states(ws_a, event_a, inv_a):
    from rest_framework.test import APIClient

    c = APIClient()
    assert c.get("/api/i/does-not-exist/").status_code == 404
    r = c.get(f"/api/i/{inv_a.token}/")
    assert r.status_code == 200 and r.data["state"] == "ready" and r.data["card_url"].endswith(".png")
    assert "workspace" not in r.data
    c.get(f"/api/i/{inv_a.token}/")
    with workspace_context(ws_a):
        inv_a.refresh_from_db()
    assert inv_a.view_count == 2 and inv_a.first_viewed_at is not None
    event_a.status = "closed"
    event_a.save()
    assert c.get(f"/api/i/{inv_a.token}/").data["state"] == "finished"


def test_parse_xlsx_with_numeric_phone_cells():
    import io

    from openpyxl import Workbook

    from apps.invitations.importers import parse_xlsx

    wb = Workbook()
    ws = wb.active
    ws.append(["Guest", "Phone number", "Admits"])
    ws.append(["Amina Hassan", 712345678, 2])  # typed as a number, leading zero lost: the normaliser restores +255
    ws.append(["Joseph Mwita", "+255 755 111 222", None])
    ws.append([None, None, None])
    buf = io.BytesIO()
    wb.save(buf)
    rows = list(parse_xlsx(buf.getvalue()))
    assert rows == [("Amina Hassan", "712345678", 2), ("Joseph Mwita", "+255 755 111 222", 1)]


def test_import_preview_accepts_xlsx_upload(api_a, ws_a, event_a):
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["name", "phone"])
    wb.active.append(["Grace Kimaro", "0713 909 544"])
    buf = io.BytesIO()
    wb.save(buf)
    f = SimpleUploadedFile("guests.xlsx", buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    r = api_a.post(
        f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/import/preview/", {"source": "csv", "file": f}, format="multipart"
    )
    assert r.status_code == 200 and r.data["rows"][0]["phone"] == "+255713909544" and r.data["counts"]["ready"] == 1


def test_template_download_round_trips_through_the_importer(api_a, ws_a, event_a):
    from apps.invitations.importers import parse_xlsx

    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/import/template/")
    assert r.status_code == 200 and r["Content-Disposition"].endswith('guest-list-template.xlsx"')
    rows = list(parse_xlsx(r.content))
    assert rows == [("Amina Hassan", "0712 345 678", 1), ("Joseph Mwita", "+255 755 111 222", 2)]


def test_import_whole_file_problems_are_distinct(api_a, ws_a, event_a):
    from django.core.files.uploadedfile import SimpleUploadedFile

    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/import/preview/"
    r = api_a.post(url, {"source": "xlsx", "file": SimpleUploadedFile("list.xlsx", b"%PDF-1.4 not a sheet")}, format="multipart")
    assert r.status_code == 422 and r.data["code"] == "unreadable"
    r = api_a.post(url, {"source": "csv", "file": SimpleUploadedFile("list.csv", b"Name,Table\nAmina,4\nJoseph,7\n")}, format="multipart")
    assert r.status_code == 422 and r.data["code"] == "no_phone_column" and r.data["headings"] == ["Name", "Table"]
    r = api_a.post(url, {"source": "csv", "file": SimpleUploadedFile("list.csv", b"\n\n")}, format="multipart")
    assert r.status_code == 422 and r.data["code"] == "empty"
    r = api_a.post(url, {"source": "csv", "file": SimpleUploadedFile("old.xls", b"junk")}, format="multipart")
    assert r.status_code == 400 and r.data["code"] == "old_excel"
