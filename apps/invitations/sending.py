"""
Send jobs. One Delivery row per attempt; the job sends it, records the
provider's answer and meters usage. Resends create a new Delivery with the
next sequence number so the dashboard can report rework honestly.
"""

import logging

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django_q.tasks import async_task

from apps.events.models import MessageTemplate
from apps.messaging.providers import (
    ProviderError,
    ProviderTransientError,
    get_provider_for,
)
from apps.messaging.service import record_usage
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Workspace

from .models import Delivery, Invitation

log = logging.getLogger(__name__)


class SendBlocked(Exception):
    pass


def queue_send(*, event, invitation_ids, user) -> list[int]:
    """Create queued Delivery rows and enqueue one job per row. Returns delivery ids."""
    message = MessageTemplate.objects.filter(event=event).first()
    if message is None or not message.body.strip():
        raise SendBlocked("Write the invitation message first.")
    invitations = Invitation.objects.filter(event=event, pk__in=invitation_ids, card_status=Invitation.CardStatus.READY)
    not_ready = len(invitation_ids) - invitations.count()
    if not_ready:
        raise SendBlocked(f"{not_ready} card(s) are not generated yet. Wait a moment or check the template.")
    created = []
    with transaction.atomic():
        for inv in invitations:
            last = Delivery.objects.filter(invitation=inv).aggregate(m=Max("sequence"))["m"] or 0
            body = message.render(name=inv.name, link=inv.public_url)
            d = Delivery.objects.create(
                workspace=event.workspace,
                invitation=inv,
                channel=message.channel,
                sequence=last + 1,
                body=body,
                sent_by=user,
            )
            created.append(d.pk)
    for pk in created:
        transaction.on_commit(lambda pk=pk: async_task(send_delivery, pk, event.workspace_id, group=f"send:{event.pk}"))
    return created


def send_delivery(delivery_id: int, workspace_id: int):
    workspace = Workspace.objects.get(pk=workspace_id)
    with workspace_context(workspace):
        delivery = Delivery.objects.select_related("invitation").filter(pk=delivery_id, status=Delivery.Status.QUEUED).first()
        if delivery is None:
            return "skipped"
        provider = get_provider_for(workspace)
        try:
            result = provider.send(to=delivery.invitation.phone, body=delivery.body, reference=f"d{delivery.pk}")
        except ProviderTransientError as exc:
            # Let Django-Q retry by raising; mark the error so the UI can show it meanwhile.
            Delivery.objects.filter(pk=delivery.pk).update(error=str(exc)[:300], updated_at=timezone.now())
            raise
        except ProviderError as exc:
            Delivery.objects.filter(pk=delivery.pk).update(
                status=Delivery.Status.FAILED, error=str(exc)[:300], provider=provider.name, updated_at=timezone.now()
            )
            return "failed"
        Delivery.objects.filter(pk=delivery.pk).update(
            status=Delivery.Status.SENT,
            provider=provider.name,
            provider_message_id=result.provider_message_id,
            error="",
            updated_at=timezone.now(),
        )
        record_usage(workspace, delivery.channel)
        return "sent"
