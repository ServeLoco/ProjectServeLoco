import React from 'react';
import { Mapbox } from '../../utils/mapbox';
import { useFlowingDashOffset, ROUTE_STYLE } from '../../utils/animatedRoute';

/**
 * Blue track + flowing white "lightning" route line, shared by RiderLiveMap
 * (customer) and RiderDeliveryMap (rider). Owns useFlowingDashOffset itself
 * so its ~52ms setState loop only re-renders this small subtree — hoisting
 * that hook into the parent map component would re-render the entire map
 * (all markers, camera, overlays) on every animation frame.
 */
export default function AnimatedRouteLine({ routeGeoJson, active, idPrefix }) {
  const routeDashArray = useFlowingDashOffset(active && Boolean(routeGeoJson));

  if (!routeGeoJson) return null;

  return (
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
      {/* Solid blue track */}
      <Mapbox.LineLayer
        id={`${idPrefix}-route-track`}
        style={{
          lineColor: ROUTE_STYLE.track,
          lineWidth: ROUTE_STYLE.trackWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: ROUTE_STYLE.trackOpacity,
        }}
      />
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
      {/* Flowing white lightning on the border */}
      <Mapbox.LineLayer
        id={`${idPrefix}-route-lightning`}
        style={{
          lineColor: ROUTE_STYLE.lightning,
          lineWidth: ROUTE_STYLE.lightningWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: ROUTE_STYLE.lightningOpacity,
          lineDasharray: routeDashArray,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
