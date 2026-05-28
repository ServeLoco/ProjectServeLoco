describe('Admin Configuration', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAdmin = process.env.ADMIN_OWNER_ID;
  const originalPass = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'very_long_and_safe_jwt_secret_key_here';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.MYSQL_HOST = 'localhost';
    process.env.MYSQL_PORT = '3306';
    process.env.MYSQL_DATABASE = 'db';
    process.env.MYSQL_USER = 'root';
    process.env.MYSQL_PASSWORD = 'password';
    process.env.MONGODB_URI = 'mongodb://localhost';
    process.env.MONGODB_DATABASE = 'db';
    jest.mock('dotenv', () => ({ config: jest.fn() }));
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.ADMIN_OWNER_ID = originalAdmin;
    process.env.ADMIN_PASSWORD = originalPass;
  });

  it('should throw error in production if admin password is weak', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_OWNER_ID = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    expect(() => require('../src/config/env')).toThrow('ADMIN_PASSWORD is too weak for production environments.');
  });

  it('should throw error if admin credentials are missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_OWNER_ID;
    delete process.env.ADMIN_PASSWORD;
    expect(() => require('../src/config/env')).toThrow('Missing required environment variables');
  });

  it('should allow strong admin credentials in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_OWNER_ID = 'admin_user';
    process.env.ADMIN_PASSWORD = 'strong_password_123';
    const env = require('../src/config/env');
    expect(env.ADMIN_PASSWORD).toBe('strong_password_123');
  });
});
