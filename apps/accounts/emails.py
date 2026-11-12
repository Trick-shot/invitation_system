"""
Transactional emails, built from the designs on the Figma page "07 Email".
Every message has a plain-text twin, so clients that block HTML still get the link.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .models import User

log = logging.getLogger(__name__)


def report(exc: Exception) -> None:
    """Send to Sentry when it is installed and configured; never raise from here."""
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        pass


def _send(to: str, subject: str, template: str, ctx: dict, text: str) -> bool:
    """True if the mail server accepted it. Failures are logged and reported, not raised and not
    hidden: the caller decides what to tell the person (fail_silently used to swallow them)."""
    support_email = _support_email()
    ctx = {"subject": subject, "site_url": settings.SITE_URL.rstrip("/"), "support_email": support_email, **ctx}
    try:
        html = render_to_string(template, ctx)
        # Replies go to the support address set in the platform settings, not to a no-reply box.
        msg = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[to], reply_to=[support_email])
        msg.attach_alternative(html, "text/html")
        msg.send()
        return True
    except Exception as exc:  # noqa: BLE001  (SMTP, DNS, template: any of them)
        log.warning("Email to %s failed: %s", to, exc)
        report(exc)
        return False


def _support_email() -> str:
    try:
        from apps.tenancy.models import PlatformSettings

        return PlatformSettings.current().support_email
    except Exception:  # noqa: BLE001  (before migrations, or the table is unreachable)
        return "hello@trickshot.tech"


def role_label(role: str) -> str:
    return {"admin": "an admin", "coordinator": "a coordinator", "door_staff": "door staff"}.get(role, "a member")


def send_invite_email(*, user: User, workspace, url: str, inviter: User | None = None, role: str = "door_staff", event=None):
    who = inviter.full_name.split()[0] if inviter and inviter.full_name else workspace.name
    title = f"{who} added you as {role_label(role)}"
    if event is not None:
        bullets = [f"Scan guests in at {event.name} on {event.date:%-d %B}.", "Set a password to get started."]
    else:
        bullets = [f"You now have access to {workspace.name} on Trickshot Invitations.", "Set a password to get started."]
    note = f"This link works for 7 days and only once. Your login is {user.email}."
    return _send(
        user.email,
        f"{who} added you to {workspace.name}",
        "email/button.html",
        {
            "preheader": " ".join(bullets),
            "kicker": workspace.name,
            "title": title,
            "illustration": "/email/staff-badge.png" if role == "door_staff" else "",
            "bullets": bullets,
            "cta": "Set your password",
            "block": True,
            "url": url,
            "note": note,
            "fallback_url": url,
            "footer": f"Sent by Trickshot Invitations for {workspace.name}.",
        },
        f"{title}\n\n" + "\n".join(f"- {b}" for b in bullets) + f"\n\nSet your password: {url}\n\n{note}",
    )


def send_reset_email(*, user: User, url: str):
    title = "Choose a new password"
    paragraphs = [
        f"We received a request to reset the password for {user.email}. If you made this request, use the button below to choose a new password.",
        "If you didn\u2019t request a password reset, you can safely ignore this email. Your password will stay the same.",
    ]
    note = "This link works for 7 days and only once."
    return _send(
        user.email,
        "Reset your Trickshot Invitations password",
        "email/button.html",
        {
            "preheader": paragraphs[0],
            "kicker": "Trickshot Invitations",
            "title": title,
            "paragraphs": paragraphs,
            "cta": "Choose a new password",
            "url": url,
            "note": note,
            "fallback_url": url,
            "footer": "Sent by Trickshot Invitations.",
        },
        f"{title}\n\n" + "\n\n".join(paragraphs) + f"\n\nChoose a new password: {url}\n\n{note}",
    )


def send_code_email(*, email: str, code: str):
    title = "Your code is below"
    body = f"Enter this code on the page where you created your account. It confirms that {email} is yours."
    note = "The code works for 15 minutes. If you did not create an account, ignore this email and nothing happens."
    pretty = f"{code[:3]} {code[3:]}"
    _send(
        email,
        f"{pretty} is your Trickshot Invitations code",
        "email/code.html",
        {
            "preheader": f"Your code is {pretty}",
            "kicker": "Trickshot Invitations",
            "title": title,
            "paragraphs": [body],
            "code": pretty,
            "note": note,
            "fallback_url": "",
            "footer": "Sent by Trickshot Invitations.",
            "questions_footer": True,
        },
        f"{title}\n\nYour code: {code}\n\n{body}\n\n{note}",
    )
