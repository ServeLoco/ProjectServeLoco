class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.code = options.code || 'API_ERROR';
    this.details = options.details || null;
    this.response = options.response || null;
    this.isNetworkError = Boolean(options.isNetworkError);
    this.isUnauthorized = this.status === 401 || this.status === 403;
    this.isValidationError = this.status === 400 || this.status === 422;
  }
}

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload.message || payload.error || fallback;
}

export { ApiError, getErrorMessage };
