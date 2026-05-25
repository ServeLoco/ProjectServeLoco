const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/mysql');
const { signCustomerToken, signAdminToken } = require('../src/utils/auth');

let userToken;
let adminToken;
let customerId;

beforeAll(async () => {
  // Create a test user
  const phone = '9999' + Math.floor(100000 + Math.random() * 900000);
  const [result] = await pool.query('INSERT INTO users (phone, name, password_hash) VALUES (?, ?, ?)', [phone, 'Test User', 'hash']);
  customerId = result.insertId;
  userToken = signCustomerToken(customerId);
  adminToken = signAdminToken(1);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ?', [customerId]);
  await pool.end();
});

describe('Notifications API', () => {
  let batchId;
  let notificationId;

  it('Admin should be able to create a broadcast notification', async () => {
    const res = await request(app)
      .post('/api/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Test Broadcast',
        body: 'This is a test broadcast',
        type: 'info',
        target: 'everyone'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('batchId');
    batchId = res.body.data.batchId;
  });

  it('Customer should be able to get unread count', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBeGreaterThan(0);
  });

  it('Customer should be able to get their notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    
    notificationId = res.body.data[0].id;
  });

  it('Customer should be able to mark a notification as read', async () => {
    const res = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Customer should be able to mark all notifications as read', async () => {
    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Unread count should be 0 after marking all as read', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);
  });

  it('Customer should be able to delete a notification', async () => {
    const res = await request(app)
      .delete(`/api/notifications/${notificationId}`)
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Admin should be able to delete a broadcast', async () => {
    const res = await request(app)
      .delete(`/api/admin/notifications/${batchId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
