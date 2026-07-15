// Mock for firebase-admin/messaging in Jest — same reasoning as
// firebase-admin-app.js / firebase-admin-auth.js (real module pulls in
// `jose`, an ESM-only package Jest can't transform).
module.exports = {
  getMessaging: jest.fn(() => ({
    send: jest.fn(async () => 'mock-message-id'),
  })),
};
