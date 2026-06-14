const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
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
const realtimeRoutes = require('./routes/realtimeRoutes');

const app = express();

// Trust the first proxy hop (nginx, Cloudflare, App Runner, Lightsail) so
// req.ip reflects the real client IP, not the proxy's. Required for correct
// audit logs, geo-restriction, and per-IP rate limiting once deployed.
app.set('trust proxy', 1);

// Request logging — dev uses concise format, production uses combined for audit
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Compress all JSON/text responses. Browsers/Expo auto-decompress.
// Threshold 1KB skips tiny payloads (overhead > savings).
app.use(compression({ threshold: 1024 }));

// Middleware
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); // Allow image loading across origins

const allowedOrigins = config.CORS_ORIGIN ? config.CORS_ORIGIN.split(',') : [];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handling preflight OPTIONS requests for all routes

// Request body JSON parsing with safe size limits
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static file serving for images
app.use(config.STATIC_UPLOAD_PATH, (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'];
  if (!imageExts.includes(ext)) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Only image files are allowed' });
  }
  next();
}, express.static(path.join(__dirname, '../', config.UPLOAD_DIR)));

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
app.use('/api/realtime', realtimeRoutes);
app.use('/api/admin/images', imageRoutes); // alias for admin panel

// Local/mobile clients may be configured with either the server root or /api.
// Redirect legacy root paths to /api/...
const legacyPaths = [
  '/auth', '/admin', '/images', '/categories', '/products', 
  '/orders', '/cart', '/settings', '/offers', '/dashboard', 
  '/admin/images'
];
legacyPaths.forEach(legacyPath => {
  app.use(legacyPath, (req, res) => {
    res.redirect(308, `/api${req.originalUrl}`);
  });
});

// Public health endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const isHealthy = dbHealth.mysql === 'ok' && dbHealth.mongodb === 'ok';

  res.status(200).json({
    status: isHealthy ? 'ok' : 'error',
    databases: {
      mysql: dbHealth.mysql,
      mongodb: dbHealth.mongodb
    }
  });
});

// Not Found Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
