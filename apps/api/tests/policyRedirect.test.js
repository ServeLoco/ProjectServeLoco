const request = require('supertest');

jest.mock('../src/db/mongodb', () => ({
  getDb: () => ({ collection: () => ({}) })
}));

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), execute: jest.fn(), getConnection: jest.fn(), end: jest.fn() }
}));

const app = require('../src/app');

describe('old /policies links redirect to the website', () => {
  test.each([
    ['/policies', 'https://villkro.in/'],
    ['/policies/', 'https://villkro.in/'],
    ['/policies/index.html', 'https://villkro.in/'],
    ['/policies/privacy', 'https://villkro.in/privacy/'],
    ['/policies/privacy.html', 'https://villkro.in/privacy/'],
    ['/policies/terms', 'https://villkro.in/terms/'],
    ['/policies/delete-account', 'https://villkro.in/delete-account/'],
    ['/policies/delete-account.html', 'https://villkro.in/delete-account/'],
  ])('%s -> %s', async (from, to) => {
    const res = await request(app).get(from);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(to);
  });

  test('works for a browser Origin that is not on the CORS list', async () => {
    const res = await request(app).get('/policies/privacy').set('Origin', 'https://example.com');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://villkro.in/privacy/');
  });

  test('unknown pages are a plain 404', async () => {
    const res = await request(app).get('/policies/nope');
    expect(res.status).toBe(404);
  });
});
