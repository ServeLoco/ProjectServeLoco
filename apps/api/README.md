# Backend-V1

## Deployment Instructions

Before starting the server in a new or updated environment, always run the database migrations. The backend no longer runs dynamic DDL (`ALTER TABLE`) during requests.

```bash
npm run db:migrate
npm start
```

## Logging & Error Tracking

All logging goes through `src/utils/logger.js` (pino) — no `console.*` calls
remain in `src/`. Every log line is JSON with a level, ISO timestamp and
`service: "serveloco-api"`, so it's filterable in `docker logs` or any log
shipper. Requests are logged by `pino-http` (one structured line per
request); 5xx handling logs via `src/middleware/errorHandler.js`.

- `LOG_LEVEL` controls verbosity (`debug` in dev, `info` in production,
  silent in tests). Locally, `npm run dev | npx pino-pretty` gives colorized
  output instead of raw JSON.
- Sensitive fields (`password`, `token`, `push_token`, auth headers, etc.)
  are redacted automatically — see `redact` in `logger.js` before adding new
  fields that might carry secrets.

**Error tracking** is [Sentry](https://sentry.io) (`@sentry/node`), wired up
in `src/config/sentry.js` and initialized at the top of `src/app.js` (before
express/db so its auto-instrumentation attaches first):

- Any 5xx thrown/passed to `next(err)` in a route is reported automatically
  via `Sentry.setupExpressErrorHandler` in `app.js`. 4xx (validation, auth,
  etc.) is not sent — those aren't bugs.
- `uncaughtException` / `unhandledRejection` and a failed startup
  (`src/server.js`) are also reported.
- **To view errors**: set `SENTRY_DSN` (Sentry → Project Settings → Client
  Keys) in `.env.production`, then open the project's **Issues** page in
  Sentry. Each issue is tagged with `environment` and `release` (the
  deployed commit SHA — set automatically by `docker-compose.prod.yml` from
  the deploy workflow's `IMAGE_TAG`), so you can filter by deploy.
- With no `SENTRY_DSN` set (default in dev/CI/tests), `Sentry.init()` is a
  no-op — nothing is sent, nothing breaks.