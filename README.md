# VillKro

A monorepo for the VillKro grocery / food delivery platform — API, customer app, and admin panel.

## Structure

```
villkro/
├── apps/
│   ├── api/            Node.js + Express REST + Socket.IO backend
│   ├── customer-app/   React Native (Expo) iOS + Android app
│   └── admin/          React + Vite admin panel
├── docs/               Project documentation
└── plans/              Design docs, audits, deployment plans
```

Each `apps/*` folder is a self-contained, independently deployable project. The `apps/api/Dockerfile` and `apps/admin/Dockerfile` are independent build contexts.

## Quick start

### One-command development (recommended)

From the repo root (after installing dependencies in each `apps/*` project once):

```bash
npm run dev          # local API + admin + customer app
```

- API: http://localhost:3000
- Admin: http://localhost:5173
- Customer app: Expo starts and prints the QR / metro URL

Requirements for `npm run dev`:
- Local MySQL on `localhost:3306`
- Local MongoDB on `localhost:27017`
- `apps/api/.env.development` already contains local-only values

The script preflights both databases and fails fast with a clear message if either is not reachable.

### Production-DB verification mode

```bash
npm run dev:proddb
```

This runs the **local API code** against the production Azure MySQL + Atlas Mongo databases (-values are read from `apps/api/.env.proddb`), while the Admin and Customer app still run locally. It asks for confirmation before starting; pass `--yes` to skip the prompt.

**Use this only for final pre-push smoke testing.** Never migrate or seed production from this command.

### Manual start

If you prefer to start projects individually:

```bash
# Backend
cd apps/api
npm run dev          # http://localhost:3000

# Admin panel
cd apps/admin
npm run dev          # http://localhost:5173

# Customer app (Expo)
cd apps/customer-app
npx expo start
```

## CI

- `.github/workflows/ci.yml` — API tests + lint (plus a double `db:migrate` run to prove the migration is idempotent)
- `.github/workflows/ci-admin.yml` — Admin lint + build
- `.github/workflows/ci-customer-app.yml` — Customer app lint + tests

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`, which:

1. runs CI for all three apps,
2. builds the `api`, `admin` and `landing` images on GitHub runners and pushes them to GHCR tagged with the commit SHA,
3. SSHes to the Lightsail box and dumps MySQL to `~/backups/` (the five newest are kept),
4. stops the api container, runs `db:migrate` as a one-shot container from the new image, and starts the new stack — only the services whose image changed are restarted,
5. reloads nginx and then polls `/health` through the proxy.

Migrations are **not** part of `npm start` any more, so a container restart never migrates. A failed dump stops the deploy before anything changes; a failed migration or a failed `/health` redeploys the previous tag and fails the run. The last good tag is kept on the box in `.deploy-tag`.

Applying a schema change by hand, on the box:

```bash
IMAGE_TAG=<commit-sha> docker compose -f docker-compose.prod.yml run --rm --no-deps api npm run db:migrate
```

Manual rollback or pinning a release, on the box:

```bash
IMAGE_TAG=<commit-sha> docker compose -f docker-compose.prod.yml up -d
```

Building on the box (only if GHCR or the workflow is unavailable):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.build.yml up -d --build
```

Area rollout steps live in [`plans/area-rollout-runbook.md`](./plans/area-rollout-runbook.md).
