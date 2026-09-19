// Structured (JSON) logging for the whole API — replaces ad-hoc console.*
// calls, which previously only ever reached `docker logs` on the box with no
// level, timestamp, or field structure to filter/search on.
//
// Level defaults: silent in tests (keeps `npm test` output clean), debug in
// dev, info in production. Override with LOG_LEVEL for any environment.
//
// Pretty-printing is opt-in-by-environment only (plain `development`), and
// falls back to raw JSON if pino-pretty isn't resolvable — it's a
// devDependency, so it's absent from the production Docker image, which is
// exactly where we want the JSON on stdout (docker logs / any log shipper).
const pino = require('pino');
const { appEnv } = require('../config/loadEnv');

const NODE_ENV = process.env.NODE_ENV || appEnv || 'development';

const defaultLevel =
  NODE_ENV === 'test' ? 'silent' : NODE_ENV === 'production' ? 'info' : 'debug';

let transport;
if (NODE_ENV === 'development') {
  try {
    require.resolve('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    };
  } catch (_) {
    transport = undefined;
  }
}

const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  base: { service: 'serveloco-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'password_hash',
      '*.password_hash',
      'newPassword',
      '*.newPassword',
      'token',
      '*.token',
      'push_token',
      '*.push_token',
    ],
    censor: '[REDACTED]',
  },
  transport,
});

module.exports = logger;
