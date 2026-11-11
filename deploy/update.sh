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
sudo -u "$APP_USER" -H bash -c "export PATH=${NODE_PATH_PREFIX:-}\$PATH npm_config_cache=$APP_DIR/.cache/npm; cd $APP_DIR/frontend && npm ci --no-audit --no-fund && npm run build"
systemctl restart invitations invitations-q
echo "Deployed $(git -C "$APP_DIR" rev-parse --short HEAD)"
