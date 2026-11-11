"""
SMS providers behind one interface. Callers never import a provider
directly; they ask `get_provider_for(workspace)` and get whatever that
workspace is configured to use.

Beem Africa: REST, HTTP Basic auth with api_key:secret_key. The send
endpoint and body shape are the ones in Beem's published examples; the host
is a setting because Beem's own docs disagree with themselves about it.
Confirm against the API Docs page in the Beem dashboard before go-live.
"""

import logging
from dataclasses import dataclass

import requests
from django.conf import settings

log = logging.getLogger(__name__)


class ProviderError(Exception):
    """Permanent failure: do not retry (bad number, auth, rejected sender)."""


class ProviderTransientError(ProviderError):
    """Temporary failure: safe to retry (timeout, 5xx)."""


@dataclass
class SendResult:
    provider_message_id: str
    accepted: bool
    raw: dict


class BaseProvider:
    name = "base"

    def send(self, *, to: str, body: str, reference: str) -> SendResult:  # pragma: no cover
        raise NotImplementedError


class ConsoleProvider(BaseProvider):
    """Development provider: logs instead of sending, always succeeds."""

    name = "console"

    def send(self, *, to, body, reference):
        log.info("SMS to %s [%s]: %s", to, reference, body)
        return SendResult(provider_message_id=f"console-{reference}", accepted=True, raw={})


class BeemProvider(BaseProvider):
    name = "beem"

    def __init__(self, api_key: str, secret_key: str, sender_id: str, send_url: str | None = None, timeout: int = 15):
        self.auth = (api_key, secret_key)
        self.sender_id = sender_id
        self.send_url = send_url or settings.MESSAGING["BEEM_SEND_URL"]
        self.timeout = timeout

    @staticmethod
    def recipient_id(reference: str) -> int:
        """Beem wants a numeric recipient_id ("Missing or invalid reference ID." otherwise).
        Our references are "d<delivery pk>" or a uuid hex; keep the trailing digits."""
        digits = "".join(ch for ch in reference if ch.isdigit())[-9:]
        return int(digits) if digits else 1

    @staticmethod
    def error_message(data: dict) -> str:
        """Beem's rejections nest the reason: {"data": {"error_code": "...", "message": "Invalid Sender ID.", ...}};
        older answers put "message" at the top level."""
        inner = data.get("data") if isinstance(data.get("data"), dict) else {}
        msg = inner.get("message") or data.get("message") or ""
        code = inner.get("error_code") or data.get("code")
        return f"{msg} [{code}]" if msg and code else str(msg or code or "")

    def send(self, *, to, body, reference):
        payload = {
            "source_addr": self.sender_id,
            "schedule_time": "",
            "encoding": 0,
            "message": body,
            "recipients": [{"recipient_id": self.recipient_id(reference), "dest_addr": to.lstrip("+")}],
        }
        try:
            resp = requests.post(self.send_url, json=payload, auth=self.auth, timeout=self.timeout)
        except requests.RequestException as exc:
            raise ProviderTransientError(f"Beem unreachable: {exc}") from exc
        if resp.status_code >= 500:
            raise ProviderTransientError(f"Beem {resp.status_code}: {resp.text[:200]}")
        try:
            data = resp.json()
        except ValueError:
            data = {"text": resp.text[:200]}
        if resp.status_code != 200 or not data.get("successful", resp.status_code == 200):
            raise ProviderError(self.error_message(data) or f"Beem rejected the message ({resp.status_code})")
        return SendResult(provider_message_id=str(data.get("request_id", reference)), accepted=True, raw=data)


def platform_provider() -> BaseProvider:
    cfg = settings.MESSAGING
    if cfg["DEFAULT_PROVIDER"] == "beem" and cfg["BEEM_API_KEY"]:
        return BeemProvider(cfg["BEEM_API_KEY"], cfg["BEEM_SECRET_KEY"], cfg["BEEM_SENDER_ID"])
    return ConsoleProvider()


def get_provider_for(workspace) -> BaseProvider:
    """Workspace credentials if present, else the platform account."""
    credential = getattr(workspace, "credential", None)
    if credential is not None and credential.api_key_enc:
        api_key, secret = credential.get_secrets()
        return BeemProvider(api_key, secret, credential.sender_id or settings.MESSAGING["BEEM_SENDER_ID"])
    return platform_provider()
