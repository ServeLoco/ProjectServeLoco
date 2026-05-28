const { validatePagination } = require('../src/validators');

describe('Pagination Validator', () => {
  it('handles valid page and limit', () => {
    expect(validatePagination(1, 20)).toEqual({ page: 1, limit: 20 });
    expect(validatePagination(2, 50)).toEqual({ page: 2, limit: 50 });
  });

  it('handles invalid page (defaults to 1)', () => {
    expect(validatePagination(0, 20)).toEqual({ page: 1, limit: 20 });
    expect(validatePagination(-5, 20)).toEqual({ page: 1, limit: 20 });
    expect(validatePagination('abc', 20)).toEqual({ page: 1, limit: 20 });
  });

  it('caps max limit at 100', () => {
    expect(validatePagination(1, 150)).toEqual({ page: 1, limit: 20 }); // Falls back to default if out of bounds
  });

  it('handles invalid limit (defaults to 20)', () => {
    expect(validatePagination(1, 0)).toEqual({ page: 1, limit: 20 });
    expect(validatePagination(1, -5)).toEqual({ page: 1, limit: 20 });
    expect(validatePagination(1, 'abc')).toEqual({ page: 1, limit: 20 });
  });
});
