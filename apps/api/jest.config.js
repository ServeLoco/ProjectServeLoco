module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^bcryptjs$': 'bcrypt',
    '^expo-server-sdk$': '<rootDir>/tests/__mocks__/expo-server-sdk.js',
    // Mock firebase-admin in tests because it pulls in `jose` (an ESM-only
    // package) which Jest can't transform. The auth controller's Firebase
    // verification path is exercised via integration tests, not unit tests.
    '^firebase-admin/app$': '<rootDir>/tests/__mocks__/firebase-admin-app.js',
    '^firebase-admin/auth$': '<rootDir>/tests/__mocks__/firebase-admin-auth.js',
    '^firebase-admin/messaging$': '<rootDir>/tests/__mocks__/firebase-admin-messaging.js'
  }
};
