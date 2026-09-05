/**
 * Destructive admin endpoints must not report success for a row that is not
 * there. A full-route sweep against a live server found several replying 200
 * ("Dismissed", "Product removed from offer", "Image deleted successfully")
 * for ids that never existed — they ran a correctly-scoped DELETE/UPDATE and
 * then answered without checking affectedRows. The scoping was never the
 * problem; the admin UI simply could not tell a real change from a no-op,
 * which hides stale client state behind an apparent success.
 *
 * (POST /shop/orders/:orderId/alert-ack is deliberately NOT in here: it is a
 * documented fire-and-forget ack that always 200s and reports the outcome in
 * its `acked` body field instead.)
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const token = jwt.sign(
  { sub: '1', role: 'admin', adminRole: 'area_admin', areaId: 1 },
  process.env.JWT_SECRET || 'secret'
);

// Route by SQL rather than call order: these handlers also trigger
// fire-and-forget background reads (unread-count broadcast, cache bust) whose
// position in the queue is not something a test should depend on.
const mockDb = ({ selectRows = [], affectedRows = 0 } = {}) => {
  pool.query.mockImplementation((sql) => {
    if (/^\s*SELECT id FROM admin_notifications/i.test(sql)) return Promise.resolve([selectRows]);
    if (/^\s*DELETE FROM admin_notifications/i.test(sql)) return Promise.resolve([{ affectedRows }]);
    if (/^\s*DELETE FROM offer_products/i.test(sql)) return Promise.resolve([{ affectedRows }]);
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([{ affectedRows }]);
    return Promise.resolve([[]]);
  });
};

describe('destructive admin endpoints 404 a row that does not exist', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('PATCH /admin/inbox/:id/read', () => {
    it('404s an id that is not in this admin\'s area', async () => {
      mockDb({ selectRows: [] });
      const res = await request(app)
        .patch('/api/admin/inbox/999999/read')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('200s a row that exists', async () => {
      mockDb({ selectRows: [{ id: 7 }], affectedRows: 1 });
      const res = await request(app)
        .patch('/api/admin/inbox/7/read')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('still 200s a row that exists but was ALREADY read', async () => {
      // The UPDATE carries `AND read_at IS NULL`, so an already-read row
      // reports 0 affected. That must not read as "not found" — which is
      // exactly why existence is checked with its own SELECT rather than
      // inferred from affectedRows.
      mockDb({ selectRows: [{ id: 7 }], affectedRows: 0 });
      const res = await request(app)
        .patch('/api/admin/inbox/7/read')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /admin/inbox/:id', () => {
    it('404s when nothing was deleted', async () => {
      mockDb({ affectedRows: 0 });
      const res = await request(app)
        .delete('/api/admin/inbox/999999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('200s when a row was deleted', async () => {
      mockDb({ affectedRows: 1 });
      const res = await request(app)
        .delete('/api/admin/inbox/7')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Dismissed');
    });
  });

  describe('DELETE /admin/offers/:id/products/:productId', () => {
    it('404s a product that is not on the offer', async () => {
      mockDb({ affectedRows: 0 });
      const res = await request(app)
        .delete('/api/admin/offers/999999/products/999999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('200s a product that was actually removed', async () => {
      mockDb({ affectedRows: 1 });
      const res = await request(app)
        .delete('/api/admin/offers/3/products/1')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Product removed from offer');
    });
  });
});
