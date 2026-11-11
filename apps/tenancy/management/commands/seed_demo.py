"""
Demo data for local frontend work: one platform owner, two workspaces, an
open event with guests, cards rendered, a few scans. Idempotent.

    python manage.py seed_demo
"""
import datetime as dt
import io
import random

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.accounts.models import User
from apps.events.models import CardTemplate, Event, MessageTemplate
from apps.invitations.cards import generate_card
from apps.invitations.models import Invitation
from apps.scanning.service import admit
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Membership, Workspace

PASSWORD = "demo-password-123"

GUESTS = [
    ("Amina Hassan", "0712 345 678", 1), ("Joseph Mwita", "0755 111 222", 2), ("Grace Kimaro", "0713 909 544", 3),
    ("Neema Shirima", "0784 220 118", 2), ("Baraka Mollel", "0762 400 913", 1), ("Fatuma Juma", "0715 887 330", 2),
    ("Emmanuel Lyimo", "0768 112 450", 1), ("Zawadi Mushi", "0719 335 702", 3), ("Daniel Laizer", "0754 600 221", 2),
    ("Rehema Komba", "0786 345 009", 1), ("Peter Mushi", "0713 400 876", 2), ("Asha Mrema", "0765 909 121", 1),
]


def template_png():
    im = Image.new("RGB", (900, 1350), (250, 248, 244))
    d = ImageDraw.Draw(im)
    d.rectangle([40, 40, 860, 1310], outline=(180, 160, 110), width=4)
    d.text((320, 160), "YOU ARE INVITED", fill=(120, 120, 120))
    d.text((250, 260), "Moses Nyoni Communion", fill=(20, 20, 20))
    d.text((330, 330), "Edin and Edinson", fill=(80, 80, 80))
    d.text((290, 420), "14 December 2026, Mbagala", fill=(120, 120, 120))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


class Command(BaseCommand):
    help = "Create demo users, workspaces, an event with guests, cards and scans."

    def handle(self, *args, **options):
        owner, _ = User.objects.get_or_create(email="owner@trickshot.tech", defaults={"full_name": "Erick Luoga", "is_platform_owner": True, "is_staff": True, "is_superuser": True})
        owner.set_password(PASSWORD)
        owner.save()

        ws, _ = Workspace.objects.get_or_create(slug="nyoni", defaults={"name": "Nyoni Family Events"})
        ws2, _ = Workspace.objects.get_or_create(slug="kili", defaults={"name": "Kilimanjaro Weddings", "default_country": "KE"})
        people = [
            ("erick@nyoni.tz", "Erick Luoga", Membership.Role.ADMIN),
            ("neema@nyoni.tz", "Neema Shirima", Membership.Role.COORDINATOR),
            ("joseph@nyoni.tz", "Joseph Mwita", Membership.Role.DOOR_STAFF),
        ]
        users = {}
        for email, name, role in people:
            u, _ = User.objects.get_or_create(email=email, defaults={"full_name": name})
            u.set_password(PASSWORD)
            u.save()
            Membership.objects.update_or_create(user=u, workspace=ws, defaults={"role": role, "is_active": True})
            users[role] = u
        Membership.objects.update_or_create(user=users[Membership.Role.ADMIN], workspace=ws2, defaults={"role": Membership.Role.ADMIN, "is_active": True})

        with workspace_context(ws):
            ev, created = Event.objects.get_or_create(
                name="Moses Nyoni Communion",
                defaults={"workspace": ws, "kind": "communion", "date": dt.date(2026, 12, 14), "start_time": dt.time(14, 0), "venue": "Mbagala Parish Hall", "status": Event.Status.OPEN},
            )
            if not CardTemplate.objects.filter(event=ev).exists():
                t = CardTemplate(workspace=ws, event=ev, slot_x=0.33, slot_y=0.55, slot_size=0.34)
                t.image.save("template.png", ContentFile(template_png()), save=False)
                t.save()
            MessageTemplate.objects.get_or_create(event=ev, defaults={"workspace": ws, "body": "With hearts full of joy, the family of Mr and Mrs Moses Nyoni invite {name} to the first communion of their children. Your invitation card: {link}"})
            Event.objects.get_or_create(name="Kimaro Wedding", defaults={"workspace": ws, "kind": "wedding", "date": dt.date(2026, 11, 22), "venue": "Kunduchi Beach Hotel", "status": Event.Status.DRAFT})
            Event.objects.get_or_create(name="Lyimo Graduation", defaults={"workspace": ws, "kind": "graduation", "date": dt.date(2026, 8, 8), "venue": "Nkrumah Hall", "status": Event.Status.CLOSED})

            from apps.invitations.phones import normalise

            for name, phone, cap in GUESTS:
                inv, made = Invitation.objects.get_or_create(event=ev, phone=normalise(phone, ws.default_country), defaults={"workspace": ws, "name": name, "capacity": cap})
                if made or inv.card_status != Invitation.CardStatus.READY:
                    generate_card(inv.pk, ws.pk)

            staff = users[Membership.Role.DOOR_STAFF]
            random.seed(7)
            for inv in list(Invitation.objects.filter(event=ev))[:7]:
                for _ in range(random.randint(1, inv.capacity)):
                    admit(event=ev, token=inv.token, invitation=None, staff=staff, device_id="demo-phone", scanned_at=timezone.now())

        self.stdout.write(self.style.SUCCESS(f"Seeded. Sign in with erick@nyoni.tz / {PASSWORD} (admin), joseph@nyoni.tz (door staff), owner@trickshot.tech (platform)."))
