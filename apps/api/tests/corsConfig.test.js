describe('CORS Configuration', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalCors = process.env.CORS_ORIGIN;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.CORS_ORIGIN = originalCors;
    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'very_long_and_safe_jwt_secret_key_here';
  });

  it('should throw error in production if CORS_ORIGIN is wildcard', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';
    expect(() => require('../src/config/env')).toThrow('CORS_ORIGIN must be explicitly defined in production');
  });

  it('should throw error in production if CORS_ORIGIN is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    expect(() => require('../src/config/env')).toThrow('CORS_ORIGIN must be explicitly defined in production');
  });

  it('should allow explicit CORS_ORIGIN in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://example.com';
    // Assume JWT_SECRET is safe to pass the other check
    process.env.JWT_SECRET = 'very_long_and_safe_jwt_secret_key_here';
    process.env.ADMIN_PASSWORD = 'veryStrongAdminPassword123';
    const env = require('../src/config/env');
    expect(env.CORS_ORIGIN).toBe('https://example.com');
  });
});
