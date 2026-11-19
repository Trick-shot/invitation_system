# Handoff: Trickshot Invitations (invitation_system)

Last updated 2026-11-19. Written for whoever picks this up next (human or agent).

## 1) Goal

Run, test and deploy the multi-tenant QR invitation platform (Django 5 + DRF backend, React 19 + Vite frontend) for Erick (Trick-shot), then keep the test site current with `main`.

- Repo: https://github.com/Trick-shot/invitation_system (private). `v2` was merged into `main` on 2026-11-11 with `--no-ff`; `v2` is kept, `main` is the deploy branch.
- Test site: https://test.trickshot.tech
- Real SMS via Beem Africa, real email via Brevo SMTP, scanner at the door as the single authority on admission.
- Working style requested: mentor style (explain why before fixing), show commands and reasons, ask before sudo/destructive actions, never put secrets in chat or git, never print `.env`, never touch the other server 38.242.218.198.

## 2) Current State

**Deployed:** `main` at `696118e` ("Scanner: a way back to the dashboard") on 2026-11-12. Later commits may exist; check `git log origin/main`.

**Server:** Ubuntu 24.04 at `167.86.72.150`, SSH as `root` with `~/.ssh/id_rsa` (no `~/.ssh/config`; `gh` CLI is not installed locally).
- App dir `/var/www/projects/invitation_system`, owned by `www-data`, cloned over SSH (`git@github.com:Trick-shot/invitation_system.git`; root's ed25519 key is registered with GitHub).
- systemd: `invitations` (gunicorn, socket `/run/invitations/gunicorn.sock` via `RuntimeDirectory`), `invitations-q` (django-q2 worker, 1 s broker poll, 20 s stop timeout).
- nginx site `/etc/nginx/sites-available/invitations` (443 + 80 redirect), includes `deploy/nginx-performance.conf` (gzip, immutable hashed assets, no-cache index.html). Let's Encrypt cert valid to 2027-01-29.
- MySQL 8 (shared, `validate_password` MEDIUM), database and user `invitations`, root password file `/root/.invitations-db-pass`.
- Private Node 22 at `/opt/node22` (no system Node); `/etc/invitations-build.env` carries `NODE_PATH_PREFIX`. A leftover `/opt/node20` from a failed run can be removed.
- Shared box: also hosts trickshotTech (apex trickshot.tech), nyumbaHub, rental_system and neighbour_guard under `/var/www/projects`, plus redis. The nginx site `safeHouse` (neighbour_guard, daphne :8000) was unlinked from `sites-enabled` on 2026-11-11 to hand `test.trickshot.tech` to this app; its config and service still exist.

**Messaging:**
- SMS: Beem, `MESSAGING_PROVIDER=beem`, sender `NYUMBAHUB` (approved on this account; `TRICKSHOT` pending approval). Verified end to end: Beem delivery report DELIVERED to Erick's phone.
- Email: Brevo SMTP relay, verified sender `Trickshot Invitations <hello@trickshot.tech>`, domain authenticated (DKIM/DMARC), server IP in Brevo's authorised IPs. Designed HTML emails (invite, reset, code) verified.
- Sentry: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT=test` are in the server `.env`; `update.sh` tags releases `invitations@<sha>`.

**Scheduled job:** django-q schedule `purge-deleted-workspaces` → `apps.tenancy.deletion.purge_due`, daily about 08:37 UTC (created by `update.sh` via `manage.py purge_deleted_workspaces --schedule`).

**Accounts on the test site:**
- Platform owner / superuser `erickluoga1722@gmail.com` (password shown once at bootstrap, not stored anywhere by me).
- Superadmin `erickluoga@trickshot.tech` (password chosen by Erick; it passed through chat, so rotate it).
- Demo data from `SEED_DEMO=1`: workspace `nyoni` with `erick@nyoni.tz` (admin), `joseph@nyoni.tz` (door staff), `owner@trickshot.tech` (platform), all with the public password `demo-password-123`, three events and guests. Test leftovers inside it: guest "Erick (SMS test)" on the Communion event (several deliveries to +255 766 719 100), a stray pending guest on the draft Kimaro Wedding, and door-staff member `erickluoga1722+staff@gmail.com`. **All demo data must be removed before any real client** (deleting the `nyoni` workspace from the platform view cascades).
- Other workspaces created during testing: `onboard`, `smoke-test` (local only), `erickluoga1722`, `morekaz_06` (on the server).

**Local dev:** clone at `/Users/macbook/projects/invitation_system`, `.venv` on Python 3.14, `.env` with SQLite, `Q_SYNC=True`, `SITE_URL=http://localhost:5173` (so set-password links point at Vite). Dev servers: `python manage.py runserver 8000` and `cd frontend && npm run dev -- --host`.

**Checks that pass on main:** pytest 72 (67 of Erick's + 5 Beem provider tests), `ruff check .`, `tsc -p tsconfig.app.json --noEmit`, GitHub Actions `CI` and `Deploy` green on every commit since the merge.

## 3) Active Files

Deploy and ops (all under `deploy/` unless noted):
- `bootstrap.sh`: one-shot server setup. For this private repo it cannot be run via `curl | bash`; copy it up and run `REPO=git@github.com:Trick-shot/invitation_system.git bash /root/bootstrap.sh` with `DOMAIN`, `OWNER_EMAIL`, `SEED_DEMO`.
- `update.sh`: the routine deploy. Pulls main, pip/migrate/collectstatic, Vite build into `dist-next` then atomic swap (keeps `dist-prev` and 7 days of old hashed assets), refreshes systemd units, runs `purge_deleted_workspaces --schedule`, restarts both services. Because it replaces itself with `git reset --hard` on its first lines, pull before running it when `update.sh` itself changed.
- `gunicorn.service`, `qcluster.service`: unit templates (`/srv/invitations` is sed-replaced with the real path).
- `nginx.conf`: SSL site template; `nginx-performance.conf`: the include.
- `README.md` (deploy notes), `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (auto-deploy skeleton, skips until `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets exist).

App code touched by me:
- `apps/messaging/providers.py`: Beem provider (numeric `recipient_id`, nested error message), `tests/test_messaging.py`.
- `apps/messaging/views.py`: delivery-report webhook (Beem actually offers only a polling endpoint; see Next Steps).
- `backend/settings.py`: SMTP settings from env, `Q_CLUSTER` poll, Beem sender default.
- `apps/invitations/migrations/0002_alter_invitation_capacity.py` (was missing).
- `.env.example`, `.gitignore` (`.cache/`).

Server-side files of note: `/var/www/projects/invitation_system/.env` (never print; timestamped `.bak-*` copies next to it), `/etc/nginx/sites-available/invitations` (+ `.bak-*`), `/etc/systemd/system/invitations*.service`, `/etc/invitations-build.env`, `/root/.invitations-db-pass`, `/root/bootstrap.sh`.

## 4) Changes Made

Chronological, all committed to `main` with explanatory messages unless marked "server only".

2026-11-11, merge and first deploy:
- Merged `v2` into `main` (`c254a4a`). Switched bootstrap, update script, deploy workflow and docs from `v2` to `main`; removed legacy `django.yml`/`node.js.yml` workflows (Python 3.7–3.9, root npm) and the unused root `package.json`/`package-lock.json`.
- Bootstrap fixes found on the real server: secrets generated with Python instead of `tr | head` (SIGPIPE under `pipefail`), DB password that satisfies MySQL `validate_password`, npm/pip caches inside the app dir (www-data's home is not writable), Node 22 instead of 20 (Vite 8/rolldown need 20.19+; npm silently drops the native binding otherwise), `git safe.directory` plus one git command per line so `set -e` catches failures, npm output no longer `--silent`, gunicorn socket under `RuntimeDirectory=invitations`.
- Added the missing migration `invitations.0002` (capacity validators).
- Read `EMAIL_HOST/PORT/USER/PASSWORD/USE_TLS/USE_SSL` from env (only backend and from-address were wired).
- Worker: 1 s broker poll (was 0.2 s, ~30% CPU idle), `TimeoutStopSec=20` (restarts took 90 s and ended in SIGKILL); `update.sh` refreshes unit files.
- Beem: `recipient_id` must be an integer (was `"d1"`); surface nested `data.message`/`error_code`; no default sender (`INFO` is retired on Beem). Five provider tests with `responses`.
- Server only: unlinked nginx `safeHouse`; handed `test.trickshot.tech` to this app; Brevo and Beem credentials entered by Erick in `.env`; `DEFAULT_FROM_EMAIL="Trickshot Invitations <hello@trickshot.tech>"`; Sentry keys; nginx performance include; `rerender_cards` run once (15 cards to JPEG).
- Server only: superadmin `erickluoga@trickshot.tech` created.

2026-11-12 onward: routine deploys of Erick's commits via `update.sh` (dee1b6b, 43ec1f2, ecee196, 50d5ff2, caf67a5, 21cf3bb, 4b05cf7, 4f52813, 696118e), each verified: migrations applied, both services active, journal clean, site 200.

## 5) Failed Attempts

Each failure was diagnosed, explained and fixed; listed so nobody repeats them.
- `curl raw.githubusercontent.com/... | bash` returned 404: the repo is private; GitHub hides private repos as 404. Fix: scp the script, clone over SSH.
- Bootstrap exit 141 at the MySQL step: `tr </dev/urandom | head` killed by SIGPIPE under `set -o pipefail`.
- MySQL `ERROR 1819` password policy: hex-only password rejected by `validate_password` MEDIUM.
- npm exit 243 (`EACCES /var/www/.npm`): www-data's home is root-owned; npm's "root-owned files" hint was misleading.
- Vite build: `Cannot find module '@rolldown/binding-linux-x64-gnu'` on Node 20.18; npm skipped the optional dep because of its engines field. Also `npm run build --silent` hid the error.
- "dubious ownership" from git as root was swallowed by an `a && b && c` chain, so the server silently kept old code.
- gunicorn restart loop `[Errno 13]` binding `/run/invitations.sock`.
- Beem "Missing or invalid reference ID." (string `recipient_id`), then "Invalid Sender ID." (`INFO` retired), then with sender set the SMS was DELIVERED.
- Brevo `525 5.7.1 Unauthorized IP address`: server IP had to be added to Brevo's authorised IPs. Mail then queued but did not arrive until the sender/domain were verified in Brevo.
- Forgot-password for the platform owner sends nothing (no workspace membership); used the `+staff` alias for tests instead.
- Diagnostic `manage.py shell` that sourced `.env` with `set -a` hung; `decouple` reads `.env` itself, so don't source it.
- `pkill -f "manage.py shell -c"` matched its own `bash -c` and cut the SSH session.
- `grep -r` in `/etc/nginx/sites-enabled` found nothing: it doesn't follow symlinks; use `grep -R`.
- Local ports 8000/5173 were held by stale dev servers from other projects (neighbour_guard, zukin_events); killed with Erick's OK.

## 6) Next Steps

Routine deploy (the only command normally needed):
```
ssh root@167.86.72.150 'cd /var/www/projects/invitation_system && git fetch -q origin main && git reset -q --hard origin/main && sudo bash deploy/update.sh'
```
Then check `systemctl is-active invitations invitations-q`, `journalctl -u invitations -n 40 --no-pager`, and `curl -sI https://test.trickshot.tech`.

Open items, in rough priority:
1. Remove all demo data (`nyoni` workspace, demo users, test guests, `+staff` member) before any real client, and redeploy without `SEED_DEMO`.
2. Owner password reset: `ForgotPasswordView` needs an owner-level reset token; today the platform owner has no self-service reset.
3. Delivery status: Beem has no webhook, only `GET https://dlrapi.beem.africa/public/v1/delivery-reports?dest_addr=&request_id=`. Add a django-q scheduled poll for `sent` deliveries older than ~5 min so the Send tab shows "Delivered". The existing webhook view can stay.
4. Switch `BEEM_SENDER_ID` to `TRICKSHOT` once Beem approves it; restart both services.
5. Rotate the superadmin password (it passed through chat).
6. Optional GitHub auto-deploy: create a dedicated deploy key for a sudo-capable user, add `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` repo secrets; `deploy.yml` then runs `update.sh` on every push to main.
7. Small cleanups: `cp -n` → `cp --update=none` in `update.sh` (deprecation warnings), drop `expires 1y` from `nginx-performance.conf` (duplicate Cache-Control header), remove `/opt/node20`, remove the stray pending test guest on the draft Kimaro Wedding, decide the fate of the unlinked `safeHouse` nginx site and its daphne service.
8. Keep an eye on the Sentry project for the `test` environment now that the DSNs are live.
