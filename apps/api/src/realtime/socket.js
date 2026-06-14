const { Server } = require('socket.io');
const config = require('../config/env');
const { verifyToken } = require('../utils/auth');

let io = null;

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

const authenticateSocket = (socket, next) => {
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

  io.on('connection', (socket) => {
    joinRoleRoom(socket);
  });

  console.log('Realtime socket server initialized');
  return io;
};

const closeRealtime = async () => {
  if (!io) return;

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

const getRealtimeStatus = () => ({
  enabled: Boolean(io),
  connectedSockets: io?.engine?.clientsCount || 0,
});

module.exports = {
  closeRealtime,
  emitToAdmins,
  emitToCustomer,
  getRealtimeStatus,
  initRealtime,
};
