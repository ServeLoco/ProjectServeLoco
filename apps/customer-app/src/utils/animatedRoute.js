import { useEffect, useRef, useState } from 'react';

/**
 * Flowing white “lightning” dash frames for the inner route highlight.
 * Short bright streaks advance along a longer gap — reads as light racing
 * along the blue path (no static speckles).
 * Period ~5.5 for stable width across frames.
 */
const LIGHTNING_DASH_SEQUENCE = [
  [0.0, 3.8, 1.6, 0.0],
  [0.35, 3.8, 1.6, 0.0],
  [0.7, 3.8, 1.6, 0.0],
  [1.05, 3.8, 1.6, 0.0],
  [1.4, 3.8, 1.6, 0.0],
  [1.75, 3.8, 1.6, 0.0],
  [2.1, 3.8, 1.6, 0.0],
  [2.45, 3.8, 1.6, 0.0],
  [2.8, 3.8, 1.6, 0.0],
  [3.15, 3.8, 1.6, 0.0],
  [3.5, 3.8, 1.6, 0.0],
  [0.0, 0.0, 1.6, 3.8],
  [0.0, 0.35, 1.6, 3.45],
  [0.0, 0.7, 1.6, 3.1],
  [0.0, 1.05, 1.6, 2.75],
  [0.0, 1.4, 1.6, 2.4],
  [0.0, 1.75, 1.6, 2.05],
  [0.0, 2.1, 1.6, 1.7],
  [0.0, 2.45, 1.6, 1.35],
  [0.0, 2.8, 1.6, 1.0],
  [0.0, 3.15, 1.6, 0.65],
  [0.0, 3.5, 1.6, 0.3],
];

/** Blue track + white inner lightning styling (shared rider + customer maps). */
export const ROUTE_STYLE = {
  // Soft outer blue shadow (widest)
  shadow: '#1D4ED8',
  shadowWidth: 18,
  shadowOpacity: 0.22,
  // Mid blue glow just outside the track
  glow: '#2563EB',
  glowWidth: 12,
  glowOpacity: 0.38,
  track: '#2563EB',
  trackWidth: 6,
  trackOpacity: 0.92,
  // Continuous white inner border (static edge)
  whiteBorder: '#FFFFFF',
  whiteBorderWidth: 2.5,
  whiteBorderOpacity: 0.88,
  // Moving lightning on top of the white border
  lightning: '#FFFFFF',
  lightningWidth: 2.2,
  lightningOpacity: 1,
};

/**
 * Cycles dasharray for the white lightning layer along the route.
 */
export function useFlowingDashOffset(active, intervalMs = 52) {
  const [frame, setFrame] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      indexRef.current = 0;
      setFrame(0);
      return undefined;
    }
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % LIGHTNING_DASH_SEQUENCE.length;
      setFrame(indexRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return LIGHTNING_DASH_SEQUENCE[frame] || LIGHTNING_DASH_SEQUENCE[0];
}
