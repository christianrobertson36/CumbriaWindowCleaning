# Cumbria Window Cleaning - TrueNAS Custom App Setup

Target dataset path:

```text
/mnt/APP_POOL/CWC
```

## 1. Create folders on TrueNAS

Run this in the TrueNAS shell:

```bash
mkdir -p /mnt/APP_POOL/CWC/postgres
mkdir -p /mnt/APP_POOL/CWC/backups
chmod -R 775 /mnt/APP_POOL/CWC
```

## 2. Custom App compose

Use `deploy/truenas-custom-app.yml` as the starting compose for the TrueNAS Custom App.

Before deploying, replace these values:

```text
CHANGE_ME_DB_PASSWORD
CHANGE_ME_LONG_RANDOM_SECRET
CHANGE_ME_ADMIN_PASSWORD
```

Keep fixed image tags only:

```text
ghcr.io/christianrobertson36/cumbria-window-cleaning-api:v1
ghcr.io/christianrobertson36/cumbria-window-cleaning-web:v1
```

## 3. Ports

- Web: `3095`
- API: `5055`
- PostgreSQL: internal only, no host port exposed

## 4. Test after deploy

From a browser:

```text
http://TRUENAS-IP:3095
http://TRUENAS-IP:5055/health
```

Expected API health:

```json
{"ok":true,"app":"Cumbria Window Cleaning API","version":"v1"}
```

## 5. Backup database folder

The important persistent data is here:

```text
/mnt/APP_POOL/CWC/postgres
```

Back this up before changing database versions or deleting the app.
