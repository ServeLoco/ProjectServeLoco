import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import { HomeSection } from '../src/screens/customer/HomeScreen/HomeScreen';
import { CategoryCard, ProductCard } from '../src/components';
import { normalizeCategory } from '../src/utils';

// Test the real section renderer without starting location/network services.
jest.mock('../src/components', () => ({
  CategoryCard: jest.fn(() => null),
  ProductCard: jest.fn(() => null),
  LoadingSkeleton: () => null,
}));
jest.mock('../src/components/ProductImage/RetryingImage', () => () => null);
jest.mock('../src/components/BlurView', () => () => null);
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/stores', () => ({
  useCartStore: (selector) => selector({ items: [] }),
}));
jest.mock('../src/hooks', () => ({}));
jest.mock('../src/api', () => ({}));
jest.mock('../src/api/realtimeClient', () => ({}));
jest.mock('../src/utils/nativeGlass', () => null);
jest.mock('../src/screens/customer/HomeScreen/HomeIcon', () => () => null);
jest.mock('../src/screens/customer/HomeScreen/ShopModeSelector', () => () => null);
jest.mock('../src/components/OfferCards/offerCardDesigns', () => ({}));
jest.mock('../src/utils', () => ({
  normalizeCategory: jest.fn((item) => item),
  normalizeProduct: (item) => item,
}));

function context(overrides = {}) {
  return {
    windowWidth: 390,
    contentWidth: 370,
    categoryCardWidth: 81,
    categoryGap: 12,
    staggerCatAnims: [],
    staggerComboAnims: [],
    currentApiStoreType: 'fast_food',
    hotBadgePulse: new Animated.Value(1),
    navigation: { navigate: jest.fn() },
    handleCategoryPress: jest.fn(),
    handleAddToCart: jest.fn(),
    handleIncrement: jest.fn(),
    handleDecrement: jest.fn(),
    ...overrides,
  };
}
const categorySection = (id) => ({
  id, sectionType: 'category_grid', title: `Categories ${id}`,
  items: [{ id: `${id}-1`, name: `Category ${id}` }],
});

function Sections({ sections, renderContext, revealed = true }) {
  return sections.map(section => (
    <HomeSection key={section.id} section={section} rowsAboveRevealed={revealed} renderContext={renderContext} />
  ));
}

describe('Home vertical scrolling keeps existing rails stable', () => {
  let tree;
  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => {
    if (tree) await act(async () => tree.unmount());
  });

  it('only builds the new rail when scrolling reveals another section', async () => {
    const first = categorySection(1);
    const second = categorySection(2);
    const renderContext = context();
    await act(async () => {
      tree = ReactTestRenderer.create(<Sections sections={[first]} renderContext={renderContext} />);
    });
    const originalRail = tree.root.findByType(Animated.FlatList);
    const originalData = originalRail.props.data;
    expect(normalizeCategory).toHaveBeenCalledTimes(1);
    expect(CategoryCard).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<Sections sections={[first, second]} renderContext={renderContext} />);
    });
    expect(normalizeCategory).toHaveBeenCalledTimes(2);
    expect(CategoryCard).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(Animated.FlatList)[0]).toBe(originalRail);
    expect(originalRail.props.data).toBe(originalData);

    // Unrelated Home updates (e.g. another automatic row finishing) also
    // preserve the existing lists and their native scroll positions.
    await act(async () => {
      tree.update(<Sections sections={[first, second]} renderContext={renderContext} />);
    });
    expect(normalizeCategory).toHaveBeenCalledTimes(2);
    expect(CategoryCard).toHaveBeenCalledTimes(2);
  });

  it('still applies live product changes and available-first ordering', async () => {
    const available = { id: 1, name: 'First', price: 20, available: true };
    const other = { id: 2, name: 'Second', price: 30, available: true };
    const section = { id: 3, sectionType: 'product_block', title: 'Products', items: [available, other] };
    const renderContext = context();
    await act(async () => {
      tree = ReactTestRenderer.create(<Sections sections={[section]} renderContext={renderContext} />);
    });
    const patched = { ...section, items: [{ ...available, price: 25, available: false }, other] };
    await act(async () => {
      tree.update(<Sections sections={[patched]} renderContext={renderContext} />);
    });
    expect(tree.root.findByType(Animated.FlatList).props.data.map(item => item.id)).toEqual([2, 1]);
    const firstProduct = tree.root.findAllByType(ProductCard).find(node => node.props.product.id === 1);
    expect(firstProduct.props.price).toBe(25);
    expect(firstProduct.props.disabled).toBe(true);
    await act(async () => tree.root.findAllByType(ProductCard)[0].props.onAdd());
    expect(renderContext.handleAddToCart).toHaveBeenCalledWith(other);
  });

  it('waits for earlier automatic rows, then reveals the waiting section', async () => {
    const sections = [categorySection(1)];
    const renderContext = context();
    await act(async () => {
      tree = ReactTestRenderer.create(<Sections sections={sections} renderContext={renderContext} revealed={false} />);
    });
    expect(tree.root.findAllByType(Animated.FlatList)).toHaveLength(0);
    await act(async () => {
      tree.update(<Sections sections={sections} renderContext={renderContext} />);
    });
    expect(tree.root.findAllByType(Animated.FlatList)).toHaveLength(1);
    expect(CategoryCard).toHaveBeenCalledTimes(1);
  });

  it('updates card layout and navigation when their inputs change', async () => {
    const sections = [categorySection(1)];
    const renderContext = context();
    await act(async () => {
      tree = ReactTestRenderer.create(<Sections sections={sections} renderContext={renderContext} />);
    });
    const onCategory = jest.fn();
    await act(async () => {
      tree.update(<Sections sections={sections} renderContext={{ ...renderContext, categoryCardWidth: 100, handleCategoryPress: onCategory }} />);
    });
    const card = tree.root.findByType(CategoryCard);
    expect(card.props.style.width).toBe(100);
    await act(async () => card.props.onPress());
    expect(onCategory).toHaveBeenCalledWith(sections[0].items[0]);
  });
});
