/**
 * useCachedFetch tests via a tiny probe component (no @testing-library/react-native).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { clearAll, setCached, getCached } from '../src/utils/apiCache';

function renderHook(cacheKey, fetcherFn, options) {
  const captured = { current: null };
  function Probe({ ck, opts }) {
    const { useCachedFetch } = require('../src/hooks/useCachedFetch');
    captured.current = useCachedFetch(ck, fetcherFn, opts);
    return null;
  }
  let testRenderer;
  act(() => {
    testRenderer = ReactTestRenderer.create(
      <Probe ck={cacheKey} opts={options} />,
    );
  });
  return {
    captured,
    rerender: (nextKey, nextOpts) => {
      act(() => {
        testRenderer.update(<Probe ck={nextKey} opts={nextOpts} />);
      });
    },
    unmount: () => {
      act(() => {
        testRenderer.unmount();
      });
    },
  };
}

describe('useCachedFetch', () => {
  beforeEach(() => {
    clearAll();
    jest.useRealTimers();
  });

  test('cache miss: isLoading then data', async () => {
    let resolve;
    const fetcher = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { captured } = renderHook('categories:a', fetcher);
    expect(captured.current.isLoading).toBe(true);
    expect(captured.current.data).toBeNull();

    await act(async () => {
      resolve([{ id: 1 }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(captured.current.isLoading).toBe(false);
    expect(captured.current.data).toEqual([{ id: 1 }]);
    expect(getCached('categories:a').data).toEqual([{ id: 1 }]);
  });

  test('cache hit: data immediately, isLoading false, still revalidates', async () => {
    setCached('categories:b', [{ id: 9 }]);
    let resolve;
    const fetcher = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { captured } = renderHook('categories:b', fetcher);
    expect(captured.current.isLoading).toBe(false);
    expect(captured.current.data).toEqual([{ id: 9 }]);

    await act(async () => {
      resolve([{ id: 10 }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.current.data).toEqual([{ id: 10 }]);
    expect(getCached('categories:b').data).toEqual([{ id: 10 }]);
  });

  test('background failure with cache keeps data and no error', async () => {
    setCached('categories:c', [{ id: 1 }]);
    const fetcher = jest.fn(() => Promise.reject(new Error('network')));
    const { captured } = renderHook('categories:c', fetcher);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.current.data).toEqual([{ id: 1 }]);
    expect(captured.current.error).toBeNull();
  });

  test('failure with no cache sets error', async () => {
    const err = new Error('boom');
    const fetcher = jest.fn(() => Promise.reject(err));
    const { captured } = renderHook('categories:d', fetcher);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.current.data).toBeNull();
    expect(captured.current.error).toBe(err);
    expect(captured.current.isLoading).toBe(false);
  });

  test('refresh sets isRefreshing and force-updates cache', async () => {
    setCached('categories:e', [{ id: 1 }]);
    let resolve;
    const fetcher = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { captured } = renderHook('categories:e', fetcher);

    // Let initial revalidate finish first
    await act(async () => {
      resolve([{ id: 1 }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    let resolve2;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve2 = r;
        }),
    );

    let refreshPromise;
    act(() => {
      refreshPromise = captured.current.refresh();
    });
    expect(captured.current.isRefreshing).toBe(true);

    await act(async () => {
      resolve2([{ id: 2 }]);
      await refreshPromise;
    });

    expect(captured.current.isRefreshing).toBe(false);
    expect(captured.current.data).toEqual([{ id: 2 }]);
  });

  test('stale response for old cacheKey does not overwrite newer key', async () => {
    let resolveA;
    let resolveB;
    const fetcherA = () =>
      new Promise((r) => {
        resolveA = r;
      });
    const fetcherB = () =>
      new Promise((r) => {
        resolveB = r;
      });

    // Use a mutable fetcher ref via wrapper
    let activeFetcher = fetcherA;
    const fetcher = jest.fn(() => activeFetcher());

    const { captured, rerender } = renderHook('key:a', fetcher);

    activeFetcher = fetcherB;
    rerender('key:b');

    await act(async () => {
      // Resolve old key late
      resolveA([{ old: true }]);
      await Promise.resolve();
      resolveB([{ new: true }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.current.data).toEqual([{ new: true }]);
    expect(getCached('key:b').data).toEqual([{ new: true }]);
    // Old key may or may not be cached depending on when it completed with matching id —
    // with request-id guard, resolveA is ignored and must NOT set key:b.
    expect(getCached('key:a')).toBeNull();
  });

  test('enabled=false does not fetch', async () => {
    const fetcher = jest.fn(() => Promise.resolve([1]));
    const { captured } = renderHook('key:off', fetcher, { enabled: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(captured.current.isLoading).toBe(false);
  });
});
