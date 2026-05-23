const { pool } = require('../db/mysql');

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

  for (const item of items) {
    const [prodRows] = await pool.query('SELECT * FROM products WHERE id = ? AND available = 1', [item.product_id || item.productId]);
    if (prodRows.length > 0) {
      const product = prodRows[0];
      const quantity = parseInt(item.quantity, 10) || 1;
      const unitPrice = parseFloat(product.price);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      processedItems.push({
        id: product.id,
        name: product.name,
        quantity,
        unitPrice,
        lineTotal
      });
    }
  }

  let deliveryCharge = parseFloat(settings.delivery_charge);
  if (settings.free_delivery_above !== null && subtotal >= parseFloat(settings.free_delivery_above)) {
    deliveryCharge = 0;
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
    if (isNight) nightCharge = parseFloat(settings.night_charge);
  }

  let discount = 0; // if offers apply, could be calculated here

  const grandTotal = subtotal + deliveryCharge + nightCharge - discount;
  const minimumOrder = parseFloat(settings.minimum_order_amount);

  res.status(200).json({
    data: {
      subtotal,
      deliveryCharge,
      nightCharge,
      discount,
      grandTotal,
      total: grandTotal, // aliased for frontend mapping
      minimumOrder,
      items: processedItems,
      isValid: subtotal >= minimumOrder,
      message: subtotal < minimumOrder ? `Minimum order is ₹${minimumOrder}` : ''
    }
  });
};

module.exports = {
  calculateCart
};
