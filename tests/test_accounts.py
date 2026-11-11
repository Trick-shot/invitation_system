import pytest
from rest_framework.test import APIClient

from apps.tenancy.models import MemberInvite, Membership

from .conftest import client_for

pytestmark = pytest.mark.django_db


def test_invite_set_password_login_me(api_a, ws_a, mailoutbox):
    r = api_a.post(f"/api/workspaces/{ws_a.slug}/members/", {"email": "new@nyoni.tz", "full_name": "New Person", "role": "door_staff"})
    assert r.status_code == 201 and r.data["is_active"] is False
    invite = MemberInvite.objects.get(user__email="new@nyoni.tz")
    assert len(mailoutbox) == 1 and str(invite.token) in mailoutbox[0].body

    anon = APIClient()
    info = anon.get(f"/api/invites/{invite.token}/")
    assert info.status_code == 200 and info.data["workspace_name"] == ws_a.name and info.data["valid"]

    r = anon.post(f"/api/invites/{invite.token}/", {"password": "short"})
    assert r.status_code == 400
    r = anon.post(f"/api/invites/{invite.token}/", {"password": "long-enough-password-1"})
    assert r.status_code == 200
    assert Membership.objects.get(user__email="new@nyoni.tz").is_active
    assert anon.post(f"/api/invites/{invite.token}/", {"password": "long-enough-password-1"}).status_code == 400

    tok = anon.post("/api/auth/token/", {"email": "new@nyoni.tz", "password": "long-enough-password-1"})
    assert tok.status_code == 200 and "access" in tok.data
    anon.credentials(HTTP_AUTHORIZATION=f"Bearer {tok.data['access']}")
    me = anon.get("/api/me/")
    assert me.data["memberships"][0]["workspace"]["slug"] == ws_a.slug
    assert me.data["memberships"][0]["role"] == "door_staff"


def test_admin_cannot_remove_self(api_a, ws_a, admin_a):
    m = Membership.objects.get(user=admin_a, workspace=ws_a)
    assert api_a.delete(f"/api/workspaces/{ws_a.slug}/members/{m.pk}/").status_code == 400


def test_member_of_two_workspaces_sees_both(admin_a, ws_b):
    Membership.objects.create(user=admin_a, workspace=ws_b, role="door_staff", is_active=True)
    me = client_for(admin_a).get("/api/me/")
    assert {m["workspace"]["slug"] for m in me.data["memberships"]} == {"nyoni", "kili"}


def test_register_creates_workspace_and_signs_in():
    client = APIClient()
    r = client.post("/api/auth/register/", {"email": "new@owner.tz", "password": "long-enough-pass-1"}, content_type="application/json")
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["workspace"] == "new"
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    me = client.get("/api/me/").json()
    assert me["memberships"][0]["role"] == "admin"
    assert me["memberships"][0]["workspace"]["event_count"] == 0
    # same email again is refused
    r2 = client.post("/api/auth/register/", {"email": "new@owner.tz", "password": "long-enough-pass-1"}, content_type="application/json")
    assert r2.status_code == 400


def test_forgot_password_is_quiet_and_sends_a_link(mailoutbox, admin_a):
    client = APIClient()
    r = client.post("/api/auth/forgot/", {"email": "nobody@nowhere.tz"}, content_type="application/json")
    assert r.status_code == 200 and not mailoutbox
    r = client.post("/api/auth/forgot/", {"email": admin_a.email}, content_type="application/json")
    assert r.status_code == 200
    assert len(mailoutbox) == 1 and "/set-password/" in mailoutbox[0].body
