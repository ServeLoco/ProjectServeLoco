const { pool } = require('../db/mysql');
const { calculateThresholdDeliveryCharge } = require('../utils/thresholdDelivery');
const { isId, isPositiveInteger, validateCoordinates } = require('../validators');
// Location-based distance pricing is removed, so we no longer import calculateDeliveryPricing
const { roundMoney, toMoney } = require('../utils/money');

const calculateCart = async (req, res) => {
  const { items, delivery_type: rawDeliveryType } = req.body;
  const deliveryTypeInput = rawDeliveryType === 'fast' ? 'fast' : 'standard';
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Items array is required' });
  }

  const [settingRows] = await pool.query(
    'SELECT shop_open, minimum_order_amount, delivery_charge, night_charge, night_charge_start, night_charge_end, below_threshold_delivery_charge, free_delivery_above_minimum_active, free_delivery_offer_active, fast_delivery_enabled, fast_delivery_charge, delivery_radius_km FROM settings LIMIT 1'
  );
  const settings = settingRows[0] || {
    shop_open: 1, minimum_order_amount: 0, delivery_charge: 0, night_charge: 0
  };

  // Validate all items first before touching the DB
  const normalizedItems = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const productId = item.product_id || item.productId;
    const isCombo = item.type === 'combo' || item.isCombo || item.is_combo;

    if (!isId(productId)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Item ${index + 1}: valid product_id is required` });
    }
    if (!isPositiveInteger(item.quantity)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Item ${index + 1}: quantity must be a whole number between 1 and 999` });
    }
    normalizedItems.push({ productId: Number(productId), quantity: Number(item.quantity), isCombo });
  }

  // Batch fetch products and combos in 2 queries instead of N queries
  const productIds = normalizedItems.filter(i => !i.isCombo).map(i => i.productId);
  const comboIds = normalizedItems.filter(i => i.isCombo).map(i => i.productId);

  const productMap = {};
  if (productIds.length > 0) {
    const [prodRows] = await pool.query(
      'SELECT id, name, price FROM products WHERE id IN (?) AND available = 1 AND deleted = 0',
      [productIds]
    );
    prodRows.forEach(p => { productMap[p.id] = p; });
  }

  const comboMap = {};
  if (comboIds.length > 0) {
    const [comboRows] = await pool.query(
      'SELECT id, name, price FROM combos WHERE id IN (?) AND available = 1 AND deleted = 0',
      [comboIds]
    );
    comboRows.forEach(c => { comboMap[c.id] = c; });
  }

  let subtotal = 0;
  const processedItems = [];

  for (let index = 0; index < normalizedItems.length; index++) {
    const { productId, quantity, isCombo } = normalizedItems[index];
    const product = isCombo ? comboMap[productId] : productMap[productId];

    if (!product) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Item ${index + 1}: ${isCombo ? 'combo' : 'product'} is unavailable or does not exist`
      });
    }

    const unitPrice = toMoney(product.price);
    const lineTotal = roundMoney(unitPrice * quantity);
    subtotal += lineTotal;
    processedItems.push({ id: product.id, name: product.name, quantity, unitPrice, lineTotal, type: isCombo ? 'combo' : 'product' });
  }

  const { latitude, longitude, lat, lng } = req.body;
  const customerLat = latitude !== undefined ? latitude : lat;
  const customerLng = longitude !== undefined ? longitude : lng;

  if (customerLat !== undefined && customerLng !== undefined &&
      customerLat !== null && customerLng !== null &&
      customerLat !== '' && customerLng !== '') {
    if (!validateCoordinates(customerLat, customerLng)) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid GPS coordinates provided'
      });
    }
  }

  let deliveryCharge = 0;
  let deliveryDistanceKm = null;
  let deliveryWithinRange = true;
  let requiresLocation = false;
  let freeDeliveryOfferActive = false;
  let freeAboveThresholdActive = true;
  let belowThreshold = false;
  let belowThresholdDeliveryCharge = 0;
  let deliveryMessage = '';
  const minimumOrder = Number(settings.minimum_order_amount) || 0;

  const thresholdDelivery = calculateThresholdDeliveryCharge({ subtotal, settings });
  deliveryCharge = thresholdDelivery.charge;
  freeDeliveryOfferActive = thresholdDelivery.freeDeliveryOfferActive;
  freeAboveThresholdActive = thresholdDelivery.freeAboveThresholdActive;
  belowThreshold = thresholdDelivery.belowThreshold;
  belowThresholdDeliveryCharge = thresholdDelivery.belowThresholdCharge || 0;

  // Fast delivery: replaces standard delivery_charge only when above threshold
  // Night charge, below-threshold charge, and free delivery offer are untouched
  const fastDeliveryEnabled = Boolean(settings.fast_delivery_enabled);
  const fastDeliveryCharge = toMoney(settings.fast_delivery_charge || 0);
  const isFast = deliveryTypeInput === 'fast' && fastDeliveryEnabled && !freeDeliveryOfferActive && !belowThreshold;
  if (isFast) {
    deliveryCharge = fastDeliveryCharge;
  }

  if (customerLat === undefined || customerLat === null || customerLat === '' ||
      customerLng === undefined || customerLng === null || customerLng === '') {
    requiresLocation = true;
    deliveryMessage = 'Customer GPS location is required.';
  } else {
    // Distance-based pricing is removed. Always use threshold/fixed delivery logic.
    // Note: Coordinates are deliberately ignored for pricing calculation.
    
    deliveryDistanceKm = null;
    deliveryWithinRange = true; // Always true now
    requiresLocation = false;
    deliveryMessage = thresholdDelivery.message;
  }

  let nightCharge = 0;
  if (settings.night_charge && parseFloat(settings.night_charge) > 0 &&
      settings.night_charge_start && settings.night_charge_end) {
    // Parse time to minutes since midnight for reliable comparison
    const toMinutes = (t) => {
      const str = typeof t === 'string' ? t : String(t);
      const parts = str.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };
    const now = new Date();
    const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const nowMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();
    const startMin = toMinutes(settings.night_charge_start);
    const endMin = toMinutes(settings.night_charge_end);
    // Overnight window (e.g. 21:00 to 07:00): start > end
    const isNight = startMin > endMin
      ? (nowMinutes >= startMin || nowMinutes <= endMin)
      : (nowMinutes >= startMin && nowMinutes <= endMin);
    if (isNight) nightCharge = toMoney(settings.night_charge);
  }

  let discount = 0; // if offers apply, could be calculated here

  subtotal = roundMoney(subtotal);
  deliveryCharge = roundMoney(deliveryCharge);
  nightCharge = roundMoney(nightCharge);
  discount = roundMoney(discount);
  const grandTotal = roundMoney(subtotal + deliveryCharge + nightCharge - discount);

  const calculation = {
    subtotal,
    deliveryCharge,
    nightCharge,
    discount,
    grandTotal,
    total: grandTotal,
    minimumOrder,
    items: processedItems,
    isValid: deliveryWithinRange,
    valid: deliveryWithinRange,
    message: !deliveryWithinRange ? deliveryMessage : '',

    // Location delivery details
    deliveryDistanceKm: deliveryDistanceKm !== null ? Number(deliveryDistanceKm.toFixed(4)) : null,
    deliveryRadiusKm: Number(settings.delivery_radius_km) || 8.00,
    deliveryWithinRange,
    requiresLocation,
    freeDeliveryOfferActive,
    freeAboveThresholdActive,
    belowThreshold,
    belowThresholdDeliveryCharge,
    deliveryMessage,

    // Fast delivery
    deliveryType: isFast ? 'fast' : 'standard',
    fastDeliveryEnabled,
    fastDeliveryCharge,
  };

  res.status(200).json({
    ...calculation,
    data: calculation
  });
};

module.exports = {
  calculateCart
};
