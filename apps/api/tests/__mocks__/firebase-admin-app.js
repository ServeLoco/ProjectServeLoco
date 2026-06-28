// Mock for firebase-admin/app in Jest. The real module pulls in `jose`
// (an ESM-only package) which Jest can't transform. Tests that don't
// actually verify Firebase tokens don't need the real implementation.
module.exports = {
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  cert: jest.fn(() => ({})),
  applicationDefault: jest.fn(() => ({})),
};
