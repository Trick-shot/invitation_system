#!/usr/bin/env bash
# Pull the latest main and restart. Run as root: sudo bash /var/www/projects/invitation_system/deploy/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/projects/invitation_system}"; BRANCH="${BRANCH:-main}"; APP_USER=www-data
git config --system --get-all safe.directory 2>/dev/null | grep -qx "$APP_DIR" || git config --system --add safe.directory "$APP_DIR"
git -C "$APP_DIR" fetch -q origin "$BRANCH"
git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" -H bash -c "export PIP_CACHE_DIR=$APP_DIR/.cache/pip; cd $APP_DIR && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"
[ -f /etc/invitations-build.env ] && . /etc/invitations-build.env
# Release tag shared by backend and frontend, so a Sentry issue points at the deploy that caused it.
RELEASE="invitations@$(git -C "$APP_DIR" rev-parse --short HEAD)"
echo "$RELEASE" > "$APP_DIR/.release"
# The frontend DSN is public by design (it ships to every browser); read it from the server .env at build time.
VITE_SENTRY_DSN="$(grep -E '^VITE_SENTRY_DSN=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
sudo -u "$APP_USER" -H bash -c "export PATH=${NODE_PATH_PREFIX:-}\$PATH npm_config_cache=$APP_DIR/.cache/npm VITE_SENTRY_DSN='$VITE_SENTRY_DSN' VITE_SENTRY_RELEASE='$RELEASE'; cd $APP_DIR/frontend && npm ci --no-audit --no-fund && npm run build -- --outDir dist-next --emptyOutDir"
# Swap the new build in at once (the live site never sees a half-written folder), and keep the
# previous build's hashed files so phones that opened the app before this deploy can still load them.
cd "$APP_DIR/frontend"
# Only files from the last 7 days, so old builds do not pile up forever.
if [ -d dist/assets ]; then find dist/assets -type f -mtime -7 -exec cp -np {} dist-next/assets/ \; ; fi
rm -rf dist-prev; [ -d dist ] && mv dist dist-prev; mv dist-next dist
chown -R "$APP_USER:$APP_USER" dist
cd "$APP_DIR"
# Unit files live in the repo; pick up changes to them too.
sed "s#/srv/invitations#${APP_DIR}#g" "$APP_DIR/deploy/gunicorn.service" > /etc/systemd/system/invitations.service
sed "s#/srv/invitations#${APP_DIR}#g" "$APP_DIR/deploy/qcluster.service" > /etc/systemd/system/invitations-q.service
systemctl daemon-reload
systemctl restart invitations invitations-q
echo "Deployed $(git -C "$APP_DIR" rev-parse --short HEAD)"
