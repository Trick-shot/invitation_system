"""
Remove workspaces whose deletion hold has run out.

Each deletion also queues its own one-off job, so this is the safety net:
deploy/update.sh runs it with --schedule, which makes sure a daily sweep exists.
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Purge workspaces scheduled for deletion whose hold has passed. --schedule also ensures the daily sweep."

    def add_arguments(self, parser):
        parser.add_argument("--schedule", action="store_true", help="Create the daily sweep in django-q if it is missing")

    def handle(self, *args, schedule=False, **opts):
        from apps.tenancy.deletion import purge_due

        if schedule:
            from django_q.models import Schedule

            _, created = Schedule.objects.get_or_create(
                name="purge-deleted-workspaces",
                defaults={"func": "apps.tenancy.deletion.purge_due", "schedule_type": Schedule.DAILY},
            )
            self.stdout.write("Daily sweep " + ("created" if created else "already in place"))
        n = purge_due()
        self.stdout.write(f"Purged {n} workspace(s)")
