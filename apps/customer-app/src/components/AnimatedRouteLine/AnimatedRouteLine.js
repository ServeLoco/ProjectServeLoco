import React from 'react';
import { Mapbox } from '../../utils/mapbox';
import {
  ROUTE_STYLE,
  ROUTE_GRADIENT,
  useFlowingChevronPhase,
  useChevronLayer,
} from '../../utils/animatedRoute';

/**
 * Blue gradient track + a flowing trail of directional chevrons ("this way"),
 * shared by RiderLiveMap (customer) and RiderDeliveryMap (rider). Owns the
 * animation hooks itself so their ~180ms setState loop only re-renders this
 * small subtree — hoisting them into the parent map component would
 * re-render the entire map (all markers, camera, overlays) on every frame.
 */
export default function AnimatedRouteLine({ routeGeoJson, active, idPrefix }) {
  const coords = routeGeoJson?.geometry?.coordinates;
  const chevronPhase = useFlowingChevronPhase(active && Boolean(routeGeoJson));
  const { hasChevrons, featureCollection: chevronFeatures, opacityExpression: chevronOpacity } =
    useChevronLayer(coords, chevronPhase);

  if (!routeGeoJson) return null;

  return (
    <>
      <Mapbox.ShapeSource id={`${idPrefix}-route`} shape={routeGeoJson}>
        {/* Soft blue outer shadow */}
        <Mapbox.LineLayer
          id={`${idPrefix}-route-shadow`}
          style={{
            lineColor: ROUTE_STYLE.shadow,
            lineWidth: ROUTE_STYLE.shadowWidth,
            lineCap: 'round',
            lineJoin: 'round',
            lineOpacity: ROUTE_STYLE.shadowOpacity,
            lineBlur: 1.2,
          }}
        />
        {/* Mid blue glow on outer border */}
        <Mapbox.LineLayer
          id={`${idPrefix}-route-glow`}
          style={{
            lineColor: ROUTE_STYLE.glow,
            lineWidth: ROUTE_STYLE.glowWidth,
            lineCap: 'round',
            lineJoin: 'round',
            lineOpacity: ROUTE_STYLE.glowOpacity,
            lineBlur: 0.6,
          }}
        />
      </Mapbox.ShapeSource>

      {/* Electric cyan → blue → violet gradient track, on its own
          lineMetrics ShapeSource — mixing it into the source above would
          also rescale that source's dasharray-driven lightning layer below. */}
      <Mapbox.ShapeSource id={`${idPrefix}-route-gradient-src`} shape={routeGeoJson} lineMetrics>
        <Mapbox.LineLayer
          id={`${idPrefix}-route-track`}
          style={{
            lineGradient: ROUTE_GRADIENT,
            lineWidth: ROUTE_STYLE.trackWidth,
            lineCap: 'round',
            lineJoin: 'round',
            lineOpacity: ROUTE_STYLE.trackOpacity,
          }}
        />
      </Mapbox.ShapeSource>

      <Mapbox.ShapeSource id={`${idPrefix}-route-detail`} shape={routeGeoJson}>
        {/* Continuous white inner border */}
        <Mapbox.LineLayer
          id={`${idPrefix}-route-white-border`}
          style={{
            lineColor: ROUTE_STYLE.whiteBorder,
            lineWidth: ROUTE_STYLE.whiteBorderWidth,
            lineCap: 'round',
            lineJoin: 'round',
            lineOpacity: ROUTE_STYLE.whiteBorderOpacity,
          }}
        />
      </Mapbox.ShapeSource>

      {/* Directional chevrons ("this way"), pre-sampled along the route at a
          fixed spacing — a wave of them lights up and advances toward the
          destination every ~180ms via chevronOpacity, no per-frame geometry
          recompute. */}
      {hasChevrons ? (
        <Mapbox.ShapeSource id={`${idPrefix}-chevrons`} shape={chevronFeatures}>
          <Mapbox.SymbolLayer
            id={`${idPrefix}-chevron-symbols`}
            style={{
              textField: '›',
              textSize: 11,
              textColor: '#FFFFFF',
              textHaloColor: '#0B3FA0',
              textHaloWidth: 1,
              // The '›' glyph's default reading orientation points east
              // (bearing 90°), so a 0° text-rotate needs a -90° correction
              // to actually point along the stored compass bearing.
              textRotate: ['-', ['get', 'bearing'], 90],
              textRotationAlignment: 'map',
              textPitchAlignment: 'map',
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textOpacity: chevronOpacity,
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}
    </>
  );
}
