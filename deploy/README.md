# Deploying

Ubuntu server, MySQL, Nginx, Gunicorn, django-q worker. Everything lives in `/srv/invitations`.

```bash
sudo apt install python3.12-venv mysql-server nginx certbot python3-certbot-nginx
sudo mkdir -p /srv/invitations && sudo chown www-data:www-data /srv/invitations
sudo -u www-data git clone -b v2 https://github.com/Trick-shot/invitation_system /srv/invitations
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
