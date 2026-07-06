const config = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'SERVER_ERROR';

  // Convert MySQL duplicate key errors into readable validation errors
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'A record with this value already exists.';
    code = 'VALIDATION_ERROR';
  }

  // Handle centralized validation errors passed down
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  // Never leak internal error details on 5xx responses. The real error is
  // still captured in the server logs for debugging.
  if (statusCode >= 500) {
    console.error('[server-error]', req.method, req.originalUrl, err);
    message = 'Something went wrong. Please try again.';
    code = 'SERVER_ERROR';
  }

  // Safe user-visible message
  const response = {
    code,
    message
  };

  if (err.details) {
    response.details = err.details;
  }

  // Never leak stack traces in production
  if (process.env.DEBUG === 'true' && process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.originalUrl} not found`
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
