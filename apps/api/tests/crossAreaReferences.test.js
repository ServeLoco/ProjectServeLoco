/**
 * An area's records may only point at the SAME area's category / offer.
 * Ids are plain numbers, so an area admin used to be able to file their
 * product under another area's category (or link a Home section to another
 * area's category/offer) just by sending that id.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

const { pool } = require('../src/db/mysql');
const adminRoutes = require('../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

// Area 2's admin. Category 1 and offer 1 belong to area 1; 418 is area 2's.
const token = jwt.sign({ id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 2 }, process.env.JWT_SECRET || 'secret');
const OWN = { categories: [418], offers: [7] };

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockImplementation(async (sql, params = []) => {
    const q = String(sql);
    if (q.includes('FROM categories WHERE id = ?')) {
      return [OWN.categories.includes(Number(params[0])) && params[params.length - 1] === 2 ? [{ id: params[0] }] : []];
    }
    if (q.includes('FROM offers WHERE id = ?')) {
      return [OWN.offers.includes(Number(params[0])) && params[params.length - 1] === 2 ? [{ id: params[0] }] : []];
    }
    if (q.includes('FROM products WHERE id = ? AND deleted = 0 AND area_id = ?')) return [[{ id: 13, image_id: null, shop_id: null, shop_price: null }]];
    return [[]];
  });
});

const product = (categoryId) => ({ name: 'Paneer Roll', price: 60, category_id: categoryId, unit: '1 pc', available: true });

describe('products', () => {
  it('create: another area\'s category is refused before anything is written', async () => {
    const res = await request(app).post('/api/admin/products').set('Authorization', `Bearer ${token}`).send(product(1));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/category/i);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('edit: moving a product into another area\'s category is refused', async () => {
    const res = await request(app).put('/api/admin/products/13').set('Authorization', `Bearer ${token}`).send(product(1));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/category/i);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('CONTROL: the area\'s own category passes the check', async () => {
    pool.getConnection.mockRejectedValue(new Error('stop after validation'));
    const res = await request(app).post('/api/admin/products').set('Authorization', `Bearer ${token}`).send(product(418));
    expect(pool.getConnection).toHaveBeenCalled();
    expect(res.statusCode).toBe(500); // got past the check to the (stubbed) write
  });
});

describe('Home sections', () => {
  const section = (extra) => ({ title: 'Snacks', slug: 'snacks-row', section_type: 'product_block', store_type: 'packed', ...extra });

  it('a "See all" link to another area\'s category is refused', async () => {
    const res = await request(app).post('/api/admin/dashboard-sections').set('Authorization', `Bearer ${token}`)
      .send(section({ linked_category_id: 1 }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Linked category/);
  });

  it('a link to another area\'s offer is refused', async () => {
    const res = await request(app).post('/api/admin/dashboard-sections').set('Authorization', `Bearer ${token}`)
      .send(section({ linked_offer_id: 1 }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Linked offer/);
  });

  it('editing a section to link another area\'s category is refused too', async () => {
    const res = await request(app).patch('/api/admin/dashboard-sections/5').set('Authorization', `Bearer ${token}`)
      .send({ linked_category_id: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Linked category/);
  });
});

// Things with ONE copy for every area: only a super admin may change them.
describe('shared, all-area actions are super admin only', () => {
  const superToken = jwt.sign({ id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null }, process.env.JWT_SECRET || 'secret');

  it('an area admin cannot log out every admin of every area', async () => {
    const res = await request(app).post('/api/admin/revoke-sessions').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('an area admin cannot edit or reset the push templates every area sends', async () => {
    const edit = await request(app).patch('/api/admin/notification-templates/1').set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', body: 'y' });
    const reset = await request(app).post('/api/admin/notification-templates/1/reset').set('Authorization', `Bearer ${token}`);
    expect(edit.statusCode).toBe(403);
    expect(reset.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('CONTROL: a super admin can still revoke', async () => {
    const res = await request(app).post('/api/admin/revoke-sessions').set('Authorization', `Bearer ${superToken}`);
    expect(res.statusCode).toBe(200);
  });
});

