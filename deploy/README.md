# Deploying

## Fastest: the bootstrap script (fresh Ubuntu 22.04 or 24.04)

Point DNS for your domain at the server, then as root:

```bash
curl -fsSL https://raw.githubusercontent.com/Trick-shot/invitation_system/main/deploy/bootstrap.sh \
  | sudo DOMAIN=test.trickshot.tech OWNER_EMAIL=you@example.com SEED_DEMO=1 bash
```

It installs MySQL, Nginx, Node and Python, clones the `main` branch into `/srv/invitations`, writes `.env` with generated secrets, migrates, builds the frontend, starts the gunicorn and worker services, gets a Let's Encrypt certificate, creates the platform owner (prints the password once) and, with `SEED_DEMO=1`, loads the demo workspace. Pass `BEEM_API_KEY=... BEEM_SECRET_KEY=... BEEM_SENDER_ID=...` to send real SMS; without them the console provider logs messages instead of sending.

Re-running the script is safe; it updates in place and keeps `.env`.

Afterwards: `sudo bash /srv/invitations/deploy/update.sh` pulls and restarts. Add the repo secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and every push to `main` deploys itself through `.github/workflows/deploy.yml`.

Logs: `journalctl -u invitations -u invitations-q -f`. Beem delivery reports: set the DLR URL in the Beem dashboard to `https://<domain>/api/webhooks/delivery/`.

## By hand

Ubuntu server, MySQL, Nginx, Gunicorn, django-q worker. Everything lives in `/srv/invitations`.

```bash
sudo apt install python3.12-venv mysql-server nginx certbot python3-certbot-nginx
sudo mkdir -p /srv/invitations && sudo chown www-data:www-data /srv/invitations
sudo -u www-data git clone -b main https://github.com/Trick-shot/invitation_system /srv/invitations
cd /srv/invitations
sudo -u www-data python3 -m venv .venv
sudo -u www-data .venv/bin/pip install -r requirements.txt
sudo -u www-data cp .env.example .env   # then edit: SECRET_KEY, FIELD_ENCRYPTION_KEY, MYSQL_*, BEEM_*, SITE_URL, ALLOWED_HOSTS, DEBUG=False
sudo -u www-data .venv/bin/python manage.py migrate
sudo -u www-data .venv/bin/python manage.py collectstatic --noinput
sudo -u www-data .venv/bin/python manage.py createsuperuser
sudo cp deploy/gunicorn.service deploy/qcluster.service /etc/systemd/system/
sudo systemctl enable --now gunicorn qcluster
sudo cp deploy/nginx.conf /etc/nginx/sites-available/invitations && sudo ln -s /etc/nginx/sites-available/invitations /etc/nginx/sites-enabled/
sudo certbot --nginx -d trickshot.tech
sudo nginx -t && sudo systemctl reload nginx
```

MySQL: `CREATE DATABASE invitations CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` and a user with rights on it.

Beem delivery reports: point the DLR URL in the Beem dashboard to `https://trickshot.tech/api/webhooks/delivery/`.

Updating: `git pull`, `pip install -r requirements.txt`, `manage.py migrate`, `collectstatic`, `systemctl restart gunicorn qcluster`.
