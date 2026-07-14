import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import {
  ordersApi,
  subscribeOrderEvents,
  subscribeRiderLocation,
  subscribeRealtime,
  subscribeRealtimeLifecycle,
} from '../../api';
import { normalizeOrder } from '../../utils';
import AnimatedRouteLine from '../AnimatedRouteLine';
import {
  Mapbox,
  DEFAULT_MAP_CENTER,
  mapboxAvailable,
} from '../../utils/mapbox';

const OFF_ROUTE_METERS = 150;
// Min gap between Directions attempts — keeps a failing API from being re-hit
// on every location ping (cost budget: ~1-3 calls per delivery).
const DIRECTIONS_RETRY_COOLDOWN_MS = 30_000;

/** Distinct live-map pin colors */
const RIDER_COLOR = '#2563EB'; // blue — rider
const RIDER_GLOW = 'rgba(37, 99, 235, 0.35)';
const CUSTOMER_COLOR = '#FF7A3A'; // saffron — delivery pin / you
const CUSTOMER_DARK = '#E05A1A';
const SMOOTH_MOVE_MS = 900;
const raf = global.requestAnimationFrame?.bind(global) || ((cb) => setTimeout(cb, 16));
const caf = global.cancelAnimationFrame?.bind(global) || clearTimeout;

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
 * Smoothly interpolates map coordinates when the rider pings a new position
 * so the pin glides instead of jumping.
 */
function useSmoothCoordinate(target, durationMs = SMOOTH_MOVE_MS) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!target) {
      fromRef.current = null;
      setDisplay(null);
      return undefined;
    }

    const from = fromRef.current;
    if (
      !from ||
      (from.latitude === target.latitude && from.longitude === target.longitude)
    ) {
      fromRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const start = Date.now();
    const startLat = from.latitude;
    const startLng = from.longitude;
    const dLat = target.latitude - startLat;
    const dLng = target.longitude - startLng;

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      // ease-out cubic
      const ease = 1 - (1 - t) ** 3;
      setDisplay({
        latitude: startLat + dLat * ease,
        longitude: startLng + dLng * ease,
      });
      if (t < 1) {
        rafRef.current = raf(tick);
      } else {
        fromRef.current = target;
      }
    };

    if (rafRef.current) caf(rafRef.current);
    rafRef.current = raf(tick);

    return () => {
      if (rafRef.current) caf(rafRef.current);
    };
  }, [target?.latitude, target?.longitude, durationMs]);

  return display;
}

/** Customer / delivery destination pin (saffron) — label above the pin. */
function CustomerPin() {
  return (
    <View style={styles.pinRoot} pointerEvents="none">
      <View style={[styles.pinLabel, styles.customerLabel, styles.pinLabelAbove]}>
        <Text style={styles.pinLabelText}>Delivery</Text>
      </View>
      <View style={[styles.pinHead, styles.customerPinHead]}>
        <View style={styles.customerPinHole} />
      </View>
      <View style={[styles.pinTail, styles.customerPinTail]} />
      <View style={styles.customerPinShadow} />
    </View>
  );
}

/** Red LIVE pill with expanding rings (map top-left). */
function LiveStatusPill() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 2.4],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });
  const ring2Scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.9],
  });
  const ring2Opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const dotScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });

  return (
    <View style={styles.livePill} pointerEvents="none">
      <View style={styles.livePillDotStage}>
        <Animated.View
          style={[
            styles.livePillRing,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
        <Animated.View
          style={[
            styles.livePillRingInner,
            { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] },
          ]}
        />
        <Animated.View
          style={[styles.livePillDot, { transform: [{ scale: dotScale }] }]}
        />
      </View>
      <Text style={styles.livePillText}>LIVE</Text>
    </View>
  );
}

/** Shop / store marker — home only, soft pulse + bounce. */
function ShopMarker({ name }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    bounceLoop.start();
    return () => {
      pulseLoop.stop();
      bounceLoop.stop();
      pulse.setValue(0);
      bounce.setValue(0);
    };
  }, [pulse, bounce]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1.75],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });
  const emojiScale = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const emojiY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  return (
    <View style={styles.shopWrap} pointerEvents="none">
      <View style={styles.shopIconStage}>
        <Animated.View
          style={[
            styles.shopPulseRing,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
        <Animated.Text
          style={[
            styles.shopEmoji,
            { transform: [{ translateY: emojiY }, { scale: emojiScale }] },
          ]}
        >
          🏠
        </Animated.Text>
      </View>
      <Text style={styles.shopLabel} numberOfLines={1}>{name || 'Shop'}</Text>
    </View>
  );
}

/** Live rider vehicle marker (🛵) with dual pulse rings. */
function RiderPin({ pulse }) {
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1.85],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });
  const ring2Scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1.45],
  });
  const ring2Opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  return (
    <View style={styles.pinRoot} pointerEvents="none">
      <Animated.View
        style={[
          styles.riderPulseRing,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.riderPulseRingInner,
          { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] },
        ]}
      />
      <View style={styles.scootyBubble}>
        <Text style={styles.scootyEmoji}>🛵</Text>
      </View>
      <View style={[styles.pinLabel, styles.riderLabel]}>
        <View style={styles.liveDot} />
        <Text style={styles.pinLabelText}>Rider</Text>
      </View>
    </View>
  );
}

/**
 * Live tracking map — staged (no pull-to-refresh needed):
 *   Pending              → customer pin only
 *   Accepted / Preparing → shops + customer (route hidden)
 *   Rider assigned       → + rider pin (updates ~every 150 m)
 *   Out for Delivery     → driving route rider → customer + live rider
 *
 * Props:
 *   orderId      - order to track (required)
 *   style        - style for the outer map container (controls height)
 *   showLegend   - show the rider/you color legend overlay (default true)
 *   immersive    - full-bleed map under a parent bottom sheet (checkout-style)
 *   sheetReserve - bottom px reserved for parent sheet (camera + chips)
 *   initialOrder - order payload the parent screen already fetched; seeds the
 *                  map instantly (no spinner, no duplicate GET). Live poll +
 *                  socket updates keep it fresh exactly as before.
 */
export default function RiderLiveMap({
  orderId,
  style,
  showLegend = true,
  fetchOrder = null,
  immersive = false,
  sheetReserve = 0,
  initialOrder = null,
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const routeCoordsRef = useRef([]);
  const directionsInFlightRef = useRef(false);
  const directionsLastAttemptRef = useRef(0);
  const riderPulse = useRef(new Animated.Value(0)).current;

  // Re-fit camera when the stage gains new pins (shops / rider / OFD).
  const cameraStageRef = useRef('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [riderCoord, setRiderCoord] = useState(null); // { latitude, longitude }
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, etaMinutes }
  const [liveStatus, setLiveStatus] = useState(null); // current order status, kept fresh via socket
  const [terminalStatus, setTerminalStatus] = useState(null); // Delivered | Cancelled

  const smoothRider = useSmoothCoordinate(riderCoord, SMOOTH_MOVE_MS);

  const destination = useMemo(() => {
    if (!order) return null;
    const lat = numOrNull(order.latitude ?? order.lat);
    const lng = numOrNull(order.longitude ?? order.lng);
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  // Every shop involved in this order — comes straight from the order
  // response (server only populates it once the order leaves Pending).
  const shopCoords = useMemo(() => {
    const list = order?.shops || [];
    return list
      .map((s) => {
        const lat = numOrNull(s.latitude ?? s.lat);
        const lng = numOrNull(s.longitude ?? s.lng);
        if (lat == null || lng == null) return null;
        return { id: s.id, name: s.name, latitude: lat, longitude: lng };
      })
      .filter(Boolean);
  }, [order]);

  // Route (driving directions) only makes sense once the rider is actually
  // en route — before that, just show shop + customer pins.
  const isOutForDelivery = liveStatus === 'Out for Delivery';

  // Continuous “live” pulse on the rider pin while tracking is active.
  useEffect(() => {
    if (!riderCoord || terminalStatus) {
      riderPulse.stopAnimation();
      riderPulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(riderPulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      riderPulse.setValue(0);
    };
  }, [riderCoord, terminalStatus, riderPulse]);

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
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      routeCoordsRef.current = coords;
      setRouteGeoJson({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });
      if (Number.isFinite(route.distance) && Number.isFinite(route.duration)) {
        setRouteInfo({
          distanceKm: route.distance / 1000,
          etaMinutes: Math.round(route.duration / 60),
        });
      }
    } catch (_) {
      // Network / Directions failure — keep last line if any.
    } finally {
      directionsInFlightRef.current = false;
    }
  }, []);

  // Extra bottom padding shifts pin framing upward into free map above the sheet.
  const cameraPadding = useMemo(() => {
    const bottomPad = immersive
      ? Math.max(200, Math.round((sheetReserve || 0) * 0.72) + 80)
      : 130;
    const topPad = immersive ? Math.max(90, Math.round(insets.top) + 56) : 90;
    return { top: topPad, right: 70, bottom: bottomPad, left: 70 };
  }, [immersive, sheetReserve, insets.top]);

  /** Fits camera to every supplied point (shop / rider / destination — any may be null). */
  const fitCamera = useCallback((...points) => {
    if (!cameraRef.current) return;
    const pts = points.filter(Boolean);
    if (!pts.length) return;
    try {
      const pad = [
        cameraPadding.top,
        cameraPadding.right,
        cameraPadding.bottom,
        cameraPadding.left,
      ];
      if (pts.length === 1) {
        const [p] = pts;
        // Padding on single-pin frame so the pin sits in the free map band (higher).
        cameraRef.current.setCamera({
          centerCoordinate: [p.longitude, p.latitude],
          zoomLevel: 14,
          pitch: immersive ? 0 : 55,
          padding: cameraPadding,
          animationMode: 'flyTo',
          animationDuration: 1200,
        });
        return;
      }
      const ne = [
        Math.max(...pts.map((p) => p.longitude)),
        Math.max(...pts.map((p) => p.latitude)),
      ];
      const sw = [
        Math.min(...pts.map((p) => p.longitude)),
        Math.min(...pts.map((p) => p.latitude)),
      ];
      // Flat top-down for multi-pin framing — tilted bounds distort badly.
      cameraRef.current.setCamera({ pitch: 0, animationDuration: 0 });
      cameraRef.current.fitBounds(ne, sw, pad, 500);
    } catch (_) { /* ignore */ }
  }, [cameraPadding, immersive]);

  /** Apply order payload → state (initial load + silent reloads). */
  const applyOrderPayload = useCallback((response, { silent = false } = {}) => {
    const o = normalizeOrder(response?.order || response?.data || response);
    // Ensure shops array survives normalization (API only sends after Accepted).
    if (Array.isArray(response?.order?.shops || response?.data?.shops || response?.shops)) {
      o.shops = response?.order?.shops || response?.data?.shops || response?.shops;
    }
    setOrder(o);

    const status = o?.status;
    setLiveStatus(status);
    if (status === 'Delivered' || status === 'Cancelled') {
      setTerminalStatus(status);
    } else {
      setTerminalStatus(null);
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
    if (rLat != null && rLng != null) {
      setRiderCoord({ latitude: rLat, longitude: rLng });
    }

    // Route line only in Out for Delivery — clear it for earlier stages.
    if (status === 'Out for Delivery' && rLat != null && rLng != null && dest) {
      setTimeout(() => fetchDirections({ latitude: rLat, longitude: rLng }, dest), 0);
    } else if (status !== 'Out for Delivery') {
      routeCoordsRef.current = [];
      setRouteGeoJson(null);
      setRouteInfo(null);
    }
    if (!silent) setError('');
    return o;
  }, [fetchDirections]);

  const loadOrder = useCallback(async ({ silent = false } = {}) => {
    if (!orderId) return;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await (fetchOrder ? fetchOrder(orderId) : ordersApi.getOrder(orderId));
      applyOrderPayload(response, { silent });
    } catch (err) {
      if (!silent) setError(err?.message || 'Failed to load order');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [orderId, fetchOrder, applyOrderPayload]);

  // Seed once from the parent's already-fetched order (skips the duplicate
  // initial GET + "Loading map…" spinner); re-runs after that stay silent.
  const seededRef = useRef(false);
  const initialOrderRef = useRef(initialOrder);
  initialOrderRef.current = initialOrder;

  useEffect(() => {
    if (!orderId) {
      setError('Missing order');
      setLoading(false);
      return;
    }
    if (!seededRef.current && initialOrderRef.current) {
      seededRef.current = true;
      try {
        applyOrderPayload(initialOrderRef.current);
        setLoading(false);
        return;
      } catch (_) {
        // Malformed seed — fall through to a normal fetch.
      }
    }
    loadOrder({ silent: seededRef.current });
    seededRef.current = true;
  }, [orderId, loadOrder, applyOrderPayload]);

  // Stage-based camera: re-frame when shops appear, rider appears, or OFD starts.
  // Stages: dest | shops | rider | ofd
  useEffect(() => {
    if (loading) return;
    if (!shopCoords.length && !destination && !riderCoord) return;
    let stage = 'dest';
    if (isOutForDelivery && riderCoord) stage = 'ofd';
    else if (riderCoord) stage = 'rider';
    else if (shopCoords.length > 0) stage = 'shops';
    if (cameraStageRef.current === stage) return;
    cameraStageRef.current = stage;
    fitCamera(...shopCoords, riderCoord, destination);
  }, [loading, shopCoords, destination, riderCoord, isOutForDelivery, fitCamera]);

  // Draw the route the moment status flips to Out for Delivery mid-session.
  useEffect(() => {
    if (!isOutForDelivery) {
      // Leaving OFD (shouldn't happen often) — drop the line.
      if (routeCoordsRef.current.length > 0) {
        routeCoordsRef.current = [];
        setRouteGeoJson(null);
        setRouteInfo(null);
      }
      return;
    }
    if (!riderCoord || !destination) return;
    if (routeCoordsRef.current.length > 0) return;
    fetchDirections(riderCoord, destination);
  }, [isOutForDelivery, riderCoord, destination, fetchDirections]);

  // Live rider location pings — animate pin + gentle camera follow.
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

      // Gently keep both pins in view as the rider moves (no hard jump).
      if (destination) {
        try {
          const ne = [
            Math.max(lng, destination.longitude),
            Math.max(lat, destination.latitude),
          ];
          const sw = [
            Math.min(lng, destination.longitude),
            Math.min(lat, destination.latitude),
          ];
          cameraRef.current?.fitBounds?.(
            ne,
            sw,
            [
              cameraPadding.top,
              cameraPadding.right,
              cameraPadding.bottom,
              cameraPadding.left,
            ],
            SMOOTH_MOVE_MS,
          );
        } catch (_) { /* ignore */ }
      }

      // Off-route re-fetch when >150 m from last Directions polyline —
      // only once the rider is actually out for delivery.
      if (!isOutForDelivery || !destination) return;
      if (routeCoordsRef.current.length > 0) {
        const drift = minDistanceToRouteMeters(lat, lng, routeCoordsRef.current);
        if (drift > OFF_ROUTE_METERS) {
          fetchDirections(next, destination);
        }
      } else {
        fetchDirections(next, destination);
      }
    });

    return unsub;
  }, [orderId, terminalStatus, destination, fetchDirections, isOutForDelivery, cameraPadding]);

  // Backup poll — sockets can miss while backgrounded. Real updates come from
  // status/assign/location events; this only fills gaps. 15s to match the
  // web admin order map poll cadence (LiveOrderMap.jsx POLL_MS).
  useEffect(() => {
    if (!orderId || terminalStatus) return undefined;
    const id = setInterval(() => {
      loadOrder({ silent: true }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [orderId, terminalStatus, loadOrder]);

  // Realtime stages (no manual refresh):
  //  - Accepted/Preparing → reload shops onto map
  //  - rider.assignment.updated → reload rider last location
  //  - Out for Delivery → reload + draw route
  useEffect(() => {
    if (!orderId) return undefined;
    const unsubOrders = subscribeOrderEvents(({ eventName, payload }) => {
      if (eventName !== 'order.status.updated' && eventName !== 'order.updated') return;
      const p = payload || {};
      const eventOrderId = String(p.orderId ?? p.order_id ?? p.id ?? '');
      if (!eventOrderId || eventOrderId !== String(orderId)) return;
      const status = p.status || p.orderStatus || p.order_status;
      if (status) {
        setLiveStatus(status);
        if (status === 'Delivered' || status === 'Cancelled') {
          setTerminalStatus(status);
        }
      }
      // Full reload picks up shops (post-Accepted) and rider last_lat.
      loadOrder({ silent: true });
    });
    // Rider accepted the offer — show current location immediately.
    const unsubAssign = subscribeRealtime('rider.assignment.updated', (payload) => {
      const eventOrderId = String(payload?.orderId ?? payload?.order_id ?? '');
      if (!eventOrderId || eventOrderId !== String(orderId)) return;
      loadOrder({ silent: true });
    });
    const unsubLife = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        loadOrder({ silent: true });
      }
    });
    return () => {
      unsubOrders();
      unsubAssign();
      unsubLife();
    };
  }, [orderId, loadOrder]);

  const riderAssigned = Boolean(order?.riderId || order?.rider_id || order?.rider);
  const waitingForRider = riderAssigned && !riderCoord && !terminalStatus;
  const isPending = !liveStatus || liveStatus === 'Pending';
  const waitingForAccept = isPending && !terminalStatus;
  const centerFallback = destination || shopCoords[0] || DEFAULT_MAP_CENTER;

  if (loading) {
    return (
      <View style={[styles.mapHeroBleed, style, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Loading map…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.mapHeroBleed, style, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const chipTop = immersive
    ? Math.max(insets.top, spacing.md) + spacing.sm
    : spacing.md;
  const routeChipBottom = immersive
    ? Math.max(spacing.md, Math.round(sheetReserve) + spacing.sm)
    : spacing.md;

  return (
    <View style={[styles.mapHeroBleed, immersive && styles.mapHeroImmersive, style]}>
      {!mapboxAvailable ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Map unavailable</Text>
          <Text style={styles.muted}>Mapbox token is not configured on this build.</Text>
        </View>
      ) : (
        <Mapbox.MapView
          ref={mapRef}
          style={styles.map}
          styleURL={Mapbox.StyleURL.SatelliteStreet}
          compassEnabled
          compassFadeWhenNorth
          compassViewMargins={immersive ? { x: 12, y: chipTop } : undefined}
          pitchEnabled
          rotateEnabled
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Mapbox.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [centerFallback.longitude, centerFallback.latitude],
              zoomLevel: 14,
              pitch: 55,
            }}
          />

          <AnimatedRouteLine
            routeGeoJson={routeGeoJson}
            active={isOutForDelivery}
            idPrefix="rider"
          />

          {shopCoords.map((shop) => (
            <Mapbox.MarkerView
              key={`shop-${shop.id}`}
              id={`shop-${shop.id}`}
              coordinate={[shop.longitude, shop.latitude]}
              allowOverlap
              anchor={{ x: 0.5, y: 1 }}
            >
              <ShopMarker name={shop.name} />
            </Mapbox.MarkerView>
          ))}

          {destination ? (
            <Mapbox.MarkerView
              id="destination"
              coordinate={[destination.longitude, destination.latitude]}
              allowOverlap
              anchor={{ x: 0.5, y: 1 }}
            >
              <CustomerPin />
            </Mapbox.MarkerView>
          ) : null}

          {(smoothRider || riderCoord) ? (
            // key forces Android MarkerView to remount when GPS ping changes —
            // native MarkerView often ignores coordinate prop updates alone.
            <Mapbox.MarkerView
              id="rider"
              key={`rider-${(riderCoord || smoothRider).latitude.toFixed(5)}-${(riderCoord || smoothRider).longitude.toFixed(5)}`}
              coordinate={[
                (smoothRider || riderCoord).longitude,
                (smoothRider || riderCoord).latitude,
              ]}
              allowOverlap
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <RiderPin pulse={riderPulse} />
            </Mapbox.MarkerView>
          ) : null}
        </Mapbox.MapView>
      )}

      <View style={[styles.overlayTop, { top: chipTop }]} pointerEvents="none">
        {/* Red LIVE pill — top-left, pulsing rings while order is active. */}
        {!terminalStatus ? <LiveStatusPill /> : null}

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
        {waitingForAccept ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Order placed — waiting for accept…</Text>
          </View>
        ) : null}
        {!waitingForAccept && !terminalStatus && shopCoords.length === 0 && !isPending ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Loading shops…</Text>
          </View>
        ) : null}
        {!terminalStatus && shopCoords.length > 0 && !riderAssigned ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Shops preparing — waiting for rider…</Text>
          </View>
        ) : null}
        {waitingForRider ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Rider assigned — waiting for location…</Text>
          </View>
        ) : null}
        {!terminalStatus && riderAssigned && riderCoord && !isOutForDelivery ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Rider on the way to shops</Text>
          </View>
        ) : null}
        {!terminalStatus && isOutForDelivery ? (
          <View style={[styles.chip, styles.chipInfo]}>
            <Text style={styles.chipText}>Out for delivery — live tracking</Text>
          </View>
        ) : null}

        {showLegend ? (
          <View style={styles.legend}>
            {shopCoords.length > 0 ? (
              <View style={styles.legendItem}>
                <Text style={styles.legendEmoji}>🏠</Text>
                <Text style={styles.legendText}>Shop</Text>
              </View>
            ) : null}
            {(smoothRider || riderCoord) ? (
              <View style={styles.legendItem}>
                <Text style={styles.legendEmoji}>🛵</Text>
                <Text style={styles.legendText}>
                  {isOutForDelivery ? 'Rider (live)' : 'Rider'}
                </Text>
              </View>
            ) : null}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: CUSTOMER_COLOR }]} />
              <Text style={styles.legendText}>Delivery pin</Text>
            </View>
          </View>
        ) : null}
      </View>

      {immersive ? (
        <View
          pointerEvents="none"
          style={[
            styles.zoomHintRow,
            { bottom: Math.max(spacing.md, Math.round(sheetReserve) + 12) },
          ]}
        >
          <View style={styles.zoomHintChip}>
            <Text style={styles.zoomHintText}>Use two fingers to zoom in or out</Text>
          </View>
        </View>
      ) : null}

      {isOutForDelivery && routeInfo ? (
        <View style={[styles.routeInfoChip, { bottom: routeChipBottom }]} pointerEvents="none">
          <Text style={styles.routeInfoText}>
            {routeInfo.distanceKm.toFixed(1)} km · {routeInfo.etaMinutes} min
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapHeroBleed: {
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
    position: 'relative',
  },
  mapHeroImmersive: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 0,
  },
  overlayTop: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 5,
    alignItems: 'flex-start',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: radius.pill || 20,
    backgroundColor: 'rgba(185, 28, 28, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: spacing.xs,
    overflow: 'visible',
    ...shadows.sm,
  },
  livePillDotStage: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePillRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 80, 80, 0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 200, 0.95)',
  },
  livePillRingInner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(254, 202, 202, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  livePillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
    zIndex: 2,
  },
  livePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#fff',
  },
  zoomHintRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    zIndex: 5,
  },
  zoomHintChip: {
    maxWidth: '92%',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  zoomHintText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
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
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill || radius.md,
    marginTop: spacing.xs,
    maxWidth: '92%',
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
  legend: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.lg,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill || radius.md,
    backgroundColor: colors.bgSurface || '#fff',
    ...shadows.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
    ...shadows.xs,
  },
  legendText: {
    ...(typography.caption || {}),
    color: colors.textSecondary,
    fontWeight: '600',
  },
  legendEmoji: {
    fontSize: 14,
  },
  routeInfoChip: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    zIndex: 5,
    ...shadows.sm,
  },
  routeInfoText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  shopWrap: {
    alignItems: 'center',
    maxWidth: 90,
  },
  shopIconStage: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopPulseRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22, 163, 74, 0.28)',
    borderWidth: 2,
    borderColor: 'rgba(22, 163, 74, 0.75)',
  },
  shopEmoji: {
    fontSize: 32,
    lineHeight: 36,
    textAlign: 'center',
    // Soft shadow so the building stays readable on satellite tiles.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shopLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    maxWidth: 88,
    textAlign: 'center',
  },
  scootyBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: RIDER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    ...shadows.md,
  },
  scootyEmoji: {
    fontSize: 26,
  },
  pinRoot: {
    alignItems: 'center',
    width: 72,
    paddingBottom: 2,
  },
  pinHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    zIndex: 3,
    ...shadows.md,
  },
  pinTail: {
    width: 12,
    height: 12,
    marginTop: -8,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  customerPinHead: {
    backgroundColor: CUSTOMER_COLOR,
  },
  customerPinTail: {
    backgroundColor: CUSTOMER_DARK,
  },
  customerPinHole: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  customerPinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  riderPulseRing: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RIDER_GLOW,
    borderWidth: 2,
    borderColor: RIDER_COLOR,
  },
  riderPulseRingInner: {
    position: 'absolute',
    top: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill || 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...shadows.xs,
  },
  pinLabelAbove: {
    marginTop: 0,
    marginBottom: 10,
  },
  customerLabel: {
    backgroundColor: CUSTOMER_COLOR,
  },
  riderLabel: {
    backgroundColor: RIDER_COLOR,
  },
  pinLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86EFAC',
  },
});
