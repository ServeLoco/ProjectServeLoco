/**
 * The shop-owner Products list must stay virtualized.
 *
 * It used to render the entire catalog inside a single FlatList cell
 * (data={[{ key: 'sections' }]}), so every product row, variant row, SVG icon
 * and Animated toggle stayed mounted at once. On a real shop's catalog that is
 * thousands of live Android views, and the app was killed for memory while the
 * owner scrolled — it just closed, with no JS error to catch.
 *
 * These tests fail if anyone collapses the list back into one cell.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { FlatList } from 'react-native';
import ShopProductsScreen from '../src/screens/shop/ShopProductsScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
  useIsFocused: () => true,
}));

jest.mock('../src/api', () => ({
  shopApi: {
    getMyProducts: jest.fn(),
    getMyGroups: jest.fn(),
    toggleProduct: jest.fn(),
    toggleVariant: jest.fn(),
    updateGroup: jest.fn(),
    createGroup: jest.fn(),
    deleteGroup: jest.fn(),
    assignProductGroup: jest.fn(),
  },
  subscribeRealtime: () => () => {},
}));

jest.mock('../src/stores', () => ({
  useAuthStore: (sel) => sel({ logout: jest.fn() }),
}));

const { shopApi } = require('../src/api');

const GROUPS = [
  { id: 1, name: 'Snacks', active: true },
  { id: 2, name: 'Drinks', active: true },
];

// Big enough that a non-virtualized list would mount every row.
const PRODUCTS = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  shop_price: 10 + i,
  shopPrice: 10 + i,
  unit: '1 pc',
  available: true,
  group_id: i % 2 === 0 ? 1 : 2,
  groupId: i % 2 === 0 ? 1 : 2,
  variants: [],
}));

function texts(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('ShopProductsScreen list virtualization', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    shopApi.getMyProducts.mockResolvedValue({ products: PRODUCTS });
    shopApi.getMyGroups.mockResolvedValue({ groups: GROUPS });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  async function render() {
    await act(async () => {
      root = ReactTestRenderer.create(<ShopProductsScreen />);
    });
    return root.root.findByType(FlatList);
  }

  it('feeds the FlatList one entry per row, not one giant cell', async () => {
    const list = await render();
    // The old shape was exactly one item holding the whole catalog.
    expect(list.props.data.length).toBeGreaterThan(1);
    expect(list.props.data.every((row) => typeof row.key === 'string')).toBe(true);
  });

  it('caps how much it renders up front', async () => {
    const list = await render();
    expect(list.props.initialNumToRender).toBeLessThanOrEqual(20);
    expect(list.props.windowSize).toBeLessThanOrEqual(10);
  });

  it('shows only group headers while every group is collapsed', async () => {
    const list = await render();
    // Collapsed is the default: 2 headers, no product rows.
    expect(list.props.data).toHaveLength(2);
    expect(texts(root.root)).toEqual(expect.arrayContaining(['Snacks', 'Drinks']));
    expect(texts(root.root)).not.toContain('Product 1');
  });

  it('searching expands matches without mounting the whole catalog in one cell', async () => {
    const list = await render();
    const collapsedRows = list.props.data.length;
    const input = root.root.findAll((n) => n.type === 'TextInput')[0];
    await act(async () => { input.props.onChangeText('Product 1'); });

    const after = root.root.findByType(FlatList);
    // Headers + every matching product, each its own row.
    expect(after.props.data.length).toBeGreaterThan(collapsedRows);
    expect(after.props.data.filter((r) => r.type === 'product').length).toBeGreaterThan(0);
  });
});
