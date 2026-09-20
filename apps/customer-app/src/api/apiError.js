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

// A gateway error page is HTML, not a sentence. Showing one to a user is
// worse than saying nothing useful, so anything that looks like markup or runs
// long enough to be a document falls back to the friendly message.
const MAX_SERVER_MESSAGE_LENGTH = 200;

function isDisplayableMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_SERVER_MESSAGE_LENGTH) return false;
  if (trimmed.startsWith('<')) return false;
  if (/<\/?(html|body|head|title|h1|pre)\b/i.test(trimmed)) return false;
  return true;
}

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') {
    return isDisplayableMessage(payload) ? payload.trim() : fallback;
  }
  const message = payload.message || payload.error;
  if (typeof message !== 'string') return fallback;
  return isDisplayableMessage(message) ? message.trim() : fallback;
}

export { ApiError, getErrorMessage };
