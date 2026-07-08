# Cumbria Window Cleaning

Public website and private admin planner for Cumbria Window Cleaning.

## Features

- Public landing page for Facebook adverts
- Quote/contact form
- Admin login
- Customer database
- Planner/jobs
- Money owed tracker
- Quote leads
- PostgreSQL database
- Docker Compose ready for TrueNAS-style hosting

## Local test

```bash
cp .env.example .env
docker compose up -d --build
```

Website: http://localhost:3095
API: http://localhost:5055

## Default admin

Set these in `.env` before running:

```env
ADMIN_EMAIL=admin@cumbriawindowcleaning.local
ADMIN_PASSWORD=change-me-now
```

## TrueNAS notes

Use fixed tags only when deployed from GHCR later. The app expects:

- Web port: 3095
- API port: 5055
- Postgres port internal only
- Database volume mounted to `/var/lib/postgresql/data`
