const request = require('supertest');
const express = require('express');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn()
  }
}));

jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRoutes);

describe('Curated Category Grid', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    pool.query.mockResolvedValue([[]]); // Default fallback for un-mocked queries
  });

  it('should return curated categories when they exist in dashboard_section_items', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, slug: 'categories-grid', section_type: 'category_grid', store_type: 'packed' }]]) // getDashboard sections
      .mockResolvedValueOnce([[{ id: 101, name: 'Curated Category', type: 'packed', image_id: null }]]); // curated category grid query

    const res = await request(app).get('/api/dashboard?storeType=packed');

    expect(res.statusCode).toEqual(200);
    const gridSection = res.body.data.sections.find(s => s.sectionType === 'category_grid');
    expect(gridSection).toBeDefined();
    expect(gridSection.items).toHaveLength(1);
    expect(gridSection.items[0].name).toEqual('Curated Category');

    // Ensure it queried dashboard_section_items
    expect(pool.query.mock.calls[1][0]).toContain('dashboard_section_items');
  });

  it('should hide the category section when no curated items are assigned', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1, slug: 'categories-grid', section_type: 'category_grid', store_type: 'packed' }]]) // getDashboard sections
      .mockResolvedValueOnce([[]]); // curated category grid query (returns empty)

    const res = await request(app).get('/api/dashboard?storeType=packed');

    expect(res.statusCode).toEqual(200);
    const gridSection = res.body.data.sections.find(s => s.sectionType === 'category_grid');
    expect(gridSection).toBeUndefined();

    // Only the curated dashboard_section_items query should have run — no fallback to all categories.
    expect(pool.query.mock.calls[1][0]).toContain('dashboard_section_items');
    expect(pool.query.mock.calls).toHaveLength(2);
  });
});
