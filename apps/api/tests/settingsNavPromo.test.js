/**
 * The customer app's nav-bar image: an uploaded image plus the http(s) link
 * it opens, set per area from the admin Settings page.
 */
const { getSettings, updateSettings } = require('../src/controllers/settingsController');
const { getImages } = require('../src/controllers/imageController');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../src/db/mysql');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('nav-bar image link validation', () => {
  it.each([
    'javascript:alert(1)',
    'ftp://example.com/a',
    'example.com/no-scheme',
    'https://exa mple.com',
    `https://example.com/${'a'.repeat(500)}`,
  ])('rejects %s with 400 before touching the database', async (link) => {
    const res = mockRes();
    await updateSettings({ areaId: 31, body: { nav_promo_link: link } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric image id', async () => {
    const res = mockRes();
    await updateSettings({ areaId: 31, body: { nav_promo_image_id: 'abc' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('saves a valid https link, trimmed, and an empty image id as NULL', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 31, upi_qr_image_id: null, nav_promo_image_id: null }]]) // existing row
      .mockResolvedValueOnce([{}]) // UPDATE
      .mockResolvedValueOnce([[{ id: 31, area_id: 31, nav_promo_image_id: null, nav_promo_link: 'https://example.com/sale' }]]); // updated row

    const res = mockRes();
    await updateSettings({
      areaId: 31,
      body: { nav_promo_link: '  https://example.com/sale  ', nav_promo_image_id: '' },
    }, res);

    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('nav_promo_link = ?');
    expect(updateCall[0]).toContain('nav_promo_image_id = ?');
    expect(updateCall[1]).toEqual(expect.arrayContaining(['https://example.com/sale', null]));
    const [[response]] = res.json.mock.calls;
    expect(response.data.navPromoLink).toBe('https://example.com/sale');
    expect(response.data.navPromoImageUrl).toBeNull();
  });

  it('clears the link when it is sent empty', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 32, upi_qr_image_id: null, nav_promo_image_id: null }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: 32, area_id: 32, nav_promo_link: null }]]);
    const res = mockRes();
    await updateSettings({ areaId: 32, body: { nav_promo_link: '' } }, res);
    expect(pool.query.mock.calls[1][1]).toEqual(expect.arrayContaining([null]));
  });
});

describe('saving with no night surcharge', () => {
  it('is refused if the night times ride along, and fine when the admin page leaves them out', async () => {
    // What the admin page used to send: 0 surcharge plus the default window.
    const refused = mockRes();
    await updateSettings({
      areaId: 35,
      body: { night_charge: 0, night_charge_start: '21:00:00', night_charge_end: '06:00:00' },
    }, refused);
    expect(refused.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();

    // What it sends now (times omitted): the save goes through.
    pool.query
      .mockResolvedValueOnce([[{ id: 35, upi_qr_image_id: null, nav_promo_image_id: null }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: 35, area_id: 35 }]]);
    const ok = mockRes();
    await updateSettings({ areaId: 35, body: { night_charge: 0, nav_promo_link: 'https://example.com' } }, ok);
    expect(ok.status).not.toHaveBeenCalledWith(400);
    expect(pool.query.mock.calls[1][0]).not.toContain('night_charge_start');
  });
});

describe('nav-bar image in the public settings', () => {
  it('returns the image URL in both casings and the link', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 33, area_id: 33, nav_promo_image_id: 7, nav_promo_link: 'https://example.com/x' }]]) // settings
      .mockResolvedValueOnce([[{ id: 7, url: 'https://cdn.example.com/nav.webp' }]]); // the nav image

    const res = mockRes();
    await getSettings({ areaId: 33 }, res);

    const [[response]] = res.json.mock.calls;
    expect(response.data.nav_promo_image_url).toBe('https://cdn.example.com/nav.webp');
    expect(response.data.navPromoImageUrl).toBe('https://cdn.example.com/nav.webp');
    expect(response.data.navPromoLink).toBe('https://example.com/x');
  });

  it('is null (an empty slot) when no image is set', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 34, area_id: 34, nav_promo_image_id: null, nav_promo_link: null }]]);
    const res = mockRes();
    await getSettings({ areaId: 34 }, res);
    const [[response]] = res.json.mock.calls;
    expect(response.data.nav_promo_image_url).toBeNull();
    expect(response.data.navPromoLink).toBeNull();
  });
});

describe('the nav-bar image counts as in use', () => {
  it('is not offered for cleanup while an area uses it', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 7, filename: 'nav.webp', created_at: new Date() }, { id: 8, filename: 'old.webp', created_at: new Date() }]]) // images
      .mockResolvedValueOnce([[]]) // products
      .mockResolvedValueOnce([[]]) // categories
      .mockResolvedValueOnce([[]]) // combos
      .mockResolvedValueOnce([[]]) // offers
      .mockResolvedValueOnce([[{ upi_qr_image_id: null, nav_promo_image_id: 7 }]]) // settings
      .mockResolvedValueOnce([[]]) // store_modes
      .mockResolvedValueOnce([[]]) // product_library
      .mockResolvedValueOnce([[]]) // category_library
      .mockResolvedValueOnce([[]]); // store_mode_library

    const res = mockRes();
    await getImages({}, res);
    const [[response]] = res.json.mock.calls;
    const byId = Object.fromEntries(response.data.map((img) => [img.id, img]));
    expect(byId['7'].in_use).toBe(true);
    expect(byId['7'].usage).toContain('Nav Bar Image');
    expect(byId['8'].in_use).toBe(false);
  });
});
