module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^bcryptjs$': 'bcrypt',
    '^expo-server-sdk$': '<rootDir>/tests/__mocks__/expo-server-sdk.js'
  }
};
