/**
 * Home "offer cards" (dashboard section type 'offer_cards') and the deal
 * catalog behind them.
 *
 * An offer card is an admin-built card in a horizontal Home row. `design`
 * picks how the app draws it; only 'deal_tabs' exists so far (the ₹9 / ₹29 /
 * ₹49 card: a tab per deal price, a few products per tab, "View all"). Every
 * colour and label lives in style_json, so cards are restyled without a
 * release. A deal_tabs card shows a deal price coupon (discount_type
 * 'deal_price'); its tabs are that deal's distinct deal prices.
 *
 * The pricing itself never happens here — utils/coupons.js applyBestDeal
 * decides what a cart pays. This file only lists what a deal sells.
 */

const { pool } = require('../db/mysql');
const microCache = require('../utils/microCache');
const { requestAreaId, bustAreaCaches } = require('../utils/areaScope');
const { getActiveStoreModeSlugs, isSystemModeSlug } = require('../utils/storeMode');
const { isWithinDateWindow, isWithinActiveDays, isWithinActiveTime } = require('../utils/coupons');
const { toMoney } = require('../utils/money');
const { attachVariants } = require('./productController');
const { resolveImageUrls, mapProductRows } = require('./dashboardController');

const DEAL_PAGE_TTL_MS = 120_000;

const OFFER_CARD_DESIGNS = ['deal_tabs'];

// Defaults match the Instamart-style purple card; the admin overrides any of
// them per card. The app merges these under the stored style too, so a card
// saved before a key existed still renders.
const DEFAULT_STYLE = {
  bgColor: '#EDE7FF',
  bgColorEnd: '#FFFFFF',
  accentColor: '#6C3BF5',
  titleColor: '#1F1147',
  subtitleColor: '#4B4470',
  tabColor: '#5B2FD6',
  tabActiveColor: '#FFFFFF',
  tabTextColor: '#FFFFFF',
  buttonColor: '#2F6BFF',
  buttonText: 'Select',
  footerText: 'View items at all prices',
  rowsPerTab: 3,
};
const STYLE_COLOR_KEYS = [
  'bgColor', 'bgColorEnd', 'accentColor', 'titleColor', 'subtitleColor',
  'tabColor', 'tabActiveColor', 'tabTextColor', 'buttonColor',
];
const STYLE_TEXT_LIMITS = { buttonText: 20, footerText: 60 };
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MAX_ROWS_PER_TAB = 6;

const requireOneArea = (req, res) => {
  const areaId = requestAreaId(req);
  if (areaId === null) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'X-Area-Id is required to manage offer cards' });
    return null;
  }
  if (areaId === 'all') {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Offer cards cannot be managed for "all" areas at once — pick one area' });
    return null;
  }
  return areaId;
};

const parseStyle = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) || {};
  } catch {
    return {};
  }
};

/** Keeps only known style keys with valid values. Returns { style } or { error }. */
const sanitizeStyle = (input) => {
  if (input === undefined || input === null) return { style: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { error: 'style must be an object' };
  const style = {};
  for (const key of STYLE_COLOR_KEYS) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) return { error: `${key} must be a hex colour like #6C3BF5` };
    style[key] = value;
  }
  for (const [key, limit] of Object.entries(STYLE_TEXT_LIMITS)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { error: `${key} must be text` };
    const trimmed = value.trim();
    if (trimmed.length > limit) return { error: `${key} must be at most ${limit} characters` };
    if (trimmed) style[key] = trimmed;
  }
  if (input.rowsPerTab !== undefined && input.rowsPerTab !== null && input.rowsPerTab !== '') {
    const rows = Number(input.rowsPerTab);
    if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS_PER_TAB) {
      return { error: `rowsPerTab must be a whole number from 1 to ${MAX_ROWS_PER_TAB}` };
    }
    style.rowsPerTab = rows;
  }
  return { style };
};

const resolvedStyle = (stored) => ({ ...DEFAULT_STYLE, ...parseStyle(stored) });

const isDealLive = (coupon, now = new Date()) => Boolean(coupon)
  && coupon.discount_type === 'deal_price'
  && Boolean(coupon.active) && !coupon.deleted
  && isWithinDateWindow(coupon, now)
  && isWithinActiveDays(coupon, now)
  && isWithinActiveTime(coupon, now);

/**
 * Lists what live deals sell, grouped by deal price (the card's tabs).
 *
 * One query for the deals and one for every deal's items, however many cards
 * are asked about (§3.9). `perTier` caps the products per price tier for the
 * Home card (ROW_NUMBER in SQL, so a 200-item deal never ships 200 rows to
 * Home); null returns every product, for the Deal page.
 *
 * @returns {Promise<Map<number, object>>} couponId -> deal payload, live deals
 *   with at least one sellable product only.
 */
const loadDealCatalog = async ({ areaId, couponIds, perTier = null, includeClosedShops = false }) => {
  const ids = [...new Set((couponIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map();
  if (ids.length === 0) return result;

  const [coupons] = await pool.query(
    "SELECT * FROM coupons WHERE id IN (?) AND area_id = ? AND discount_type = 'deal_price' AND deleted = 0",
    [ids, areaId]
  );
  const now = new Date();
  const live = coupons.filter((c) => isDealLive(c, now));
  if (live.length === 0) return result;

  const shopOpenWhere = includeClosedShops
    ? '(p.shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.active = 1))'
    : '(p.shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.is_open = 1 AND s.active = 1))';
  const availableWhere = includeClosedShops ? '1=1' : 'p.available = 1 AND (pv.id IS NULL OR pv.available = 1)';

  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT cdi.id AS deal_item_id, cdi.coupon_id, cdi.variant_id AS deal_variant_id, cdi.deal_price,
              pv.label AS deal_variant_label, pv.price AS deal_variant_price, pv.available AS deal_variant_available,
              p.*, cat.name AS category_name, cat.type AS category_type,
              IF(p.shop_id IS NULL OR (sh.is_open = 1 AND sh.active = 1), 1, 0) AS shop_is_open,
              ROW_NUMBER() OVER (PARTITION BY cdi.coupon_id, cdi.deal_price ORDER BY cdi.display_order, cdi.id) AS tier_rank,
              cdi.display_order AS deal_display_order
       FROM coupon_deal_items cdi
       JOIN products p ON p.id = cdi.product_id
       LEFT JOIN product_variants pv ON pv.id = cdi.variant_id AND pv.product_id = cdi.product_id AND pv.deleted = 0
       LEFT JOIN categories cat ON cat.id = p.category_id
       LEFT JOIN shops sh ON sh.id = p.shop_id
       WHERE cdi.area_id = ? AND cdi.coupon_id IN (?) AND cdi.active = 1
         AND p.deleted = 0 AND p.is_combo = 0 AND p.area_id = ?
         AND (cdi.variant_id IS NULL OR pv.id IS NOT NULL)
         AND ${availableWhere} AND ${shopOpenWhere}
         AND (p.group_id IS NULL OR EXISTS (SELECT 1 FROM product_groups g WHERE g.id = p.group_id AND g.active = 1 AND g.area_id = p.area_id))
     ) ranked
     WHERE ? IS NULL OR tier_rank <= ?
     ORDER BY coupon_id, deal_price, tier_rank`,
    [areaId, live.map((c) => c.id), areaId, perTier, perTier]
  );

  await Promise.all([resolveImageUrls(rows), attachVariants(rows)]);

  const products = mapProductRows(rows);
  const tiersByCoupon = new Map();
  rows.forEach((row, index) => {
    const regularPrice = toMoney(row.deal_variant_id ? row.deal_variant_price : row.price);
    const dealPrice = toMoney(row.deal_price);
    // The product got cheaper than its deal — nothing to offer.
    if (!(dealPrice < regularPrice)) return;
    const variantOk = !row.deal_variant_id || Boolean(row.deal_variant_available);
    const item = {
      ...products[index],
      available: products[index].available && variantOk ? products[index].available : 0,
      dealItemId: row.deal_item_id,
      deal_item_id: row.deal_item_id,
      dealPrice,
      deal_price: dealPrice,
      regularPrice,
      regular_price: regularPrice,
      dealVariantId: row.deal_variant_id || null,
      deal_variant_id: row.deal_variant_id || null,
      dealVariantLabel: row.deal_variant_label || null,
      deal_variant_label: row.deal_variant_label || null,
    };
    const tiers = tiersByCoupon.get(row.coupon_id) || new Map();
    const tier = tiers.get(dealPrice) || [];
    tier.push(item);
    tiers.set(dealPrice, tier);
    tiersByCoupon.set(row.coupon_id, tiers);
  });

  for (const coupon of live) {
    const tiers = tiersByCoupon.get(coupon.id);
    if (!tiers || tiers.size === 0) continue;
    const minOrder = toMoney(coupon.min_order_amount);
    const maxItems = Math.max(1, Number(coupon.deal_max_items) || 1);
    result.set(coupon.id, {
      id: coupon.id,
      title: coupon.title,
      description: coupon.description || '',
      minOrder,
      min_order: minOrder,
      maxItems,
      max_items: maxItems,
      tiers: [...tiers.entries()]
        .sort(([a], [b]) => a - b)
        .map(([price, items]) => ({ price, items })),
    });
  }
  return result;
};

const mapCardRow = (row, deal) => ({
  id: row.id,
  sectionItemId: row.section_item_id,
  design: row.design,
  title: row.title,
  subtitle: row.subtitle || '',
  imageUrl: row.imageUrl || null,
  image_url: row.imageUrl || null,
  thumbUrl: row.thumbUrl || null,
  storeType: row.store_type,
  store_type: row.store_type,
  style: resolvedStyle(row.style_json),
  dealId: row.deal_coupon_id,
  deal_id: row.deal_coupon_id,
  deal,
});

/**
 * The cards of one Home 'offer_cards' section, ready for the app. A card
 * whose deal is off, expired or has nothing to sell is left out.
 */
const loadSectionOfferCards = async ({ sectionId, areaId, storeType, includeClosedShops = false, limit = null, offset = 0 }) => {
  const storeFilter = storeType && storeType !== 'all' ? "AND oc.store_type IN ('all', ?)" : '';
  const params = [sectionId, areaId, ...(storeType && storeType !== 'all' ? [storeType] : [])];
  const [rows] = await pool.query(
    `SELECT dsi.id AS section_item_id, oc.*
     FROM dashboard_section_items dsi
     JOIN offer_cards oc ON oc.id = dsi.item_id
     WHERE dsi.section_id = ? AND dsi.item_type = 'offer_card' AND dsi.active = 1 AND dsi.deleted_at IS NULL
       AND oc.active = 1 AND oc.deleted_at IS NULL AND oc.area_id = ?
       ${storeFilter}
       AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
       AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
       AND (oc.starts_at IS NULL OR oc.starts_at <= NOW())
       AND (oc.ends_at IS NULL OR oc.ends_at >= NOW())
     ORDER BY dsi.display_order ASC, dsi.id ASC`,
    params
  );
  if (rows.length === 0) return [];

  // Per-card rowsPerTab can differ; one catalog query at the largest of them.
  const perTier = Math.max(...rows.map((r) => resolvedStyle(r.style_json).rowsPerTab || DEFAULT_STYLE.rowsPerTab));
  const [catalog] = await Promise.all([
    loadDealCatalog({ areaId, couponIds: rows.map((r) => r.deal_coupon_id), perTier, includeClosedShops }),
    resolveImageUrls(rows),
  ]);

  const cards = rows
    .map((row) => {
      if (row.design === 'deal_tabs') {
        const deal = catalog.get(row.deal_coupon_id);
        if (!deal) return null;
        const rowsPerTab = resolvedStyle(row.style_json).rowsPerTab;
        const trimmed = { ...deal, tiers: deal.tiers.map((t) => ({ ...t, items: t.items.slice(0, rowsPerTab) })) };
        return mapCardRow(row, trimmed);
      }
      return null; // a design this API does not know yet
    })
    .filter(Boolean);
  return limit === null ? cards : cards.slice(offset, offset + limit);
};

// ─────────────────────────────────────────────────────────────────────────
// Public: GET /api/dashboard/deals/:couponId — the "View all" Deal page.
// ─────────────────────────────────────────────────────────────────────────

const getDealPage = async (req, res) => {
  const areaId = requestAreaId(req);
  const couponId = Number(req.params.couponId);
  if (areaId === null || areaId === 'all' || !Number.isInteger(couponId) || couponId <= 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'This offer is not available' });
  }
  const includeClosedShops = ['1', 'true'].includes(
    String(req.query.includeClosedShops ?? req.query.include_closed_shops ?? '').toLowerCase()
  );
  const cacheKey = `dashboard:${areaId}:deal:${couponId}:closed=${includeClosedShops ? 1 : 0}`;
  const cached = microCache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  const catalog = await loadDealCatalog({ areaId, couponIds: [couponId], includeClosedShops });
  const deal = catalog.get(couponId);
  if (!deal) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'This offer is not available' });
  }

  // The page borrows its look from the deal's card (the first live one).
  const [cardRows] = await pool.query(
    `SELECT * FROM offer_cards
     WHERE deal_coupon_id = ? AND area_id = ? AND active = 1 AND deleted_at IS NULL
     ORDER BY id ASC LIMIT 1`,
    [couponId, areaId]
  );
  await resolveImageUrls(cardRows);
  const card = cardRows[0] ? mapCardRow(cardRows[0], null) : null;

  const body = { data: { deal, card } };
  microCache.set(cacheKey, body, DEAL_PAGE_TTL_MS);
  res.status(200).json(body);
};

// ─────────────────────────────────────────────────────────────────────────
// Admin CRUD: /api/admin/offer-cards
// ─────────────────────────────────────────────────────────────────────────

const isInvalidDate = (value) => value && Number.isNaN(new Date(value).getTime());

/** Validates create/update input. Returns { values } (column -> value) or { error }. */
const readCardInput = async (body, areaId, { partial }) => {
  const values = {};

  if (!partial || body.design !== undefined) {
    const design = body.design === undefined ? 'deal_tabs' : body.design;
    if (!OFFER_CARD_DESIGNS.includes(design)) return { error: `design must be one of: ${OFFER_CARD_DESIGNS.join(', ')}` };
    values.design = design;
  }
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { error: 'Title is required' };
    if (title.length > 120) return { error: 'Title must be at most 120 characters' };
    values.title = title;
  }
  if (body.subtitle !== undefined) {
    if (body.subtitle !== null && typeof body.subtitle !== 'string') return { error: 'Subtitle must be text' };
    const subtitle = (body.subtitle || '').trim();
    if (subtitle.length > 255) return { error: 'Subtitle must be at most 255 characters' };
    values.subtitle = subtitle || null;
  }
  if (body.image_id !== undefined) {
    if (body.image_id !== null && body.image_id !== '' && !/^\d+$/.test(String(body.image_id))) {
      return { error: 'image_id must be an uploaded image id' };
    }
    values.image_id = body.image_id === '' || body.image_id === null ? null : String(body.image_id);
  }
  if (body.style !== undefined) {
    const { style, error } = sanitizeStyle(body.style);
    if (error) return { error };
    values.style_json = JSON.stringify(style);
  }
  if (!partial || body.store_type !== undefined) {
    const storeType = body.store_type === undefined || body.store_type === '' ? 'all' : body.store_type;
    if (storeType !== 'all' && !isSystemModeSlug(storeType)) {
      const activeSlugs = await getActiveStoreModeSlugs(areaId);
      if (!activeSlugs.includes(storeType)) return { error: 'Invalid store visibility' };
    }
    values.store_type = storeType;
  }
  if (body.deal_coupon_id !== undefined) {
    if (body.deal_coupon_id === null || body.deal_coupon_id === '') {
      values.deal_coupon_id = null;
    } else {
      const [rows] = await pool.query(
        "SELECT id FROM coupons WHERE id = ? AND area_id = ? AND discount_type = 'deal_price' AND deleted = 0",
        [Number(body.deal_coupon_id), areaId]
      );
      if (rows.length === 0) return { error: 'Pick a deal price offer from this area' };
      values.deal_coupon_id = rows[0].id;
    }
  }
  if (body.active !== undefined) {
    values.active = [true, 1, '1', 'true'].includes(body.active) ? 1 : 0;
  }
  for (const key of ['starts_at', 'ends_at']) {
    if (body[key] !== undefined) {
      if (isInvalidDate(body[key])) return { error: 'Schedule dates must be valid date/time values' };
      values[key] = body[key] || null;
    }
  }
  if (values.starts_at && values.ends_at && new Date(values.ends_at) < new Date(values.starts_at)) {
    return { error: 'End time must be after start time' };
  }
  return { values };
};

const mapAdminCard = (row) => ({
  ...row,
  style: resolvedStyle(row.style_json),
  style_json: undefined,
  imageUrl: row.imageUrl || null,
  image_url: row.imageUrl || null,
  dealTitle: row.deal_title || null,
  deal_title: row.deal_title || null,
});

const getAdminOfferCards = async (req, res) => {
  const areaId = requireOneArea(req, res);
  if (areaId === null) return;
  const { store_type } = req.query;
  const storeFilter = store_type && store_type !== 'all' ? "AND oc.store_type IN ('all', ?)" : '';
  const [rows] = await pool.query(
    `SELECT oc.*, c.title AS deal_title
     FROM offer_cards oc
     LEFT JOIN coupons c ON c.id = oc.deal_coupon_id AND c.area_id = oc.area_id AND c.deleted = 0
     WHERE oc.area_id = ? AND oc.deleted_at IS NULL ${storeFilter}
     ORDER BY oc.id DESC`,
    [areaId, ...(store_type && store_type !== 'all' ? [store_type] : [])]
  );
  await resolveImageUrls(rows);
  res.status(200).json({ data: rows.map(mapAdminCard) });
};

const getAdminOfferCardById = async (req, res) => {
  const areaId = requireOneArea(req, res);
  if (areaId === null) return;
  const [rows] = await pool.query(
    `SELECT oc.*, c.title AS deal_title
     FROM offer_cards oc
     LEFT JOIN coupons c ON c.id = oc.deal_coupon_id AND c.area_id = oc.area_id AND c.deleted = 0
     WHERE oc.id = ? AND oc.area_id = ? AND oc.deleted_at IS NULL`,
    [req.params.id, areaId]
  );
  if (rows.length === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer card not found' });
  await resolveImageUrls(rows);
  res.status(200).json({ data: mapAdminCard(rows[0]) });
};

const createOfferCard = async (req, res) => {
  const areaId = requireOneArea(req, res);
  if (areaId === null) return;
  const { values, error } = await readCardInput(req.body || {}, areaId, { partial: false });
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', message: error });
  if (values.design === 'deal_tabs' && !values.deal_coupon_id) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'A deal card needs a deal price offer' });
  }
  const columns = Object.keys(values);
  const [result] = await pool.query(
    `INSERT INTO offer_cards (area_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [areaId, ...Object.values(values)]
  );
  bustAreaCaches(areaId);
  res.status(201).json({ message: 'Offer card created', id: result.insertId });
};

const updateOfferCard = async (req, res) => {
  const areaId = requireOneArea(req, res);
  if (areaId === null) return;
  const [existing] = await pool.query(
    'SELECT id, design, deal_coupon_id FROM offer_cards WHERE id = ? AND area_id = ? AND deleted_at IS NULL',
    [req.params.id, areaId]
  );
  if (existing.length === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer card not found' });

  const { values, error } = await readCardInput(req.body || {}, areaId, { partial: true });
  if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', message: error });
  const finalDesign = values.design || existing[0].design;
  const finalDeal = values.deal_coupon_id !== undefined ? values.deal_coupon_id : existing[0].deal_coupon_id;
  if (finalDesign === 'deal_tabs' && !finalDeal) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'A deal card needs a deal price offer' });
  }
  const columns = Object.keys(values);
  if (columns.length === 0) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid fields provided' });

  await pool.query(
    `UPDATE offer_cards SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND area_id = ?`,
    [...Object.values(values), req.params.id, areaId]
  );
  bustAreaCaches(areaId);
  res.status(200).json({ message: 'Offer card updated' });
};

const deleteOfferCard = async (req, res) => {
  const areaId = requireOneArea(req, res);
  if (areaId === null) return;
  const [result] = await pool.query(
    'UPDATE offer_cards SET deleted_at = NOW(), active = 0 WHERE id = ? AND area_id = ? AND deleted_at IS NULL',
    [req.params.id, areaId]
  );
  if (result.affectedRows === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer card not found' });
  // Take it off every Home row too, so the section editor never lists a ghost.
  await pool.query(
    "UPDATE dashboard_section_items SET deleted_at = NOW() WHERE item_type = 'offer_card' AND item_id = ? AND area_id = ? AND deleted_at IS NULL",
    [req.params.id, areaId]
  );
  bustAreaCaches(areaId);
  res.status(200).json({ message: 'Offer card deleted' });
};

module.exports = {
  OFFER_CARD_DESIGNS,
  DEFAULT_STYLE,
  sanitizeStyle,
  loadDealCatalog,
  loadSectionOfferCards,
  getDealPage,
  getAdminOfferCards,
  getAdminOfferCardById,
  createOfferCard,
  updateOfferCard,
  deleteOfferCard,
};
