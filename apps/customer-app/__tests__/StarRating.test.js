/**
 * StarRating — the 5 stars on each item of a Delivered order (Orders page).
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import StarRating from '../src/components/StarRating';

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<StarRating {...props} />);
  });
  return tree;
};

// The outermost node carrying each "Rate N out of 5" label and an onPress
// (Pressable is wrapped in memo/forwardRef, so findAllByType misses it).
const starButtons = (tree) => {
  const byLabel = new Map();
  tree.root.findAll((node) => (
    typeof node.props.accessibilityLabel === 'string'
    && node.props.accessibilityLabel.startsWith('Rate ')
    && typeof node.props.onPress === 'function'
  )).forEach((node) => {
    if (!byLabel.has(node.props.accessibilityLabel)) byLabel.set(node.props.accessibilityLabel, node);
  });
  return [...byLabel.values()];
};

describe('StarRating', () => {
  it('draws five stars, each labelled with its value', () => {
    const tree = render({ value: 0, onChange: jest.fn() });
    const stars = starButtons(tree);
    expect(stars).toHaveLength(5);
    expect(stars.map((s) => s.props.accessibilityLabel)).toEqual([
      'Rate 1 out of 5', 'Rate 2 out of 5', 'Rate 3 out of 5', 'Rate 4 out of 5', 'Rate 5 out of 5',
    ]);
  });

  it('tapping the 4th star rates 4', () => {
    const onChange = jest.fn();
    const tree = render({ value: null, onChange });
    act(() => {
      starButtons(tree)[3].props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('tapping the 5th star rates 5', () => {
    const onChange = jest.fn();
    const tree = render({ value: 2, onChange });
    act(() => {
      starButtons(tree)[4].props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('fills the stars up to the value', () => {
    const tree = render({ value: 3, onChange: jest.fn() });
    expect(starButtons(tree).map((s) => s.props.accessibilityState.selected))
      .toEqual([true, true, true, false, false]);
  });

  it('is read-only when disabled', () => {
    const tree = render({ value: 5, onChange: jest.fn(), disabled: true });
    expect(starButtons(tree).every((s) => s.props.disabled === true)).toBe(true);
    const row = tree.root.findAll((node) => node.props.accessibilityLabel === 'Rated 5 out of 5');
    expect(row.length).toBeGreaterThan(0);
  });
});
