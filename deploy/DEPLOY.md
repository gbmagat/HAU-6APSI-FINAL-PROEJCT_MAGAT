# Deploying Our Places next to other apps on one Ubuntu server

Our Places gets its own account, folders, database, port, systemd unit and nginx site. Nothing here edits another app's files, database, service or nginx site. With no domain, the site uses a free [sslip.io](https://sslip.io) hostname that points at the server's IP: `ourplaces.203-0-113-7.sslip.io` resolves to `203.0.113.7`.

Replace `203-0-113-7` / `203.0.113.7` with the server's real IP throughout.

## 0. Look before changing anything (read-only)

```bash
ss -ltnp                                  # ports in use: pick a free one for Our Places (default 3100)
ls /etc/nginx/sites-enabled/              # existing sites stay as they are
systemctl list-units --type=service --state=running | grep -v systemd
node -v; psql --version                   # Node.js 20.9 or newer is needed
df -h /                                   # room for the app, photos and road tiles
```

If port 3100 is taken, use another free port in both `our-places.service` and the nginx site.

## 1. Account and folders

```bash
sudo adduser --system --group --home /opt/our-places ourplaces
sudo mkdir -p /opt/our-places/app /var/lib/our-places/{photos,roads,outbox} /etc/our-places
sudo chown -R ourplaces:ourplaces /opt/our-places /var/lib/our-places
sudo chmod 750 /var/lib/our-places /var/lib/our-places/*
```

## 2. Database

Follow [db/README.md](../db/README.md) "Prepare the database": PostgreSQL stays on localhost, an owner role applies `db/schema.sql`, and the app connects with a role that can only read and change rows. Use a new database named `our_places`; do not reuse another app's database or roles.

## 3. Code and build

```bash
sudo -u ourplaces git clone https://github.com/gbmagat/HAU-6APSI-FINAL-PROEJCT_MAGAT.git /opt/our-places/app
cd /opt/our-places/app
sudo -u ourplaces npm ci
sudo -u ourplaces npm run check
sudo -u ourplaces npm run build
```

## 4. Environment file (secrets live only here)

Owned by root and readable by the service account's group, so the app can read it but not change it.

```bash
sudo install -m 640 -o root -g ourplaces /dev/null /etc/our-places/our-places.env
sudo nano /etc/our-places/our-places.env
```

```ini
DATABASE_URL=postgres://our_places_app:THE_APP_ROLE_PASSWORD@127.0.0.1:5432/our_places
APP_URL=https://ourplaces.203-0-113-7.sslip.io
PHOTO_DIR=/var/lib/our-places/photos
ROAD_CACHE_DIR=/var/lib/our-places/roads
MAIL_OUTBOX_DIR=/var/lib/our-places/outbox
# Optional, for real reminder emails (see README "Configure"):
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

## 5. Accounts

```bash
cd /opt/our-places/app
sudo -u ourplaces bash -c 'set -a; . /etc/our-places/our-places.env; set +a; \
  node scripts/provision-space.mjs --database our_places --owner-email YOU@example.com --owner-name "Your name" \
  --partner-email PARTNER@example.com --partner-name "Partner name"'
```

The environment file is loaded inside the service account's shell, so the database password never appears on a command line. The script asks for each account password without echoing it.

## 6. Service

```bash
sudo cp deploy/our-places.service /etc/systemd/system/our-places.service
sudo systemctl daemon-reload
sudo systemctl enable --now our-places
curl -sI http://127.0.0.1:3100/login | head -1      # expect HTTP/1.1 200
```

## 7. nginx and HTTPS

```bash
sed 's/SERVER-IP-WITH-DASHES/203-0-113-7/' deploy/nginx-our-places.conf | sudo tee /etc/nginx/sites-available/our-places
sudo ln -s /etc/nginx/sites-available/our-places /etc/nginx/sites-enabled/our-places
sudo nginx -t && sudo systemctl reload nginx        # reload, never restart, so other sites keep serving
sudo certbot --nginx -d ourplaces.203-0-113-7.sslip.io
```

HTTPS is required: in production the sign-in cookie is `Secure`, so signing in only works over `https://`. certbot renews the certificate automatically.

## 8. Check

- `https://ourplaces.203-0-113-7.sslip.io/login` loads, and signing in reaches the feed.
- `journalctl -u our-places -n 50` shows no errors.
- The other sites on the server still load exactly as before.

## Updating

```bash
cd /opt/our-places/app
sudo -u ourplaces git pull
sudo -u ourplaces npm ci && sudo -u ourplaces npm run build
sudo systemctl restart our-places
```

Apply any new files in `db/migrations` as the owner role before restarting.

## Backups

Back up the `our_places` database and `/var/lib/our-places/photos` together (`pg_dump -Fc our_places`), and test a restore before storing real memories. `/var/lib/our-places/roads` is a cache and needs no backup.
