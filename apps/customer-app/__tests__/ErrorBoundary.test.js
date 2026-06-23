import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import ErrorBoundary from '../src/components/ErrorBoundary/ErrorBoundary';

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('boom');
  return null;
}

describe('ErrorBoundary', () => {
  // Silence React's "component threw" log noise during these tests.
  let errorSpy;
  beforeAll(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterAll(() => { errorSpy.mockRestore(); });

  it('renders children when no error is thrown', () => {
    const tree = TestRenderer.create(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the fallback UI when a child throws', () => {
    let tree;
    // Suppress expected error log
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      act(() => {
        tree = TestRenderer.create(
          <ErrorBoundary>
            <Bomb shouldThrow />
          </ErrorBoundary>
        );
      });
    } finally {
      consoleSpy.mockRestore();
    }
    const str = JSON.stringify(tree.toJSON());
    expect(str).toMatch(/Something went wrong/i);
  });

  it('shows the error message in dev mode', () => {
    const prevDev = global.__DEV__;
    global.__DEV__ = true;
    let tree;
    try {
      act(() => {
        tree = TestRenderer.create(
          <ErrorBoundary>
            <Bomb shouldThrow />
          </ErrorBoundary>
        );
      });
      const str = JSON.stringify(tree.toJSON());
      expect(str).toMatch(/boom/);
    } finally {
      global.__DEV__ = prevDev;
    }
  });

  it('hides the error message in production', () => {
    const prevDev = global.__DEV__;
    global.__DEV__ = false;
    let tree;
    try {
      act(() => {
        tree = TestRenderer.create(
          <ErrorBoundary>
            <Bomb shouldThrow />
          </ErrorBoundary>
        );
      });
      const str = JSON.stringify(tree.toJSON());
      expect(str).not.toMatch(/Dev info/);
    } finally {
      global.__DEV__ = prevDev;
    }
  });

  it('recovers when reset is called', () => {
    let shouldThrow = true;
    function ToggleBomb() {
      if (shouldThrow) throw new Error('boom');
      return null;
    }
    let tree;
    act(() => {
      tree = TestRenderer.create(
        <ErrorBoundary>
          <ToggleBomb />
        </ErrorBoundary>
      );
    });
    expect(JSON.stringify(tree.toJSON())).toMatch(/Something went wrong/i);

    // Trigger reset
    shouldThrow = false;
    const instance = tree.root.findByType(ErrorBoundary).instance;
    act(() => { instance.reset(); });
    // Force re-render so the child mounts without throwing
    act(() => {
      tree.update(
        <ErrorBoundary>
          <ToggleBomb />
        </ErrorBoundary>
      );
    });
    // After reset + re-render with shouldThrow=false, the fallback should
    // be gone and the child should render.
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/Something went wrong/i);
  });
});
