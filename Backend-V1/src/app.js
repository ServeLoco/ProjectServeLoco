const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const db = require('./db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const imageRoutes = require('./routes/imageRoutes');

const app = express();

// Request logging for development
if (config.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// CORS middleware
app.use(cors({
  origin: config.CORS_ORIGIN
}));
app.options('*', cors()); // Handling preflight OPTIONS requests for all routes

// Request body JSON parsing with safe size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for images
app.use(config.STATIC_UPLOAD_PATH, express.static(path.join(__dirname, '../', config.UPLOAD_DIR)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/images', imageRoutes);

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
