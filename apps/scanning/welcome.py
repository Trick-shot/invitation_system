"""
The arrival SMS. Queued after the first admission on a card commits, so a
card for four people sends one welcome, not four. A failed send never
affects the door: the guest is already in.
"""

import logging

from apps.events.models import MessageTemplate
from apps.invitations.models import Invitation
from apps.messaging.providers import ProviderError, ProviderTransientError
from apps.messaging.service import send_transactional_sms
from apps.tenancy.context import workspace_context
from apps.tenancy.models import Workspace

log = logging.getLogger(__name__)


def send_welcome(invitation_id: int, workspace_id: int):
    workspace = Workspace.objects.get(pk=workspace_id)
    with workspace_context(workspace):
        inv = Invitation.objects.select_related("event").filter(pk=invitation_id).first()
        if inv is None or not inv.phone:
            return "skipped"
        message = MessageTemplate.objects.filter(event=inv.event).first()
        if message is None or not message.welcome_enabled or not message.welcome_body.strip():
            return "off"
        try:
            send_transactional_sms(
                workspace=workspace, to=inv.phone, body=message.render_welcome(name=inv.name), reference=f"w{inv.pk}",
                kind="welcome", event=inv.event, invitation=inv, recipient=inv.name,
            )
        except ProviderTransientError:
            raise  # Django-Q retries
        except ProviderError as exc:
            log.warning("welcome sms failed for invitation %s: %s", inv.pk, exc)
            return "failed"
        return "sent"
