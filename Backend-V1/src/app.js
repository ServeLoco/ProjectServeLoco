const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/env');
const db = require('./db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const imageRoutes = require('./routes/imageRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const offerRoutes = require('./routes/offerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Request logging — dev uses concise format, production uses combined for audit
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Middleware
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); // Allow image loading across origins

const allowedOrigins = config.CORS_ORIGIN ? config.CORS_ORIGIN.split(',') : [];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.options('*', cors()); // Handling preflight OPTIONS requests for all routes

// Request body JSON parsing with safe size limits
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static file serving for images
app.use(config.STATIC_UPLOAD_PATH, express.static(path.join(__dirname, '../', config.UPLOAD_DIR)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/images', imageRoutes); // alias for admin panel

// Local/mobile clients may be configured with either the server root or /api.
// Keep root aliases so an old Expo bundle does not fail with "route not found".
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/images', imageRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/cart', cartRoutes);
app.use('/settings', settingsRoutes);
app.use('/offers', offerRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin/images', imageRoutes);

// Public health endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const isHealthy = dbHealth.mysql === 'ok' && dbHealth.mongodb === 'ok';
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'error',
    databases: dbHealth
  });
});

// Not Found Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
