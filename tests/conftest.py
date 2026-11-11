import datetime as dt
import io

import pytest
from django.db import transaction
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.events.models import CardTemplate, Event, MessageTemplate
from apps.invitations.models import Invitation
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Membership, Workspace


@pytest.fixture(autouse=True)
def no_ssl_redirect(settings):
    # Production forces https; the test client speaks plain http and would get 301s.
    settings.SECURE_SSL_REDIRECT = False


@pytest.fixture(autouse=True)
def run_on_commit_now(monkeypatch, settings):
    """Tests run inside a transaction, so on_commit hooks would never fire. Run them inline."""
    monkeypatch.setattr(transaction, "on_commit", lambda fn, using=None, robust=False: fn())
    settings.Q_CLUSTER = {**settings.Q_CLUSTER, "sync": True}
    settings.MESSAGING = {**settings.MESSAGING, "DEFAULT_PROVIDER": "console"}
    settings.MEDIA_ROOT = "/tmp/invitation-test-media"
    settings.FIELD_ENCRYPTION_KEY = "u4lhUeeUbJPtXwMo2OT2U8H8tVxH2A1nZpM1nQ0tXGk="


def make_user(email, password="correct-horse-battery", **kw):
    return User.objects.create_user(email=email, password=password, **kw)


def make_workspace(name, slug, country="TZ"):
    return Workspace.objects.create(name=name, slug=slug, default_country=country)


def member(user, ws, role, active=True):
    return Membership.objects.create(user=user, workspace=ws, role=role, is_active=active)


@pytest.fixture
def ws_a(db):
    return make_workspace("Nyoni Family Events", "nyoni")


@pytest.fixture
def ws_b(db):
    return make_workspace("Kilimanjaro Weddings", "kili", country="KE")


@pytest.fixture
def admin_a(ws_a):
    u = make_user("erick@nyoni.tz", full_name="Erick Luoga")
    member(u, ws_a, Membership.Role.ADMIN)
    return u


@pytest.fixture
def coordinator_a(ws_a):
    u = make_user("neema@nyoni.tz", full_name="Neema Shirima")
    member(u, ws_a, Membership.Role.COORDINATOR)
    return u


@pytest.fixture
def staff_a(ws_a):
    u = make_user("joseph@nyoni.tz", full_name="Joseph Mwita")
    member(u, ws_a, Membership.Role.DOOR_STAFF)
    return u


@pytest.fixture
def admin_b(ws_b):
    u = make_user("asha@kili.ke", full_name="Asha Mrema")
    member(u, ws_b, Membership.Role.ADMIN)
    return u


@pytest.fixture
def owner(db):
    return make_user("owner@trickshot.tech", is_platform_owner=True)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def api_a(admin_a):
    return client_for(admin_a)


@pytest.fixture
def api_b(admin_b):
    return client_for(admin_b)


def png_bytes(w=600, h=900, color=(250, 248, 244)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    buf.seek(0)
    buf.name = "template.png"
    return buf


def make_event(ws, name="Moses Nyoni Communion", status=Event.Status.OPEN, with_template=True, with_message=True):
    with workspace_context(ws):
        ev = Event.objects.create(
            workspace=ws, name=name, kind="communion", date=dt.date(2026, 12, 14), venue="Mbagala Parish Hall", status=status
        )
        if with_template:
            from django.core.files.base import ContentFile

            t = CardTemplate(workspace=ws, event=ev, slot_x=0.3, slot_y=0.6, slot_size=0.3)
            t.image.save("template.png", ContentFile(png_bytes().read()), save=False)
            t.save()
        if with_message:
            MessageTemplate.objects.create(workspace=ws, event=ev, body="Welcome {name}. Your card: {link}")
        return ev


def make_invitation(ws, event, name="Amina Hassan", phone="+255712345678", capacity=2):
    with workspace_context(ws):
        inv = Invitation.objects.create(workspace=ws, event=event, name=name, phone=phone, capacity=capacity)
        from apps.invitations.cards import generate_card

        generate_card(inv.pk, ws.pk)
        inv.refresh_from_db()
        return inv


@pytest.fixture
def event_a(ws_a):
    return make_event(ws_a)


@pytest.fixture
def event_b(ws_b):
    return make_event(ws_b, name="Mrema Wedding")


@pytest.fixture
def inv_a(ws_a, event_a):
    return make_invitation(ws_a, event_a)


@pytest.fixture
def inv_b(ws_b, event_b):
    return make_invitation(ws_b, event_b, name="Grace Wanjiku", phone="+254712345678")
