"""
Small façade so other apps never touch providers directly, and so every
message, invitation or not, is metered against its workspace.
"""

import uuid

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.tenancy.models import UsageRecord

from .providers import SendResult, get_provider_for


def record_usage(workspace, channel: str = "sms", n: int = 1):
    now = timezone.now()
    with transaction.atomic():
        row, _ = UsageRecord.objects.get_or_create(workspace=workspace, year=now.year, month=now.month, channel=channel)
        UsageRecord.objects.filter(pk=row.pk).update(count=F("count") + n)


def send_transactional_sms(*, workspace, to: str, body: str, reference: str | None = None) -> SendResult:
    provider = get_provider_for(workspace)
    result = provider.send(to=to, body=body, reference=reference or uuid.uuid4().hex)
    record_usage(workspace, "sms")
    return result


# GSM-7 basic set; anything outside it forces UCS-2 and halves the segment size.
_GSM7 = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXT = set("^{}\\[~]|€")


def sms_segments(text: str) -> dict:
    """Character count and SMS segment count, the way the message editor shows them."""
    if all(c in _GSM7 or c in _GSM7_EXT for c in text):
        length = sum(2 if c in _GSM7_EXT else 1 for c in text)
        single, multi, encoding = 160, 153, "GSM-7"
    else:
        length = len(text)
        single, multi, encoding = 70, 67, "UCS-2"
    segments = 1 if length <= single else -(-length // multi)
    return {"characters": length, "segments": segments, "encoding": encoding}
