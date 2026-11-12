"""
Queue every existing card for re-rendering, e.g. after the card format changed
from PNG to JPEG. Links do not change: guests keep the same URL and QR code.

    python manage.py rerender_cards            # every workspace
    python manage.py rerender_cards --dry-run  # just count
"""

from django.core.management.base import BaseCommand

from apps.events.models import CardTemplate, Event
from apps.invitations.cards import regenerate_event_cards
from apps.tenancy.context import workspace_context


class Command(BaseCommand):
    help = "Re-render all invitation cards in the background queue."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **opts):
        with_template = CardTemplate.objects.all_workspaces().values_list("event_id", flat=True)
        events = Event.objects.all_workspaces().select_related("workspace").filter(pk__in=with_template)
        total = 0
        for event in events:
            with workspace_context(event.workspace):
                if dry_run:
                    from apps.invitations.models import Invitation

                    n = Invitation.objects.filter(event=event).count()
                else:
                    n = regenerate_event_cards(event)
            total += n
            self.stdout.write(f"{event.workspace.slug} / {event.name}: {n} cards")
        self.stdout.write(self.style.SUCCESS(f"{'Would queue' if dry_run else 'Queued'} {total} cards."))
