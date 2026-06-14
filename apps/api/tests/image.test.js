const request = require('supertest');
const express = require('express');
const imageRoutes = require('../src/routes/imageRoutes');
const { getDb } = require('../src/db/mongodb');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn()
}));

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const mockInsertOne = jest.fn();
const mockDeleteOne = jest.fn();
const mockFindOne = jest.fn();
const mockFind = jest.fn(() => ({ sort: () => ({ toArray: () => [] }) }));

getDb.mockReturnValue({
  collection: () => ({
    insertOne: mockInsertOne,
    deleteOne: mockDeleteOne,
    findOne: mockFindOne,
    find: mockFind
  })
});

const { pool } = require('../src/db/mysql');

const app = express();
app.use(express.json());
app.use('/api/admin/images', imageRoutes);

const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

describe('Image Metadata Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should upload an image and save metadata', async () => {
    mockInsertOne.mockResolvedValueOnce({ insertedId: '123456789012345678901234' });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', pngBytes, 'test.jpg');

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('id');
    expect(mockInsertOne).toHaveBeenCalledTimes(1);
  });

  it('should block deletion of in-use image', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: '507f1f77bcf86cd799439011', storageType: 'cloud' });
    pool.query.mockResolvedValue([[{ image_id: '507f1f77bcf86cd799439011' }]]); // mock in use

    const res = await request(app)
      .delete('/api/admin/images/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain('in use');
  });

  it('should allow deletion of unused image', async () => {
    mockFindOne.mockResolvedValueOnce({ _id: '507f1f77bcf86cd799439012', storageType: 'cloud' });
    pool.query.mockResolvedValue([[]]); // mock unused

    const res = await request(app)
      .delete('/api/admin/images/507f1f77bcf86cd799439012')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(mockDeleteOne).toHaveBeenCalledTimes(1);
  });
});
