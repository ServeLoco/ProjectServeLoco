// Reusable validation helpers

const isString = (val) => typeof val === 'string' && val.trim().length > 0;
const isNumericAmount = (val) => {
  const num = Number(val);
  return !isNaN(num) && num >= 0;
};
const isBoolean = (val) => typeof val === 'boolean' || val === 'true' || val === 'false' || val === 1 || val === 0;
const isEnum = (val, allowedValues) => allowedValues.includes(val);
const isId = (val) => {
  const num = Number(val);
  return Number.isInteger(num) && num > 0;
};
const isPhone = (val) => typeof val === 'string' && /^\+?[0-9]{10,15}$/.test(val.replace(/[\s-]/g, ''));

const validateCoordinates = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return !isNaN(latitude) && latitude >= -90 && latitude <= 90 &&
         !isNaN(longitude) && longitude >= -180 && longitude <= 180;
};

const validatePagination = (page, limit) => {
  const p = Number(page) || 1;
  const l = Number(limit) || 20;
  return { page: p > 0 ? p : 1, limit: l > 0 && l <= 100 ? l : 20 };
};

// Normalizes field names (accepts both camelCase and snake_case)
const normalizeField = (req, camelKey, snakeKey) => {
  if (req.body && req.body[camelKey] !== undefined) return req.body[camelKey];
  if (req.body && req.body[snakeKey] !== undefined) return req.body[snakeKey];
  if (req.query && req.query[camelKey] !== undefined) return req.query[camelKey];
  if (req.query && req.query[snakeKey] !== undefined) return req.query[snakeKey];
  return undefined;
};

// Middleware wrapper for route-level validation
const validate = (schemaFn) => {
  return (req, res, next) => {
    const { errors, data } = schemaFn(req);
    if (errors && Object.keys(errors).length > 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors
      });
    }
    // Attach normalized data to req.validatedData
    if (data) {
      req.validatedData = data;
    }
    next();
  };
};

module.exports = {
  isString,
  isNumericAmount,
  isBoolean,
  isEnum,
  isId,
  isPhone,
  validateCoordinates,
  validatePagination,
  normalizeField,
  validate
};
