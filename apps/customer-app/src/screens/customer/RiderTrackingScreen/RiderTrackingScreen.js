import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  AppHeader,
} from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import {
  ordersApi,
  subscribeOrderEvents,
  subscribeRiderLocation,
} from '../../../api';
import { normalizeOrder } from '../../../utils';
import {
  Mapbox,
  DEFAULT_MAP_CENTER,
  mapboxAvailable,
} from '../../../utils/mapbox';

const OFF_ROUTE_METERS = 150;
// Min gap between Directions attempts — keeps a failing API from being re-hit
// on every location ping (cost budget: ~1-3 calls per delivery).
const DIRECTIONS_RETRY_COOLDOWN_MS = 30_000;

/** Haversine distance in meters. */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function minDistanceToRouteMeters(lat, lng, routeCoords) {
  if (!routeCoords?.length) return Infinity;
  let min = Infinity;
  for (let i = 0; i < routeCoords.length; i += 1) {
    const [rlng, rlat] = routeCoords[i];
    const d = distanceMeters(lat, lng, rlat, rlng);
    if (d < min) min = d;
  }
  return min;
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Live rider tracking map — destination + rider markers, road route line,
 * socket location updates, off-route re-fetch (>150 m).
 */
export default function RiderTrackingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const orderId = route.params?.orderId;

  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const routeCoordsRef = useRef([]);
  const directionsInFlightRef = useRef(false);
  const directionsLastAttemptRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [riderCoord, setRiderCoord] = useState(null); // { latitude, longitude }
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [terminalStatus, setTerminalStatus] = useState(null); // Delivered | Cancelled

  const destination = useMemo(() => {
    if (!order) return null;
    const lat = numOrNull(order.latitude ?? order.lat);
    const lng = numOrNull(order.longitude ?? order.lng);
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  const fetchDirections = useCallback(async (from, to) => {
    if (!from || !to || !mapboxAvailable) return;
    const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (!token) return;
    if (directionsInFlightRef.current) return;
    const now = Date.now();
    if (now - directionsLastAttemptRef.current < DIRECTIONS_RETRY_COOLDOWN_MS) return;
    directionsLastAttemptRef.current = now;
    directionsInFlightRef.current = true;
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
        `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
        `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      routeCoordsRef.current = coords;
      setRouteGeoJson({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });
    } catch (_) {
      // Network / Directions failure — keep last line if any.
    } finally {
      directionsInFlightRef.current = false;
    }
  }, []);

  const fitCamera = useCallback((rider, dest) => {
    if (!cameraRef.current) return;
    try {
      if (rider && dest) {
        const ne = [
          Math.max(rider.longitude, dest.longitude),
          Math.max(rider.latitude, dest.latitude),
        ];
        const sw = [
          Math.min(rider.longitude, dest.longitude),
          Math.min(rider.latitude, dest.latitude),
        ];
        cameraRef.current.fitBounds(ne, sw, [80, 60, 120, 60], 400);
      } else if (dest) {
        cameraRef.current.setCamera({
          centerCoordinate: [dest.longitude, dest.latitude],
          zoomLevel: 14,
          animationDuration: 300,
        });
      } else if (rider) {
        cameraRef.current.setCamera({
          centerCoordinate: [rider.longitude, rider.latitude],
          zoomLevel: 14,
          animationDuration: 300,
        });
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setError('Missing order');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    ordersApi
      .getOrder(orderId)
      .then((response) => {
        if (!active) return;
        const o = normalizeOrder(response?.order || response?.data || response);
        setOrder(o);

        const status = o?.status;
        if (status === 'Delivered' || status === 'Cancelled') {
          setTerminalStatus(status);
        }

        const destLat = numOrNull(o.latitude ?? o.lat);
        const destLng = numOrNull(o.longitude ?? o.lng);
        const dest =
          destLat != null && destLng != null
            ? { latitude: destLat, longitude: destLng }
            : null;

        const rider = o.rider || {};
        const rLat = numOrNull(rider.lastLat ?? rider.last_lat);
        const rLng = numOrNull(rider.lastLng ?? rider.last_lng);
        const start =
          rLat != null && rLng != null
            ? { latitude: rLat, longitude: rLng }
            : null;

        if (start) setRiderCoord(start);

        // Initial fit + directions once we have at least destination.
        setTimeout(() => {
          fitCamera(start, dest);
          if (start && dest) fetchDirections(start, dest);
        }, 0);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Failed to load order');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, fetchDirections, fitCamera]);

  // Live rider location pings
  useEffect(() => {
    if (!orderId || terminalStatus) return undefined;

    const unsub = subscribeRiderLocation(({ payload }) => {
      const p = payload || {};
      const eventOrderId = String(p.orderId ?? p.order_id ?? '');
      if (!eventOrderId || eventOrderId !== String(orderId)) return;

      const lat = numOrNull(p.lat ?? p.latitude);
      const lng = numOrNull(p.lng ?? p.longitude);
      if (lat == null || lng == null) return;

      const next = { latitude: lat, longitude: lng };
      setRiderCoord(next);

      // Off-route re-fetch when >150 m from last Directions polyline.
      if (destination && routeCoordsRef.current.length > 0) {
        const drift = minDistanceToRouteMeters(lat, lng, routeCoordsRef.current);
        if (drift > OFF_ROUTE_METERS) {
          fetchDirections(next, destination);
        }
      } else if (destination && routeCoordsRef.current.length === 0) {
        fetchDirections(next, destination);
      }
    });

    return unsub;
  }, [orderId, terminalStatus, destination, fetchDirections]);

  // Order status terminal states
  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = subscribeOrderEvents(({ eventName, payload }) => {
      if (eventName !== 'order.status.updated' && eventName !== 'order.updated') return;
      const p = payload || {};
      const eventOrderId = String(p.orderId ?? p.order_id ?? p.id ?? '');
      if (!eventOrderId || eventOrderId !== String(orderId)) return;
      const status = p.status || p.orderStatus || p.order_status;
      if (status === 'Delivered' || status === 'Cancelled') {
        setTerminalStatus(status);
      }
    });
    return unsub;
  }, [orderId]);

  const waitingForRider = !riderCoord && !terminalStatus;
  const centerFallback = destination || DEFAULT_MAP_CENTER;

  return (
    <AppScreen edges={['top', 'left', 'right']}>
      <AppHeader title="Track rider" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading map…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {terminalStatus === 'Delivered' ? (
            <View style={[styles.chip, styles.chipSuccess]}>
              <Text style={styles.chipText}>Delivered</Text>
            </View>
          ) : null}
          {terminalStatus === 'Cancelled' ? (
            <View style={[styles.chip, styles.chipError]}>
              <Text style={styles.chipText}>Cancelled</Text>
            </View>
          ) : null}
          {waitingForRider ? (
            <View style={[styles.chip, styles.chipInfo]}>
              <Text style={styles.chipText}>Waiting for rider location…</Text>
            </View>
          ) : null}

          <View style={[styles.mapWrap, { marginBottom: Math.max(insets.bottom, spacing.md) }]}>
            {!mapboxAvailable ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>Map unavailable</Text>
                <Text style={styles.muted}>Mapbox token is not configured on this build.</Text>
              </View>
            ) : (
              <Mapbox.MapView
                ref={mapRef}
                style={styles.map}
                styleURL={Mapbox.StyleURL.Street}
                compassEnabled={false}
                scaleBarEnabled={false}
              >
                <Mapbox.Camera
                  ref={cameraRef}
                  defaultSettings={{
                    centerCoordinate: [
                      centerFallback.longitude,
                      centerFallback.latitude,
                    ],
                    zoomLevel: 13,
                  }}
                />

                {routeGeoJson ? (
                  <Mapbox.ShapeSource id="rider-route" shape={routeGeoJson}>
                    <Mapbox.LineLayer
                      id="rider-route-line"
                      style={{
                        lineColor: colors.primary,
                        lineWidth: 4,
                        lineCap: 'round',
                        lineJoin: 'round',
                      }}
                    />
                  </Mapbox.ShapeSource>
                ) : null}

                {destination ? (
                  <Mapbox.PointAnnotation
                    id="destination"
                    coordinate={[destination.longitude, destination.latitude]}
                  >
                    <View style={styles.destPin}>
                      <View style={styles.destPinDot} />
                    </View>
                  </Mapbox.PointAnnotation>
                ) : null}

                {riderCoord ? (
                  <Mapbox.PointAnnotation
                    id="rider"
                    coordinate={[riderCoord.longitude, riderCoord.latitude]}
                  >
                    <View style={styles.riderPin}>
                      <View style={styles.riderPinDot} />
                    </View>
                  </Mapbox.PointAnnotation>
                ) : null}
              </Mapbox.MapView>
            )}
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  mapWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
    marginTop: spacing.sm,
  },
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  muted: {
    ...(typography.caption || {}),
    color: colors.textSecondary,
  },
  errorText: {
    ...(typography.label || {}),
    color: colors.error,
    textAlign: 'center',
    fontWeight: '600',
  },
  chip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill || radius.md,
    marginTop: spacing.sm,
  },
  chipInfo: {
    backgroundColor: colors.infoLight || colors.primaryLight,
  },
  chipSuccess: {
    backgroundColor: colors.successLight,
  },
  chipError: {
    backgroundColor: colors.errorLight,
  },
  chipText: {
    ...(typography.caption || {}),
    color: colors.textPrimary,
    fontWeight: '700',
  },
  destPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  destPinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error || '#E11',
    borderWidth: 2,
    borderColor: '#fff',
  },
  riderPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderPinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
