const request = require('supertest');
const express = require('express');
const imageRoutes = require('../src/routes/imageRoutes');
const { getDb } = require('../src/db/mongodb');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn()
}));

const mockInsertOne = jest.fn();
getDb.mockReturnValue({
  collection: () => ({
    insertOne: mockInsertOne
  })
});

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

    const res = await request(app)
      .post('/api/admin/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake image data'), 'test.jpg');

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('id');
    expect(mockInsertOne).toHaveBeenCalledTimes(1);
  });
});
