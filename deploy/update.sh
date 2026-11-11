#!/usr/bin/env bash
# Pull the latest main and restart. Run as root: sudo bash /srv/invitations/deploy/update.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/srv/invitations}"; BRANCH="${BRANCH:-main}"; APP_USER=www-data
git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"
[ -f /etc/invitations-build.env ] && . /etc/invitations-build.env
sudo -u "$APP_USER" -H bash -c "export PATH=${NODE_PATH_PREFIX:-}\$PATH; cd $APP_DIR/frontend && npm ci --silent --no-audit --no-fund && npm run build --silent"
systemctl restart invitations invitations-q
echo "Deployed $(git -C "$APP_DIR" rev-parse --short HEAD)"
