const request = require('supertest');
const express = require('express');
const imageRoutes = require('../src/routes/imageRoutes');
const { getDb } = require('../src/db/mongodb');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn()
}));

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
getDb.mockReturnValue({
  collection: () => ({
    insertOne: mockInsertOne,
    findOne: mockFindOne,
    find: jest.fn(() => ({ sort: () => ({ toArray: () => [] }) }))
  })
});

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([[]]) }
}));

const app = express();
app.use(express.json());
app.use('/api/admin/images', imageRoutes);

const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

describe('Image Upload Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should accept valid JPG magic bytes', async () => {
    mockInsertOne.mockResolvedValueOnce({ insertedId: '123456789012345678901234' });
    const fakeJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);

    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', fakeJpg, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.statusCode).toEqual(201);
  });

  it('should reject a spoofed file with fake magic bytes', async () => {
    const fakeExe = Buffer.from('MZP...................');
    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', fakeExe, { filename: 'exploit.php', contentType: 'image/jpeg' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain('Invalid image format');
  });

  it('should enforce the extension based on magic bytes', async () => {
    mockInsertOne.mockResolvedValueOnce({ insertedId: '123456789012345678901235' });
    const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);

    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', fakePng, { filename: 'wrongext.jpg', contentType: 'image/jpeg' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.filename).toMatch(/\.png$/);
  });
});
