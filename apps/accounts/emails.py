"""
Transactional emails, built from the designs on the Figma page "07 Email".
Every message has a plain-text twin, so clients that block HTML still get the link.
"""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .models import User


def _send(to: str, subject: str, template: str, ctx: dict, text: str):
    ctx = {"subject": subject, "site_url": settings.SITE_URL.rstrip("/"), **ctx}
    html = render_to_string(template, ctx)
    msg = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[to])
    msg.attach_alternative(html, "text/html")
    msg.send(fail_silently=True)


def role_label(role: str) -> str:
    return {"admin": "an admin", "coordinator": "a coordinator", "door_staff": "door staff"}.get(role, "a member")


def send_invite_email(*, user: User, workspace, url: str, inviter: User | None = None, role: str = "door_staff", event=None):
    who = inviter.full_name.split()[0] if inviter and inviter.full_name else workspace.name
    title = f"{who} added you as {role_label(role)}"
    if event is not None:
        body = f"You can scan guests in at {event.name} on {event.date:%-d %B}. Set a password to get started; it takes a minute and works on your phone."
    else:
        body = f"You now have access to {workspace.name} on Trickshot Invitations. Set a password to get started; it takes a minute and works on your phone."
    note = f"This link works for 7 days and only once. Your login is {user.email}."
    _send(
        user.email,
        f"{who} added you to {workspace.name}",
        "email/button.html",
        {
            "preheader": body,
            "kicker": workspace.name,
            "title": title,
            "body": body,
            "cta": "Set your password",
            "url": url,
            "note": note,
            "fallback_url": url,
            "footer": f"Sent by Trickshot Invitations for {workspace.name}.",
        },
        f"{title}\n\n{body}\n\nSet your password: {url}\n\n{note}",
    )


def send_reset_email(*, user: User, url: str):
    title = "Choose a new password"
    body = f"Someone asked to reset the password for {user.email}. If that was you, pick a new one below. If not, you can ignore this email; your password stays as it is."
    note = "This link works for 7 days and only once."
    _send(
        user.email,
        "Reset your Trickshot Invitations password",
        "email/button.html",
        {
            "preheader": body,
            "kicker": "Trickshot Invitations",
            "title": title,
            "body": body,
            "cta": "Choose a new password",
            "url": url,
            "note": note,
            "fallback_url": url,
            "footer": "Sent by Trickshot Invitations.",
        },
        f"{title}\n\n{body}\n\nChoose a new password: {url}\n\n{note}",
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
            "body": body,
            "code": pretty,
            "note": note,
            "fallback_url": "",
            "footer": "Sent by Trickshot Invitations.",
        },
        f"{title}\n\nYour code: {code}\n\n{body}\n\n{note}",
    )
