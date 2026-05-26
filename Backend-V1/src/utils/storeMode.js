/**
 * Normalizes store mode values from UI or API to the canonical database string.
 *
 * @param {string} value The incoming store mode value.
 * @param {Object} options Options for normalization.
 * @param {string} [options.fallback] A fallback mode if value is not provided (e.g. 'packed'). If false, throws error on missing.
 * @param {boolean} [options.allowAll] Whether 'all' is a valid mode (useful for legacy APIs before full cleanup).
 * @returns {string} The canonical store mode ('packed', 'fast_food', or 'all' if allowed).
 */
const normalizeStoreType = (value, options = {}) => {
  const { fallback = 'packed', allowAll = false } = options;

  if (!value) {
    if (fallback === false) {
      throw new Error('store_type is required');
    }
    return fallback;
  }

  const normalizedValue = value.toString().trim().toLowerCase();

  switch (normalizedValue) {
    case 'packed':
    case 'packed items':
    case 'packed_items':
      return 'packed';
    
    case 'fast_food':
    case 'fast food':
    case 'fastfood':
      return 'fast_food';

    case 'all':
      if (allowAll) {
        return 'all';
      }
      throw new Error('store_type "all" is not allowed in this context');

    default:
      throw new Error(\`Invalid store_type: \${value}\`);
  }
};

module.exports = {
  normalizeStoreType
};
