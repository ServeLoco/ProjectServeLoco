const path = require('path');
const { spawnSync } = require('child_process');

// The pool is built once at require time from config, so each case loads a
// fresh copy of config/env.js + db/mysql.js with mysql2's createPool mocked.
const loadPoolOptions = (poolSizeEnv) => {
  const saved = process.env.MYSQL_POOL_SIZE;
  if (poolSizeEnv === undefined) delete process.env.MYSQL_POOL_SIZE;
  else process.env.MYSQL_POOL_SIZE = poolSizeEnv;
  let options;
  try {
    jest.isolateModules(() => {
      const createPool = jest.fn(() => ({}));
      jest.doMock('mysql2/promise', () => ({ createPool }));
      require('../src/db/mysql');
      [[options]] = createPool.mock.calls;
    });
  } finally {
    if (saved === undefined) delete process.env.MYSQL_POOL_SIZE;
    else process.env.MYSQL_POOL_SIZE = saved;
  }
  return options;
};

describe('MySQL pool settings', () => {
  it('defaults to 10 connections, queueing any burst beyond that', () => {
    const options = loadPoolOptions(undefined);
    expect(options.connectionLimit).toBe(10);
    expect(options.waitForConnections).toBe(true);
    expect(options.queueLimit).toBe(0);
  });

  it('honours MYSQL_POOL_SIZE', () => {
    expect(loadPoolOptions('20').connectionLimit).toBe(20);
  });

  it.each(['0', '-4', 'abc'])('falls back to 10 for an unusable MYSQL_POOL_SIZE (%p)', (value) => {
    expect(loadPoolOptions(value).connectionLimit).toBe(10);
  });

  it('sets no idle reaper (maxIdle/idleTimeout)', () => {
    const options = loadPoolOptions(undefined);
    expect(options).not.toHaveProperty('maxIdle');
    expect(options).not.toHaveProperty('idleTimeout');
  });

  // The real mysql2 pool, no connection made. With an idle reaper configured
  // this process never exits — and the deploy runs db:migrate, which loads
  // this pool, as a script it waits on with the API stopped.
  it('lets a script that loads the pool exit on its own', () => {
    const apiDir = path.join(__dirname, '..');
    const result = spawnSync(process.execPath, ['-e', "require('./src/db/mysql')"], {
      cwd: apiDir,
      timeout: 15_000,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        APP_ENV: 'test',
        MYSQL_HOST: '127.0.0.1',
        MYSQL_PORT: '9',
        MYSQL_USER: 'nobody',
        MYSQL_PASSWORD: 'x',
        MYSQL_DATABASE: 'none',
        MONGODB_URI: 'mongodb://127.0.0.1:9/',
        MONGODB_DATABASE: 'none',
        JWT_SECRET: 'test_jwt_secret_that_is_long_enough',
      },
    });
    expect(result.signal).toBeNull(); // not killed by the timeout
    expect(result.stderr.toString()).toBe('');
    expect(result.status).toBe(0);
  }, 20_000);
});
