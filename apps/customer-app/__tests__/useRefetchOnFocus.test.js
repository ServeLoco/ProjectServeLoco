/**
 * useRefetchOnFocus — every page reloads (quietly) each time it comes back
 * into view, except on its first focus and when refocused within a moment.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Capture the focus callback so each test can "focus" the screen by hand.
let mockFocus = null;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { mockFocus = cb; },
}));

const { useRefetchOnFocus } = require('../src/hooks/useRefetchOnFocus');

function mount(refetch, options) {
  function Probe({ opts }) {
    useRefetchOnFocus(refetch, opts);
    return null;
  }
  let renderer;
  act(() => { renderer = ReactTestRenderer.create(<Probe opts={options} />); });
  return (nextOptions) => act(() => renderer.update(<Probe opts={nextOptions} />));
}

describe('useRefetchOnFocus', () => {
  let now;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('skips the first focus (the screen just loaded) and reloads on every later one', () => {
    const refetch = jest.fn();
    mount(refetch);

    mockFocus(); // first focus = mount
    expect(refetch).not.toHaveBeenCalled();

    now += 10_000;
    mockFocus();
    now += 10_000;
    mockFocus();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('does not refire when the customer flicks straight back to the page', () => {
    const refetch = jest.fn();
    mount(refetch, { minIntervalMs: 5000 });
    mockFocus();

    now += 1000;
    mockFocus();
    expect(refetch).not.toHaveBeenCalled();

    now += 5000;
    mockFocus();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while disabled (e.g. no location yet)', () => {
    const refetch = jest.fn();
    const update = mount(refetch, { enabled: false });
    mockFocus();
    now += 10_000;
    mockFocus();
    expect(refetch).not.toHaveBeenCalled();

    update({ enabled: true });
    now += 10_000;
    mockFocus();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
