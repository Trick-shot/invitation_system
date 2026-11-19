"""
Sentry logs and metrics, in one place.

Two rules make this file:
1. Telemetry must never break the thing it measures. Every call is wrapped, so an
   old SDK on the server, a missing DSN or a Sentry outage is silently ignored.
2. No personal data. Guests are names and phone numbers; pass ids, slugs, counts
   and outcomes only. Sentry is a debugging tool, not a guest list.

Metrics answer "how many / how long" (dashboards, alerts). Logs answer "what
happened, in order" (one wide line per operation, with the ids to look it up).
"""

import logging

log = logging.getLogger(__name__)


def _attrs(attrs: dict) -> dict:
    # Sentry stores scalars only; anything else becomes a string so it stays searchable.
    return {k: v if isinstance(v, (str, int, float, bool)) else str(v) for k, v in attrs.items() if v is not None}


def count(name: str, value: float = 1, **attrs) -> None:
    try:
        import sentry_sdk

        sentry_sdk.metrics.count(name, value, attributes=_attrs(attrs))
    except Exception:  # noqa: BLE001
        pass


def timing(name: str, ms: float, **attrs) -> None:
    try:
        import sentry_sdk

        sentry_sdk.metrics.distribution(name, ms, unit="millisecond", attributes=_attrs(attrs))
    except Exception:  # noqa: BLE001
        pass


def info(message: str, **attrs) -> None:
    _log("info", message, attrs)


def warning(message: str, **attrs) -> None:
    _log("warning", message, attrs)


def _log(level: str, message: str, attrs: dict) -> None:
    try:
        import sentry_sdk

        getattr(sentry_sdk.logger, level)(message, attributes=_attrs(attrs))
    except Exception:  # noqa: BLE001
        pass
