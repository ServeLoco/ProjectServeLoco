// Error tracking (Sentry). Required first in app.js — before express and the
// route/controller/repository chain — so its auto-instrumentation of http,
// mysql2, etc. is installed before those modules are used.
//
// With no SENTRY_DSN set (local dev, tests, CI), Sentry.init() disables
// itself: every SDK call below becomes a safe no-op, no network access is
// attempted, and nothing here throws.
require('./loadEnv');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.APP_ENV || process.env.NODE_ENV,
  // Set by the deploy workflow to the deployed commit SHA (SENTRY_RELEASE),
  // so a Sentry issue can be tied back to the exact image that produced it.
  release: process.env.SENTRY_RELEASE || undefined,
  // Basic error tracking, not full APM — keep tracing off unless asked for.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
});

module.exports = Sentry;
