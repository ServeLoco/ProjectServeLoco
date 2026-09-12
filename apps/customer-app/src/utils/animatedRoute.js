import { useEffect, useMemo, useState } from 'react';

/**
 * Blue track + white inner border styling (shared rider + customer maps).
 * Widths sized so the chevron glyphs (~11px text) sit inside the track
 * rather than poking out past its edges.
 */
export const ROUTE_STYLE = {
  // Soft outer blue shadow (widest)
  shadow: '#1D4ED8',
  shadowWidth: 18,
  shadowOpacity: 0.22,
  // Mid blue glow just outside the track
  glow: '#2563EB',
  glowWidth: 14,
  glowOpacity: 0.38,
  track: '#2563EB',
  trackWidth: 10,
  trackOpacity: 0.92,
  // Continuous white inner border (static edge)
  whiteBorder: '#FFFFFF',
  whiteBorderWidth: 3,
  whiteBorderOpacity: 0.88,
};

/**
 * Electric cyan → blue → violet gradient along the track's own length
 * (line-progress: 0 at the route's start, 1 at its end). Requires the
 * ShapeSource it's used on to set `lineMetrics`. Static (not frame-cycled) —
 * gradients are pricier to recompute per-frame than the chevron opacity
 * expression below, and the chevrons already carry the "in motion" read, so
 * this only needs to set the mood once.
 */
export const ROUTE_GRADIENT = [
  'interpolate',
  ['linear'],
  ['line-progress'],
  0, '#00E5FF',
  0.5, '#2979FF',
  1, '#7C4DFF',
];

/** How many chevrons apart the "lit" ones are — bigger = more spread out. */
export const CHEVRON_LIT_CYCLE = 4;

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial great-circle bearing from point 1 to point 2, in degrees from true north. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Walks a route's [lng, lat] coordinate list and drops a point (with the
 * bearing to travel next) every `spacingMeters` — the anchor points for the
 * directional chevron markers. Pure JS distance-walk (haversine), no turf
 * dependency, since the coordinate list is already in hand from the
 * Directions/Optimization response.
 */
export function sampleChevronPoints(coords, spacingMeters = 70) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const points = [];
  // Start half a spacing in so a chevron never sits right on the rider dot.
  let carry = spacingMeters * 0.5;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const segLen = haversineMeters(lat1, lng1, lat2, lng2);
    if (segLen <= 0) continue;
    const bearing = bearingDeg(lat1, lng1, lat2, lng2);
    let d = carry;
    while (d < segLen) {
      const t = d / segLen;
      points.push({
        longitude: lng1 + (lng2 - lng1) * t,
        latitude: lat1 + (lat2 - lat1) * t,
        bearing,
      });
      d += spacingMeters;
    }
    carry = d - segLen;
  }
  return points;
}

/**
 * Cycles an integer phase 0..(CHEVRON_LIT_CYCLE - 1) — combined with each
 * chevron's fixed `idx` in an `idx ≡ phase (mod CHEVRON_LIT_CYCLE)` style
 * expression, this reads as a wave of bright chevrons flowing along the
 * route toward the destination, without recomputing any geometry per frame.
 */
export function useFlowingChevronPhase(active, intervalMs = 180) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return undefined;
    }
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % CHEVRON_LIT_CYCLE);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return phase;
}

/** Builds the chevron marker FeatureCollection + its opacity expression for the given phase. */
export function useChevronLayer(coords, phase, spacingMeters = 70) {
  const points = useMemo(() => sampleChevronPoints(coords, spacingMeters), [coords, spacingMeters]);

  const featureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: points.map((p, idx) => ({
      type: 'Feature',
      properties: { idx, bearing: p.bearing },
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    })),
  }), [points]);

  // Lit when idx ≡ phase (mod CYCLE) — as phase counts up, the matching idx
  // counts up too, so the bright wave advances toward higher idx (the route's
  // end / the destination). +CHEVRON_LIT_CYCLE*1000 keeps the dividend
  // positive since Mapbox's `%`, like JS's, can return a negative result.
  const opacityExpression = useMemo(() => ([
    'case',
    ['==', ['%', ['+', ['-', ['get', 'idx'], phase], CHEVRON_LIT_CYCLE * 1000], CHEVRON_LIT_CYCLE], 0],
    1,
    0.3,
  ]), [phase]);

  return { hasChevrons: points.length > 0, featureCollection, opacityExpression };
}
