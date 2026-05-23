const { pool } = require('../db/mysql');

const getSettings = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
  let settings = rows[0];

  if (!settings) {
    // Return safe fallback
    settings = {
      shop_open: 1,
      minimum_order_amount: 50,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      support_phone: '',
      support_whatsapp: ''
    };
  }
  res.status(200).json({ data: settings });
};

const getActiveOffer = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM offers WHERE active = 1 AND (valid_until IS NULL OR valid_until > NOW()) ORDER BY id DESC LIMIT 1');
  
  if (rows.length === 0) {
    return res.status(200).json({ data: null });
  }

  res.status(200).json({ data: rows[0] });
};

module.exports = {
  getSettings,
  getActiveOffer
};
