const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');

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

// Public health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
