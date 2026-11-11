import pytest

from apps.tenancy.models import MemberInvite, Membership, Workspace, WorkspaceCredential

from .conftest import client_for

pytestmark = pytest.mark.django_db


def test_owner_creates_workspace_and_invites_admin(owner, mailoutbox):
    c = client_for(owner)
    r = c.post(
        "/api/platform/workspaces/",
        {"name": "Dodoma Conference Co", "default_country": "TZ", "admin_email": "peter@dodoma.tz", "admin_name": "Peter Mushi"},
    )
    assert r.status_code == 201 and r.data["slug"] == "dodoma-conference-co" and r.data["setup"] == "invite_not_accepted"
    ws = Workspace.objects.get(slug="dodoma-conference-co")
    assert Membership.objects.get(workspace=ws).role == "admin"
    assert MemberInvite.objects.filter(workspace=ws).exists() and len(mailoutbox) == 1
    r2 = c.post("/api/platform/workspaces/", {"name": "Dodoma Conference Co"})
    assert r2.data["slug"] == "dodoma-conference-co-2"


def test_non_owner_forbidden(api_a):
    assert api_a.get("/api/platform/workspaces/").status_code == 403


def test_settings_and_credentials_are_write_only(api_a, ws_a):
    url = f"/api/workspaces/{ws_a.slug}/settings/"
    r = api_a.patch(url, {"default_country": "KE", "default_language": "en"})
    assert r.status_code == 200 and r.data["default_country"] == "KE" and r.data["messaging"]["mode"] == "platform"
    r = api_a.put(url + "credentials/", {"sender_id": "NYONI", "api_key": "abcd1234efgh", "secret_key": "s3cr3t"})
    assert r.status_code == 200 and r.data["mode"] == "own" and r.data["api_key_masked"] == "abcd…gh"
    assert "abcd1234efgh" not in str(api_a.get(url).content)
    cred = WorkspaceCredential.objects.get(workspace=ws_a)
    assert cred.get_secrets() == ("abcd1234efgh", "s3cr3t") and b"abcd1234efgh" not in bytes(cred.api_key_enc)
    assert api_a.delete(url + "credentials/").status_code == 204
    assert api_a.get(url).data["messaging"]["mode"] == "platform"


def test_coordinator_cannot_change_settings(coordinator_a, ws_a):
    assert client_for(coordinator_a).patch(f"/api/workspaces/{ws_a.slug}/settings/", {"name": "X"}).status_code == 403


def test_export_contains_only_own_data(api_a, ws_a, inv_a, inv_b):
    r = api_a.get(f"/api/workspaces/{ws_a.slug}/export/")
    assert r.status_code == 200
    names = [g["name"] for g in r.data["guests"]]
    assert names == ["Amina Hassan"]
