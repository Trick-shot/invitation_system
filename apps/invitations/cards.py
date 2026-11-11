"""
Card rendering: template image + QR at the slot. Generated once per
invitation and regenerated only when the template or slot changes.
"""

import io
import logging

import segno
from django.core.files.base import ContentFile
from django.db import transaction
from django_q.tasks import async_task
from PIL import Image

from apps.events.models import CardTemplate
from apps.tenancy.context import workspace_context

from .models import Invitation

log = logging.getLogger(__name__)


def render_card(template: CardTemplate, invitation: Invitation) -> bytes:
    x, y, size = template.slot_pixels()
    qr = segno.make(invitation.public_url, error="m")
    # Scale so the whole symbol, quiet zone included, fits the slot exactly.
    modules = qr.symbol_size(border=2)[0]
    scale = max(1, size // modules)
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale, border=2, dark="#111111", light="#ffffff")
    buf.seek(0)
    with Image.open(template.image) as base, Image.open(buf) as code:
        canvas = base.convert("RGB")
        code = code.convert("RGB").resize((size, size), Image.NEAREST)
        canvas.paste(code, (x, y))
        out = io.BytesIO()
        canvas.save(out, format="PNG", optimize=True)
        return out.getvalue()


def generate_card(invitation_id: int, workspace_id: int):
    """Background job. Always runs inside an explicit workspace context."""
    from apps.tenancy.models import Workspace

    workspace = Workspace.objects.get(pk=workspace_id)
    with workspace_context(workspace):
        invitation = Invitation.objects.select_related("event").filter(pk=invitation_id).first()
        if invitation is None:
            return "gone"
        template = CardTemplate.objects.filter(event=invitation.event).first()
        if template is None:
            Invitation.objects.filter(pk=invitation.pk).update(card_status=Invitation.CardStatus.PENDING, card_error="No template yet")
            return "no-template"
        Invitation.objects.filter(pk=invitation.pk).update(card_status=Invitation.CardStatus.GENERATING)
        try:
            png = render_card(template, invitation)
        except Exception as exc:
            log.exception("Card render failed for invitation %s", invitation_id)
            Invitation.objects.filter(pk=invitation.pk).update(card_status=Invitation.CardStatus.FAILED, card_error=str(exc)[:200])
            return "failed"
        if invitation.card:
            invitation.card.delete(save=False)
        invitation.card.save(f"{invitation.token}.png", ContentFile(png), save=False)
        invitation.card_status = Invitation.CardStatus.READY
        invitation.card_error = ""
        invitation.save(update_fields=["card", "card_status", "card_error", "updated_at"])
        return "ready"


def queue_card(invitation: Invitation):
    transaction.on_commit(lambda: async_task(generate_card, invitation.pk, invitation.workspace_id, group=f"cards:{invitation.event_id}"))


def regenerate_event_cards(event):
    ids = list(Invitation.objects.filter(event=event).values_list("pk", flat=True))
    Invitation.objects.filter(pk__in=ids).update(card_status=Invitation.CardStatus.PENDING)
    for pk in ids:
        transaction.on_commit(lambda pk=pk: async_task(generate_card, pk, event.workspace_id, group=f"cards:{event.pk}"))
    return len(ids)
