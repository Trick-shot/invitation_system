"""
Cross-tenant isolation. Every endpoint: workspace A's user asking for
workspace B's object gets 404, never 403 and never data.
"""

import pytest

from apps.invitations.models import Invitation
from apps.tenancy.context import WorkspaceContextRequired, workspace_context
from apps.tenancy.models import Workspace

from .conftest import client_for

pytestmark = pytest.mark.django_db


def test_scoped_manager_refuses_without_context(inv_a):
    with pytest.raises(WorkspaceContextRequired):
        list(Invitation.objects.all())


def test_scoped_manager_filters_by_context(ws_a, ws_b, inv_a, inv_b):
    with workspace_context(ws_a):
        assert list(Invitation.objects.values_list("name", flat=True)) == ["Amina Hassan"]
    with workspace_context(ws_b):
        assert list(Invitation.objects.values_list("name", flat=True)) == ["Grace Wanjiku"]
    assert Invitation.objects.all_workspaces().count() == 2


@pytest.mark.parametrize(
    "path",
    [
        "/api/workspaces/{slug}/events/",
        "/api/workspaces/{slug}/events/{event}/",
        "/api/workspaces/{slug}/events/{event}/dashboard/",
        "/api/workspaces/{slug}/events/{event}/template/",
        "/api/workspaces/{slug}/events/{event}/message/",
        "/api/workspaces/{slug}/events/{event}/invitations/",
        "/api/workspaces/{slug}/events/{event}/invitations/{inv}/",
        "/api/workspaces/{slug}/events/{event}/scans/",
        "/api/workspaces/{slug}/members/",
        "/api/workspaces/{slug}/settings/",
        "/api/workspaces/{slug}/export/",
    ],
)
def test_workspace_a_admin_cannot_read_workspace_b(api_a, ws_b, event_b, inv_b, path):
    url = path.format(slug=ws_b.slug, event=event_b.pk, inv=inv_b.pk)
    r = api_a.get(url)
    assert r.status_code == 404, (url, r.status_code, r.content[:200])


def test_event_id_from_other_workspace_under_own_slug_is_404(api_a, ws_a, event_b):
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_b.pk}/")
    assert r.status_code == 404
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_b.pk}/invitations/")
    assert r.status_code == 404


def test_invitation_from_other_workspace_under_own_event_is_404(api_a, ws_a, event_a, inv_b):
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/{inv_b.pk}/")
    assert r.status_code == 404


def test_non_member_gets_404_not_403(ws_a, db):
    from .conftest import make_user

    stranger = make_user("x@y.z")
    r = client_for(stranger).get(f"/api/workspaces/{ws_a.slug}/events/")
    assert r.status_code == 404


def test_inactive_member_is_a_stranger(ws_a, db):
    from .conftest import make_user, member

    u = make_user("pending@nyoni.tz")
    member(u, ws_a, "admin", active=False)
    assert client_for(u).get(f"/api/workspaces/{ws_a.slug}/events/").status_code == 404


def test_suspended_workspace_is_unreachable(api_a, ws_a):
    ws_a.status = Workspace.Status.SUSPENDED
    ws_a.save()
    assert api_a.get(f"/api/workspaces/{ws_a.slug}/events/").status_code == 404


def test_door_staff_cannot_manage(staff_a, ws_a, event_a):
    c = client_for(staff_a)
    assert c.get(f"/api/workspaces/{ws_a.slug}/events/").status_code == 200
    assert c.post(f"/api/workspaces/{ws_a.slug}/events/", {"name": "X", "date": "2026-01-01"}).status_code == 403
    assert c.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/dashboard/").status_code == 403
    assert c.get(f"/api/workspaces/{ws_a.slug}/members/").status_code == 403


def test_coordinator_can_manage_guests_but_not_members(coordinator_a, ws_a, event_a):
    c = client_for(coordinator_a)
    r = c.post(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/", {"name": "Z", "phone": "0712 000 111", "capacity": 1})
    assert r.status_code == 201
    assert c.post(f"/api/workspaces/{ws_a.slug}/members/", {"email": "a@b.c", "role": "admin"}).status_code == 403


def test_platform_owner_cannot_read_guest_data(owner, ws_a, event_a, inv_a):
    c = client_for(owner)
    assert c.get(f"/api/workspaces/{ws_a.slug}/events/{event_a.pk}/invitations/").status_code == 404
    r = c.get("/api/platform/workspaces/")
    assert r.status_code == 200
    body = str(r.content)
    assert "Amina" not in body and "+255712" not in body


def test_unauthenticated_is_401_everywhere(ws_a, event_a):
    from rest_framework.test import APIClient

    c = APIClient()
    assert c.get(f"/api/workspaces/{ws_a.slug}/events/").status_code == 401
    assert c.get("/api/me/").status_code == 401
    assert c.post("/api/scan/", {}).status_code == 401
