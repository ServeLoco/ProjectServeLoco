export const toCamelCase = (str) => {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  );
};

export const normalizeKeys = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(v => normalizeKeys(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      result[toCamelCase(key)] = normalizeKeys(obj[key]);
      return result;
    }, {});
  }
  return obj;
};
