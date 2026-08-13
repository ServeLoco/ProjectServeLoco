const { Server } = require('socket.io');
const config = require('../config/env');
const { verifyToken } = require('../utils/auth');
const { createPresenceTracker } = require('./presence');
const sessionStore = require('../services/analytics/sessionStore');
const { pool } = require('../db/mysql');

let io = null;
let presenceTracker = null;

// A connection that closes sooner than this is logged with its disconnect
// reason (see the 'disconnect' handler). 30s sits well above a real session
// and well below socket.io's own 5s reconnect ceiling, so a client stuck in a
// reconnect loop lands every time while ordinary traffic stays silent.
const SHORT_SESSION_LOG_MS = 30_000;

const parseAllowedOrigins = () => {
  const origins = String(config.CORS_ORIGIN || '*')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes('*')) return '*';
  return origins;
};

const extractSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  const header = socket.handshake.headers?.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.substring(7);
  }

  return null;
};

const authenticateSocket = async (socket, next) => {
  const token = extractSocketToken(socket);

  if (!token) {
    return next(new Error('AUTH_TOKEN_MISSING'));
  }

  try {
    const payload = verifyToken(token);
    const role = payload.role;
    const id = payload.sub || payload.id;

    if (!id || !['customer', 'admin'].includes(role)) {
      return next(new Error('FORBIDDEN_ROLE'));
    }

    // Mirror requireAdmin's revocation check (authMiddleware.js) — an admin
    // hitting "revoke sessions" for a leaked token must also cut that
    // token's realtime access, not just its REST access.
    if (role === 'admin' && process.env.NODE_ENV !== 'test') {
      const [rows] = await pool.query('SELECT revoked_before FROM admin_auth_state WHERE id = 1');
      const revokedBefore = rows[0]?.revoked_before;
      if (revokedBefore && payload.iat && payload.iat * 1000 < new Date(revokedBefore).getTime()) {
        return next(new Error('AUTH_TOKEN_INVALID'));
      }
    }

    socket.data.auth = { id, role };
    return next();
  } catch (_error) {
    return next(new Error('AUTH_TOKEN_INVALID'));
  }
};

const joinRoleRoom = (socket) => {
  const auth = socket.data.auth;
  if (!auth) return;

  if (auth.role === 'customer') {
    socket.join(`customer:${auth.id}`);
    // Shared room for broadcasts that apply to every customer regardless
    // of identity (e.g. a shop's open/closed status).
    socket.join('customers');
    return;
  }

  if (auth.role === 'admin') {
    socket.join('admin');
  }
};

const initRealtime = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: parseAllowedOrigins(),
      methods: ['GET', 'POST'],
    },
    // Compresses each Socket.IO frame (60–80% smaller payloads). Clients
    // negotiate automatically via the permessage-deflate extension. No
    // behavior change — just lower bandwidth.
    perMessageDeflate: {
      threshold: 1024,
    },
  });

  io.use(authenticateSocket);

  // Live analytics presence tracker — in-memory Map of online customers,
  // emits `analytics.live` to the admin room every 5s. Fire-and-forget: a Mongo
  // outage never affects socket connection handling (sessionStore swallows).
  presenceTracker = createPresenceTracker({
    sessionStore,
    emitToAdmins,
    // Liveness probe for the tracker's reaper — the Map is keyed by socket.id,
    // so io.sockets.sockets is the authoritative "is this still connected".
    isSocketAlive: (socketId) => io.sockets.sockets.has(socketId),
  });

  io.on('connection', (socket) => {
    joinRoleRoom(socket);
    const connectedAtMs = Date.now();

    // Analytics presence — customers only (admin sockets are never counted).
    const auth = socket.data.auth;
    if (auth && auth.role === 'customer') {
      const platform = socket.handshake.auth?.platform || null;
      const appVersion = socket.handshake.auth?.appVersion || null;
      presenceTracker.addPresence(socket.id, {
        userId: auth.id,
        role: auth.role,
        platform,
        appVersion,
      }).catch(() => {});
    }

    // Screen-change events from the customer app (analyticsClient.trackScreen).
    socket.on('analytics:screen', (data) => {
      if (presenceTracker && data && typeof data.screen === 'string') {
        presenceTracker.updateScreen(socket.id, data.screen);
      }
    });

    socket.on('disconnect', (reason) => {
      // Diagnostic for the reconnect storm: one device has been reconnecting on
      // socket.io's 5s backoff ceiling for a month (5151 sessions, 10 minutes of
      // total connected time), and nothing recorded *why* its sockets closed.
      // The handshake succeeds every time — these connections die after
      // 'connection' fires — so the reason code is the only thing that
      // separates the candidates: 'transport close' (network dropped),
      // 'ping timeout' (process frozen/killed mid-session), 'transport error'
      // (proxy or TLS), 'client namespace disconnect' (the app called
      // disconnect() itself). Only short-lived connections are logged: a normal
      // session ending carries no information and would bury the signal.
      const livedMs = Date.now() - connectedAtMs;
      if (livedMs < SHORT_SESSION_LOG_MS) {
        console.warn('[socket] short-lived connection ' + JSON.stringify({
          userId: socket.data.auth?.id ?? null,
          role: socket.data.auth?.role ?? null,
          reason,
          livedMs,
          transport: socket.conn?.transport?.name ?? null,
          platform: socket.handshake.auth?.platform ?? null,
          appVersion: socket.handshake.auth?.appVersion ?? null,
        }));
      }

      if (presenceTracker) {
        presenceTracker.removePresence(socket.id).catch(() => {});
      }
    });
  });

  console.log('Realtime socket server initialized');
  return io;
};

const closeRealtime = async () => {
  if (!io) return;

  if (presenceTracker) {
    presenceTracker.stop();
    presenceTracker = null;
  }

  await new Promise((resolve) => {
    io.close(resolve);
  });
  io = null;
  console.log('Realtime socket server closed');
};

const emitToRoom = (room, eventName, payload) => {
  if (!io) return false;

  try {
    io.to(room).emit(eventName, payload);
    return true;
  } catch (error) {
    console.error('Realtime emit failed:', error.message);
    return false;
  }
};

const emitToCustomer = (customerId, eventName, payload) => {
  if (!customerId) return false;
  return emitToRoom(`customer:${customerId}`, eventName, payload);
};

const emitToAdmins = (eventName, payload) => emitToRoom('admin', eventName, payload);

const emitToAllCustomers = (eventName, payload) => emitToRoom('customers', eventName, payload);

const getRealtimeStatus = () => ({
  enabled: Boolean(io),
  connectedSockets: io?.engine?.clientsCount || 0,
});

module.exports = {
  closeRealtime,
  emitToAdmins,
  emitToAllCustomers,
  emitToCustomer,
  getRealtimeStatus,
  initRealtime,
};
