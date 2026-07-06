const request = require('supertest');
const express = require('express');
const imageRoutes = require('../src/routes/imageRoutes');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const { pool } = require('../src/db/mysql');

const app = express();
app.use(express.json());
app.use('/api/admin/images', imageRoutes);

const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

// Threads the row inserted by uploadImage through to the SELECT that
// follows it, and lets each test control the "used by" queries independently.
const mockImagesTable = ({ usedByProducts = [] } = {}) => {
  let lastInsertedRow = null;
  pool.query.mockImplementation((sql, params = []) => {
    if (sql.startsWith('INSERT INTO images')) {
      const [filename, original_name, mime_type, size, storage_type, url, alt_text] = params;
      lastInsertedRow = {
        id: 1, filename, original_name, mime_type, size, storage_type, url, alt_text,
        created_at: new Date(), updated_at: new Date()
      };
      return Promise.resolve([{ insertId: 1 }]);
    }
    if (sql.startsWith('SELECT * FROM images WHERE id')) {
      return Promise.resolve([[lastInsertedRow]]);
    }
    if (sql.includes('SELECT DISTINCT image_id FROM products')) {
      return Promise.resolve([usedByProducts]);
    }
    if (sql.startsWith('DELETE FROM images')) {
      return Promise.resolve([{ affectedRows: 1 }]);
    }
    return Promise.resolve([[]]);
  });
};

describe('Image Metadata Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should upload an image and save metadata', async () => {
    mockImagesTable();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', pngBytes, 'test.jpg');

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('id', '1');
  });

  it('should block deletion of in-use image', async () => {
    mockImagesTable({ usedByProducts: [{ image_id: 42 }] });

    const res = await request(app)
      .delete('/api/admin/images/42')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain('in use');
  });

  it('should allow deletion of unused image', async () => {
    mockImagesTable();
    pool.query.mockImplementationOnce(() => Promise.resolve([[]])); // products (unused)

    const res = await request(app)
      .delete('/api/admin/images/42')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
  });
});
