const { validateComboItems } = require('../src/controllers/comboController');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn()
  }
}));

describe('Combo Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass for available products', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Burger', deleted: 0, available: 1, is_combo: 0, category_type: 'fast_food' }]]);
    const items = await validateComboItems([{ product_id: 1, quantity: 1 }], 'fast_food');
    expect(items).toHaveLength(1);
  });

  it('should reject unavailable products', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Burger', deleted: 0, available: 0, is_combo: 0, category_type: 'fast_food' }]]);
    await expect(validateComboItems([{ product_id: 1, quantity: 1 }], 'fast_food')).rejects.toThrow('currently unavailable');
  });

  it('should reject deleted products', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Burger', deleted: 1, available: 1, is_combo: 0, category_type: 'fast_food' }]]);
    await expect(validateComboItems([{ product_id: 1, quantity: 1 }], 'fast_food')).rejects.toThrow('does not exist or has been deleted');
  });

  it('should reject nested combos', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Mega Combo', deleted: 0, available: 1, is_combo: 1, category_type: 'fast_food' }]]);
    await expect(validateComboItems([{ product_id: 1, quantity: 1 }], 'fast_food')).rejects.toThrow('Combo cannot include another combo');
  });

  it('should reject cross-mode products', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Apple', deleted: 0, available: 1, is_combo: 0, category_type: 'packed' }]]);
    await expect(validateComboItems([{ product_id: 1, quantity: 1 }], 'fast_food')).rejects.toThrow('Cannot add Apple');
  });

  it('should reject duplicate products in the combo', async () => {
    // This is checked before querying the database, so no mock needed
    await expect(validateComboItems([{ product_id: 1, quantity: 1 }, { product_id: 1, quantity: 2 }], 'fast_food')).rejects.toThrow('already in the combo');
  });
});
