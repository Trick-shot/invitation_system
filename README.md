# Trickshot Invitations

Multi-tenant QR invitation platform: a workspace per client, events with a card template and a QR slot, guests imported from phone contacts, vCard, CSV or a pasted list, invitations sent by SMS (Beem Africa), and a phone scanner at the door that is the single authority on admission.

Design and architecture live in the Claude project docs (`architecture.md`, `ux-architecture.md`, `design-considerations.md`, `assets-and-motion.md`) and the Figma file.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # set SECRET_KEY and FIELD_ENCRYPTION_KEY; leave MYSQL_NAME empty for SQLite
python manage.py migrate
python manage.py seed_demo      # demo workspace, event, guests, cards, scans
python manage.py runserver
```

With `Q_SYNC=True` in `.env` background jobs (card rendering, sending) run inline; otherwise run `python manage.py qcluster` in a second terminal.

## Tests

```bash
pytest          # 59 tests, including the cross-tenant isolation suite
ruff check .
```

## Layout

| App | Owns |
|---|---|
| `apps/tenancy` | Workspace, Membership, credentials, usage, the scoped manager and base viewset that make tenant isolation automatic |
| `apps/accounts` | Email-login user, invite and set-password flow, members endpoint |
| `apps/events` | Event, card template with fractional QR slot, per-event message, dashboard aggregation |
| `apps/invitations` | Guests, card rendering (segno + Pillow), importers, send jobs, deliveries, public guest link |
| `apps/scanning` | Scan log and the atomic admission rule |
| `apps/messaging` | SMS providers (Beem, console), SMS segment counting, delivery webhook |

## API

Base: `/api/`. JWT via `auth/token/`. Workspace routes are `workspaces/<slug>/...` and resolve membership from the signed-in user; a non-member gets 404. See `backend/urls.py`.
