#!/usr/bin/env bash
# One-shot server setup for the invitation platform on Ubuntu 22.04/24.04.
#
#   curl -fsSL https://raw.githubusercontent.com/Trick-shot/invitation_system/main/deploy/bootstrap.sh | sudo DOMAIN=test.trickshot.tech OWNER_EMAIL=you@example.com bash
#
# Optional env: BRANCH (default main), BEEM_API_KEY, BEEM_SECRET_KEY, BEEM_SENDER_ID, OWNER_PASSWORD, SEED_DEMO=1 (demo users with a public password: test sites only), SKIP_CERTBOT=1
# Safe to re-run: it updates in place.
set -euo pipefail

DOMAIN="${DOMAIN:-test.trickshot.tech}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-https://github.com/Trick-shot/invitation_system}"
APP_DIR="${APP_DIR:-/var/www/projects/invitation_system}"
mkdir -p "$(dirname "$APP_DIR")"
APP_USER="www-data"
OWNER_EMAIL="${OWNER_EMAIL:-}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"
SEED_DEMO="${SEED_DEMO:-0}"

say() { printf '\n\033[1;35m== %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git python3 python3-venv python3-pip nginx certbot python3-certbot-nginx curl ca-certificates xz-utils
# Database: reuse MySQL or MariaDB if one is already running (this box may host other apps);
# install mysql-server only when there is none.
if systemctl is-active --quiet mysql || systemctl is-active --quiet mariadb; then
  echo "Using the database server already running."
else
  apt-get install -y -q mysql-server && systemctl enable --now mysql
fi
# Node: the build needs 20+. Never replace a system Node another app may depend on;
# if it is missing or too old, fetch a private Node 20 under /opt/node20 for our build only.
NODE_MAJOR="$(command -v node >/dev/null && node -v | cut -d. -f1 | tr -d v || echo 0)"
if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
  NODE_PATH_PREFIX=""
else
  if [ ! -x /opt/node20/bin/node ]; then
    echo "System Node is ${NODE_MAJOR:-missing}; installing a private Node 20 in /opt/node20 (system Node untouched)."
    mkdir -p /opt/node20
    curl -fsSL https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz | tar -xJ --strip-components=1 -C /opt/node20
  fi
  NODE_PATH_PREFIX="/opt/node20/bin:"
fi
echo "NODE_PATH_PREFIX=${NODE_PATH_PREFIX}" > /etc/invitations-build.env

say "MySQL database"
DB_PASS_FILE=/root/.invitations-db-pass
if [ ! -f "$DB_PASS_FILE" ]; then python3 -c 'import secrets;print(secrets.token_hex(14))' > "$DB_PASS_FILE"; fi
DB_PASS="$(cat "$DB_PASS_FILE")"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS invitations CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'invitations'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER 'invitations'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON invitations.* TO 'invitations'@'localhost';
FLUSH PRIVILEGES;
SQL

say "Code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" checkout -q "$BRANCH" && git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

say "Environment"
if [ ! -f "$APP_DIR/.env" ]; then
  SECRET="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
  FERNET="$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  cat > "$APP_DIR/.env" <<ENV
SECRET_KEY=${SECRET}
DEBUG=False
ALLOWED_HOSTS=${DOMAIN}
SITE_URL=https://${DOMAIN}
CORS_ALLOWED_ORIGINS=https://${DOMAIN}
FIELD_ENCRYPTION_KEY=${FERNET}
MYSQL_NAME=invitations
MYSQL_USER=invitations
MYSQL_PASSWORD=${DB_PASS}
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MEDIA_ROOT=${APP_DIR}/media
MESSAGING_PROVIDER=${BEEM_API_KEY:+beem}
BEEM_API_KEY=${BEEM_API_KEY:-}
BEEM_SECRET_KEY=${BEEM_SECRET_KEY:-}
BEEM_SENDER_ID=${BEEM_SENDER_ID:-INFO}
BEEM_SEND_URL=https://apisms.beem.africa/v1/send
Q_SYNC=False
SECURE_SSL_REDIRECT=False
ENV
  sed -i 's/^MESSAGING_PROVIDER=$/MESSAGING_PROVIDER=console/' "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
  echo "Wrote $APP_DIR/.env"
else
  echo "Keeping existing $APP_DIR/.env"
fi

say "Python"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && [ -d .venv ] || python3 -m venv .venv"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r requirements.txt"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"
mkdir -p "$APP_DIR/media" && chown -R "$APP_USER:$APP_USER" "$APP_DIR/media"

say "Frontend build"
sudo -u "$APP_USER" -H bash -c "export PATH=${NODE_PATH_PREFIX}\$PATH; cd $APP_DIR/frontend && npm ci --silent --no-audit --no-fund && npm run build --silent"

say "Services"
sed "s#/srv/invitations#${APP_DIR}#g" "$APP_DIR/deploy/gunicorn.service" > /etc/systemd/system/invitations.service
sed "s#/srv/invitations#${APP_DIR}#g" "$APP_DIR/deploy/qcluster.service" > /etc/systemd/system/invitations-q.service
systemctl daemon-reload
systemctl enable --now invitations invitations-q
systemctl restart invitations invitations-q

say "Nginx"
sed -e "s/trickshot.tech/${DOMAIN}/g" -e "s#/srv/invitations#${APP_DIR}#g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/invitations
# Before certbot runs there is no certificate: serve plain HTTP first.
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > /etc/nginx/sites-available/invitations <<NG
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20m;
    root ${APP_DIR}/frontend/dist;
    index index.html;
    location /api/ { proxy_pass http://unix:/run/invitations.sock; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; }
    location /admin/ { proxy_pass http://unix:/run/invitations.sock; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto \$scheme; }
    location /static/ { alias ${APP_DIR}/staticfiles/; expires 30d; }
    location /media/ { alias ${APP_DIR}/media/; expires 7d; add_header X-Robots-Tag "noindex"; }
    location / { try_files \$uri /index.html; }
}
NG
fi
ln -sf /etc/nginx/sites-available/invitations /etc/nginx/sites-enabled/invitations
# Remove nginx's stock welcome site only if it is still the stock file; a shared server may
# have real sites in there, and those are left alone.
if [ -f /etc/nginx/sites-enabled/default ] && grep -q 'server_name _;' /etc/nginx/sites-enabled/default && ! grep -q 'proxy_pass\|fastcgi_pass' /etc/nginx/sites-enabled/default; then
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t && systemctl reload nginx

if [ "${SKIP_CERTBOT:-0}" != "1" ]; then
  say "HTTPS (certbot)"
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "${OWNER_EMAIL:-admin@${DOMAIN}}"; then
    sed -i 's/^SECURE_SSL_REDIRECT=False/SECURE_SSL_REDIRECT=True/' "$APP_DIR/.env"
    systemctl restart invitations
  else
    echo "certbot failed (is DNS for ${DOMAIN} pointing here yet?). The site is up on plain HTTP; re-run this script once DNS resolves."
  fi
fi

say "Accounts"
if [ -n "$OWNER_EMAIL" ]; then
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && OWNER_EMAIL='$OWNER_EMAIL' OWNER_PASSWORD='$OWNER_PASSWORD' .venv/bin/python manage.py shell -c \"
import os, secrets
from apps.accounts.models import User
email=os.environ['OWNER_EMAIL']; pw=os.environ.get('OWNER_PASSWORD') or secrets.token_urlsafe(10)
u,created=User.objects.get_or_create(email=email, defaults={'is_platform_owner':True,'is_staff':True,'is_superuser':True})
u.is_platform_owner=u.is_staff=u.is_superuser=True
if created or os.environ.get('OWNER_PASSWORD'): u.set_password(pw)
u.save()
print('Platform owner:', email, '(password: '+pw+')' if created or os.environ.get('OWNER_PASSWORD') else '(password unchanged)')
\""
fi
if [ "$SEED_DEMO" = "1" ]; then
  sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && .venv/bin/python manage.py seed_demo"
fi

say "Done"
echo "Site:   http${SKIP_CERTBOT:+}://${DOMAIN}  (https once certbot succeeded)"
echo "Logs:   journalctl -u invitations -u invitations-q -f"
echo "Update: sudo bash ${APP_DIR}/deploy/update.sh"
