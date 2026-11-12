"""Guest page scan progress, the guests-expected onboarding answer, and email copy."""

from django.core import mail

from apps.tenancy.context import workspace_context

from .conftest import client_for
from .test_scanning import scan


def test_guest_page_shows_scan_progress_and_polls_do_not_count_as_views(staff_a, ws_a, event_a, inv_a):
    from rest_framework.test import APIClient

    c = APIClient()
    first = c.get(f"/api/i/{inv_a.token}/").data
    assert first["admitted_count"] == 0 and first["capacity"] == 2 and first["entries"] == []
    scan(client_for(staff_a), event_a, inv_a.token)
    polled = c.get(f"/api/i/{inv_a.token}/", {"poll": 1}).data
    assert polled["admitted_count"] == 1 and len(polled["entries"]) == 1
    with workspace_context(ws_a):
        inv_a.refresh_from_db()
    assert inv_a.view_count == 1


def test_onboarding_saves_guest_estimate(api_a, ws_a, event_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/"
    r = api_a.patch(url, {"guests_estimate_band": "100_300", "guests_estimate": 250}, format="json")
    assert r.status_code == 200 and r.data["guests_estimate_band"] == "100_300" and r.data["guests_estimate"] == 250
    assert api_a.patch(url, {"guests_estimate_band": "lots"}, format="json").status_code == 400


def test_emails_match_the_designs(ws_a, admin_a, event_a):
    from apps.accounts.emails import send_code_email, send_invite_email, send_reset_email

    send_reset_email(user=admin_a, url="https://x/set-password/t")
    html = mail.outbox[-1].alternatives[0][0]
    assert "We received a request to reset the password for" in html and "safely ignore this email" in html
    assert "Reply to this email if you did not expect it" in html

    send_invite_email(user=admin_a, workspace=ws_a, url="https://x/set-password/t", inviter=admin_a, role="door_staff", event=event_a)
    html = mail.outbox[-1].alternatives[0][0]
    assert "/email/staff-badge.png" in html and "<li" in html and "Set a password to get started." in html and 'width="100%"' in html

    send_code_email(email="a@b.co", code="482190")
    html = mail.outbox[-1].alternatives[0][0]
    assert "482 190" in html and "Questions? Write to" in html and "Reply to this email" not in html


def test_guest_activity_lists_who_admitted(api_a, staff_a, ws_a, event_a, inv_a):
    scan(client_for(staff_a), event_a, inv_a.token)
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_a.pk}/activity/")
    assert r.status_code == 200 and len(r.data["admissions"]) == 1 and r.data["admissions"][0]["by"]


def test_guest_can_be_edited(api_a, ws_a, event_a, inv_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_a.pk}/"
    r = api_a.patch(url, {"name": "Amina H. Juma", "capacity": 3}, format="json")
    assert r.status_code == 200 and r.data["name"] == "Amina H. Juma" and r.data["capacity"] == 3


def test_editing_keeps_own_number_without_duplicate_error(api_a, ws_a, event_a, inv_a):
    url = f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_a.pk}/"
    r = api_a.patch(url, {"name": "Amina", "phone": "+255 712 345 678", "capacity": 2}, format="json")
    assert r.status_code == 200, r.data


def test_dashboard_after_scans_buckets_arrivals_by_hour(api_a, staff_a, ws_a, event_a, inv_a):
    """Regression: the overview 500'd on MySQL once a guest was scanned (TruncHour needs tz tables)."""
    scan(client_for(staff_a), event_a, inv_a.token)
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/dashboard/")
    assert r.status_code == 200
    assert sum(b["count"] for b in r.data["arrivals_by_hour"]) == 1
    assert r.data["arrivals_by_hour"][0]["hour"].endswith(":00:00+03:00")
