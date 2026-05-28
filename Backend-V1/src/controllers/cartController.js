const { pool } = require('../db/mysql');
const { calculateThresholdDeliveryCharge } = require('../utils/thresholdDelivery');
const { isId, isPositiveInteger, validateCoordinates } = require('../validators');
const { calculateDeliveryPricing } = require('../utils/deliveryPricing');
const { roundMoney, toMoney } = require('../utils/money');

const calculateCart = async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Items array is required' });
  }

  const [settingRows] = await pool.query('SELECT * FROM settings LIMIT 1');
  const settings = settingRows[0] || {
    shop_open: 1, minimum_order_amount: 0, delivery_charge: 0, free_delivery_above: null, night_charge: 0
  };

  let subtotal = 0;
  const processedItems = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const isCombo = item.type === 'combo' || item.isCombo || item.is_combo;
    const productId = item.product_id || item.productId;
    let prodRows;

    if (!isId(productId)) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Item ${index + 1}: valid product_id is required`
      });
    }

    if (!isPositiveInteger(item.quantity)) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Item ${index + 1}: quantity must be a whole number between 1 and 999`
      });
    }
    
    if (isCombo) {
      [prodRows] = await pool.query('SELECT * FROM combos WHERE id = ? AND available = 1 AND deleted = 0', [productId]);
    } else {
      [prodRows] = await pool.query('SELECT * FROM products WHERE id = ? AND available = 1 AND deleted = 0', [productId]);
    }

    if (prodRows.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Item ${index + 1}: ${isCombo ? 'combo' : 'product'} is unavailable or does not exist`
      });
    }

    const product = prodRows[0];
    const quantity = Number(item.quantity);
    const unitPrice = toMoney(product.price);
    const lineTotal = roundMoney(unitPrice * quantity);
    subtotal += lineTotal;
    processedItems.push({
      id: product.id,
      name: product.name,
      quantity,
      unitPrice,
      lineTotal,
      type: isCombo ? 'combo' : 'product'
    });
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
  let deliveryMessage = '';
  const minimumOrder = Number(settings.minimum_order_amount) || 0;

  if (customerLat === undefined || customerLat === null || customerLat === '' ||
      customerLng === undefined || customerLng === null || customerLng === '') {
    requiresLocation = true;
    const thresholdDelivery = calculateThresholdDeliveryCharge({ subtotal, settings });
    deliveryCharge = thresholdDelivery.charge;
    freeDeliveryOfferActive = thresholdDelivery.freeDeliveryOfferActive;
    freeAboveThresholdActive = thresholdDelivery.freeAboveThresholdActive;
    deliveryMessage = 'Customer GPS location is required.';
  } else {
    // If coordinates are present
    const pricing = calculateDeliveryPricing({ customerLat, customerLng, settings });
    deliveryDistanceKm = pricing.distance;
    deliveryWithinRange = pricing.allowed;
    freeDeliveryOfferActive = pricing.freeDeliveryOfferActive || false;
    deliveryMessage = pricing.message;
    requiresLocation = pricing.requiresLocation || false;

    if (pricing.allowed) {
      const thresholdDelivery = calculateThresholdDeliveryCharge({ 
        subtotal, 
        settings, 
        distanceCharge: pricing.charge 
      });
      deliveryCharge = thresholdDelivery.charge;
      freeDeliveryOfferActive = thresholdDelivery.freeDeliveryOfferActive;
      freeAboveThresholdActive = thresholdDelivery.freeAboveThresholdActive;
      deliveryMessage = thresholdDelivery.message;
    } else {
      deliveryCharge = 0;
    }
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
    deliveryMessage
  };

  res.status(200).json({
    ...calculation,
    data: calculation
  });
};

module.exports = {
  calculateCart
};
