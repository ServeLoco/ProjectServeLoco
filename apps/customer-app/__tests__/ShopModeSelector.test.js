import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ScrollView } from 'react-native';
import ShopModeSelector from '../src/screens/customer/HomeScreen/ShopModeSelector';
import RetryingImage from '../src/components/ProductImage/RetryingImage';
import PressableScale from '../src/components/PressableScale';

jest.mock('../src/utils/motionPreferences', () => ({ useReducedMotion: () => true }));
jest.mock('../src/components/AppIcon', () => () => null);
jest.mock('../src/components/ProductImage/RetryingImage', () => () => null);
jest.mock('../src/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return ({ children, scaleTo: _scaleTo, ...props }) => <Pressable {...props}>{children}</Pressable>;
});

const modes = [
  { slug: 'packed', label: 'Packed Items' },
  { slug: 'fast_food', label: 'Fast Food' },
  { slug: 'sweets', label: 'sweets' },
];

describe('Home shop-mode selector', () => {
  let tree;
  afterEach(async () => {
    if (tree) await act(async () => tree.unmount());
  });

  it('selects the requested store slug and reflects Home selection without reloading the active mode', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      tree = ReactTestRenderer.create(<ShopModeSelector modes={modes} selectedMode="packed" onSelect={onSelect} />);
    });
    const button = (label) => tree.root.findAllByType(PressableScale).find(node => node.props.accessibilityLabel === label);
    expect(button('Packed Items').props.accessibilityState.selected).toBe(true);
    await act(async () => button('Fast Food').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('fast_food');
    await act(async () => {
      tree.update(<ShopModeSelector modes={modes} selectedMode="fast_food" onSelect={onSelect} />);
    });
    expect(button('Fast Food').props.accessibilityState.selected).toBe(true);
    expect(button('Packed Items').props.accessibilityState.selected).toBe(false);
    await act(async () => button('Fast Food').props.onPress());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('accepts asynchronously added admin modes, their labels and uploaded icons', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      tree = ReactTestRenderer.create(<ShopModeSelector modes={modes.slice(0, 2)} selectedMode="packed" onSelect={onSelect} />);
    });
    const customModes = [
      ...modes,
      { slug: 'local', label: 'Local picks', icon_image_url: 'https://cdn.example.com/local.png' },
      { slug: 'fresh', label: 'Fresh produce', iconImageUrl: 'https://cdn.example.com/fresh.png' },
    ];
    await act(async () => {
      tree.update(<ShopModeSelector modes={customModes} selectedMode="packed" onSelect={onSelect} />);
    });
    expect(tree.root.findAllByType(PressableScale)).toHaveLength(5);
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);
    expect(tree.root.findAllByType(RetryingImage).map(node => node.props.uri)).toEqual([
      'https://cdn.example.com/local.png', 'https://cdn.example.com/fresh.png',
    ]);
    const custom = tree.root.findAllByType(PressableScale).find(node => node.props.accessibilityLabel === 'Local picks');
    await act(async () => custom.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('local');
  });
});
