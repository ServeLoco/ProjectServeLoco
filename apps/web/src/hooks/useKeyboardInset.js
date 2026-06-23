import { useEffect, useRef, useState } from 'react';

/**
 * Returns the height (in px) of the on-screen keyboard when one is open, or 0.
 *
 * Robust against:
 *   - `window.innerHeight` shrinking along with `visualViewport.height` (Android Chrome)
 *   - `vv.offsetTop` being non-zero / negative
 *   - URL bar collapse inflating `window.innerHeight` on iOS Safari browser mode
 *   - Stale initial values captured before the layout settles
 *
 * Strategy:
 *   - Track a *baseline* layout viewport height in a ref that only GROWS
 *     (never shrinks), so Android Chrome's layout viewport shrinking with
 *     the keyboard, or focus-induced re-layouts, can't corrupt the calc.
 *   - Use MIN/MAX thresholds to filter out URL-bar-only changes and absurd values.
 *   - Pre-compute on focusin so the popup moves before the keyboard finishes
 *     animating in.
 */
const MIN_KEYBOARD_HEIGHT = 120;
const MAX_KEYBOARD_HEIGHT = 500;

function getLayoutHeight() {
  if (typeof window === 'undefined') return 0;
  return Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0
  );
}

export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  const [editableFocused, setEditableFocused] = useState(false);
  const baselineRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Seed baseline from the current layout height (no keyboard assumed).
    baselineRef.current = getLayoutHeight();

    const recompute = () => {
      const layoutHeight = getLayoutHeight();
      // Grow the baseline — never let it shrink. This is the key to handling
      // Android Chrome's behaviour where `window.innerHeight` shrinks when the
      // keyboard opens.
      if (layoutHeight > baselineRef.current) {
        baselineRef.current = layoutHeight;
      }

      const vv = window.visualViewport;
      if (!vv) {
        setInset(0);
        return;
      }

      // The visual viewport's bottom edge, in layout coordinates.
      const visibleBottom = vv.height + Math.max(0, vv.offsetTop || 0);
      const raw = Math.max(0, baselineRef.current - visibleBottom);

      // Filter: ignore tiny diffs (URL bar) and absurd diffs (browser bug).
      const filtered =
        raw < MIN_KEYBOARD_HEIGHT || raw > MAX_KEYBOARD_HEIGHT ? 0 : raw;

      setInset((prev) => (prev === filtered ? prev : filtered));
    };

    const handleFocusIn = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = t.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      ) {
        setEditableFocused(true);
        // Compute immediately so the popup moves before vv resize fires.
        recompute();
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (!a) {
          setEditableFocused(false);
          return;
        }
        const tag = a.tagName;
        if (
          tag !== 'INPUT' &&
          tag !== 'TEXTAREA' &&
          tag !== 'SELECT' &&
          !a.isContentEditable
        ) {
          setEditableFocused(false);
        }
      }, 0);
    };

    recompute();
    window.visualViewport?.addEventListener('resize', recompute);
    window.visualViewport?.addEventListener('scroll', recompute);
    window.addEventListener('resize', recompute);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.visualViewport?.removeEventListener('resize', recompute);
      window.visualViewport?.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Only return a non-zero inset while an editable element is focused.
  // This guards against false positives (URL bar collapse, rotation, etc.)
  return editableFocused ? inset : 0;
}
