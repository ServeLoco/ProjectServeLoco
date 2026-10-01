const shared = {
  testEnvironment: 'node',
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
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

module.exports = {
  projects: [
    {
      ...shared,
      testMatch: ['**/tests/**/*.test.js'],
      testPathIgnorePatterns: ['/node_modules/', '/tests/integration/']
    },
    // The real-MySQL files share one database, so they run one at a time —
    // see tests/helpers/serialRunner.js.
    {
      ...shared,
      testMatch: ['**/tests/integration/**/*.test.js'],
      runner: '<rootDir>/tests/helpers/serialRunner.js'
    }
  ]
};
