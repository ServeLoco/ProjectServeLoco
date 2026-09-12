import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadows } from '../../theme';
import { riderApi } from '../../api';
import {
  Mapbox,
  DEFAULT_MAP_CENTER,
  mapboxAvailable,
} from '../../utils/mapbox';
import AnimatedRouteLine from '../AnimatedRouteLine';
import { RIDER_WATCH_OPTIONS, shouldSendPing } from '../../utils/riderTracking';

const CUSTOMER_COLOR = '#FF7A3A';
const OFF_ROUTE_METERS = 150;
// Refetch the route after the rider has traveled this far since the last
// fetch, even while staying right on the line — otherwise the already-ridden
// portion just stays drawn behind them until they happen to drift off it.
const REFETCH_DISTANCE_METERS = 100;
// Min gap between Directions attempts — keeps a failing API from being re-hit
// on every location ping (cost budget: ~1-3 calls per delivery).
const DIRECTIONS_RETRY_COOLDOWN_MS = 30_000;
// How close the rider needs to be to a maneuver point before we consider it
// "reached" and advance the turn-by-turn banner to the next step.
const STEP_ADVANCE_METERS = 35;
// Camera tilt while following the rider — a driving-nav "POV" angle rather
// than the flat top-down view used for context/overview framing (fitAll).
const POV_PITCH = 55;
// Close street-level zoom for POV/follow mode — deliberately tighter than
// fitAll's wide overview framing. Safe to force on every follow tick: a
// manual pinch already pauses follow via onRegionIsChanging, so this only
// ever fights a gesture that just turned follow off anyway.
const POV_ZOOM = 17;
// A shop within this radius counts as "reached" — dropped from routing so
// the map switches to routing the next nearest remaining shop instead of
// still showing the leg to a shop already visited.
const ARRIVAL_RADIUS_METERS = 50;

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

/** Initial great-circle bearing from point 1 to point 2, degrees from true north. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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

/** The single closest point to `origin` — the route only ever targets one
 * shop at a time (never a multi-stop route through several shops at once),
 * so there's no order to compute, just which remaining shop is nearest. */
function nearestPoint(origin, points) {
  let best = points[0];
  let bestDist = Infinity;
  points.forEach((p) => {
    const d = distanceMeters(origin.latitude, origin.longitude, p.latitude, p.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  });
  return best;
}

const MANEUVER_ARROW_DEG = {
  straight: 0,
  'slight right': 30,
  right: 90,
  'sharp right': 135,
  uturn: 180,
  'sharp left': -135,
  left: -90,
  'slight left': -30,
};

/** Icon + accent color for a turn-by-turn step, keyed off Mapbox's maneuver type/modifier. */
function maneuverIcon(step) {
  if (!step) return { emoji: '↑', deg: 0, accent: colors.btnInfoStart };
  if (step.type === 'arrive') return { emoji: '🏁', deg: 0, accent: '#22C55E' };
  if (['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary'].includes(step.type)) {
    return { emoji: '🔄', deg: 0, accent: colors.btnInfoStart };
  }
  return { emoji: '↑', deg: MANEUVER_ARROW_DEG[step.modifier] ?? 0, accent: colors.btnInfoStart };
}

/** 🛵 scooty marker for the rider */
function ScootyMarker() {
  return (
    <View style={styles.scootyWrap} pointerEvents="none">
      <View style={styles.scootyBubble}>
        <Text style={styles.scootyEmoji}>🛵</Text>
      </View>
      <Text style={styles.scootyLabel}>You</Text>
    </View>
  );
}

/** Store-front marker — home only, soft pulse + bounce. */
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

/** Customer delivery pin */
function CustomerMarker() {
  return (
    <View style={styles.pinRoot} pointerEvents="none">
      <View style={[styles.pinHead, styles.customerPinHead]}>
        <Text style={styles.customerEmoji}>🏠</Text>
      </View>
      <View style={[styles.pinTail, styles.customerPinTail]} />
      <View style={[styles.pinLabel, styles.customerLabel]}>
        <Text style={styles.pinLabelText}>Customer</Text>
      </View>
    </View>
  );
}

/**
 * Rider-facing delivery map: shop(s) + rider GPS + customer + driving route.
 * Directions: one fetch on mount/waypoint change + re-fetch only when rider
 * drifts >150 m from the route polyline (MAP locked decision §4.7).
 */
export default function RiderDeliveryMap({ order, pickedUp, style, onRouteInfo, bottomInset = 0 }) {
  const insets = useSafeAreaInsets();
  // Edge-to-edge map: push overlays + Mapbox chrome below the status bar.
  // Extra gap so the turn banner/compass never sit under system icons (clock, battery).
  const topPad = Math.max(insets.top, 0) + spacing.md;
  // This persistent padding drives every continuous follow/recenter camera
  // move (fitAll's fitBounds passes its own separate, balanced padding, so
  // it's unaffected by this). Deliberately NOT centered: a large top pad
  // and small bottom pad pushes the optical center — where the rider dot
  // actually renders — down into the lower part of the screen, leaving most
  // of it to show the road ahead. That's what makes the rider visually
  // "move toward the top of the phone" while riding, like a driving-nav
  // app's camera, instead of sitting pinned dead-center.
  const cameraPadding = useMemo(() => {
    const windowHeight = Dimensions.get('window').height;
    const visibleTop = topPad + 48;
    const visibleBottom = bottomInset + 24;
    const visibleHeight = Math.max(windowHeight - visibleTop - visibleBottom, 200);
    return {
      paddingLeft: 60,
      paddingRight: 60,
      paddingTop: visibleTop + visibleHeight * 0.45,
      paddingBottom: visibleBottom,
    };
  }, [topPad, bottomInset]);
  const cameraRef = useRef(null);
  const routeCoordsRef = useRef([]);
  const waypointKeyRef = useRef('');
  const directionsInFlightRef = useRef(false);
  const directionsLastAttemptRef = useRef(0);
  const lastSentRef = useRef(null);
  // Target shop id the CURRENT route was actually built for — lets a fresh
  // nearest-shop computation (which runs every tick, cheaply) detect "the
  // nearest remaining shop changed" and force a refetch even when the rider
  // hasn't drifted off the existing (now stale-target) polyline.
  const lastShopOrderKeyRef = useRef('');
  // Rider position at the last successful fetch — once they've traveled
  // REFETCH_DISTANCE_METERS from it, refetch so the line re-anchors to
  // where they actually are now instead of leaving the already-ridden
  // portion drawn behind them (only drifting *off* the line triggered a
  // refetch before; riding straight along it never did).
  const lastFetchRiderCoordRef = useRef(null);
  const [loading, setLoading] = useState(!order);
  const [riderCoord, setRiderCoord] = useState(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, etaMinutes }
  const pulse = useRef(new Animated.Value(0)).current;

  // Turn-by-turn: DIY on top of the (free) Directions API's steps=true
  // maneuver data — Mapbox's own turn-by-turn product is the Navigation SDK,
  // which is metered per trip/MAU and has no React Native build, so it's not
  // used here.
  const [steps, setSteps] = useState([]); // flattened across all legs
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const spokenStepRef = useRef(-1);

  const customer = useMemo(() => {
    if (!order) return null;
    const lat = numOrNull(order.latitude ?? order.lat);
    const lng = numOrNull(order.longitude ?? order.lng);
    if (lat == null || lng == null) return null;
    return { latitude: lat, longitude: lng };
  }, [order]);

  const shops = useMemo(() => {
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

  // Shops the rider has physically arrived at (within ARRIVAL_RADIUS_METERS)
  // — dropped from routing so the drawn route shrinks to just the remaining
  // stop(s) instead of still showing the leg to a shop already reached.
  // Markers stay visible for all shops regardless; only routing narrows.
  const [visitedShopIds, setVisitedShopIds] = useState(() => new Set());
  useEffect(() => {
    setVisitedShopIds(new Set());
  }, [order?.id]);
  useEffect(() => {
    if (!riderCoord || pickedUp || shops.length === 0) return;
    setVisitedShopIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      shops.forEach((s) => {
        if (next.has(s.id)) return;
        const d = distanceMeters(riderCoord.latitude, riderCoord.longitude, s.latitude, s.longitude);
        if (d <= ARRIVAL_RADIUS_METERS) {
          next.add(s.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [riderCoord, shops, pickedUp]);

  const routingShops = useMemo(
    () => shops.filter((s) => !visitedShopIds.has(s.id)),
    [shops, visitedShopIds],
  );

  const waypointKey = useMemo(() => {
    const shopPart = routingShops.map((s) => `${s.id}:${s.latitude},${s.longitude}`).join('|');
    const custPart = customer
      ? `${customer.latitude},${customer.longitude}`
      : 'none';
    return `${pickedUp ? 'p1' : 'p0'}|${shopPart}|${custPart}`;
  }, [routingShops, customer, pickedUp]);

  useEffect(() => {
    if (order) setLoading(false);
  }, [order]);

  // Live GPS for rider pin (updates every sample, for a smooth marker) +
  // server location pings (first fix, then ~150 m / sharp turn — see
  // shouldSendPing). Also seeds an immediate position so the map is not
  // blank until first watch tick.
  useEffect(() => {
    let sub = null;
    let cancelled = false;

    const maybeSendPing = (next) => {
      const ping = { ...next, at: Date.now() };
      if (!shouldSendPing(lastSentRef.current, ping)) return;
      lastSentRef.current = ping;
      riderApi.updateLocation(next.latitude, next.longitude).catch(() => {});
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!cancelled && current?.coords) {
          const { latitude, longitude, heading } = current.coords;
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            setRiderCoord({ latitude, longitude });
            maybeSendPing({ latitude, longitude, heading });
          }
        }
      } catch (_) { /* watch still starts below */ }

      if (cancelled) return;

      const watchSub = await Location.watchPositionAsync(
        RIDER_WATCH_OPTIONS,
        (pos) => {
          const { latitude, longitude, heading } = pos.coords || {};
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          setRiderCoord({ latitude, longitude });
          maybeSendPing({ latitude, longitude, heading });
        },
      );
      if (cancelled) {
        watchSub?.remove?.();
        return;
      }
      sub = watchSub;
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!riderCoord) return undefined;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [riderCoord, pulse]);

  const fetchRoute = useCallback(async ({ force = false } = {}) => {
    if (!mapboxAvailable || !customer) return;
    const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (!token) return;
    if (directionsInFlightRef.current) return;

    // Pre-pickup: route rider -> ONE shop at a time — the single nearest
    // remaining shop, never a multi-stop route through several at once.
    // Once the rider gets within ARRIVAL_RADIUS_METERS of it (see the
    // visitedShopIds effect), it drops out of routingShops and this picks
    // whichever remaining shop is nearest next. Post-pickup: route straight
    // to the customer (shops are no longer relevant to the drive).
    const stops = [];
    if (riderCoord) stops.push(riderCoord);
    let shopOrderKey = '';
    if (pickedUp) {
      stops.push(customer);
    } else if (routingShops.length > 0) {
      const nextShop = riderCoord ? nearestPoint(riderCoord, routingShops) : routingShops[0];
      shopOrderKey = String(nextShop.id);
      stops.push(nextShop);
    } else {
      // No shop location on file — fall back to a direct route so the map
      // isn't left without any line at all.
      stops.push(customer);
    }
    if (stops.length < 2) return;

    const hasRoute = routeCoordsRef.current.length >= 2;
    const waypointsChanged = waypointKey !== waypointKeyRef.current;
    // The rider ending up closer to a different remaining shop than the one
    // currently targeted needs a refetch too — not just physically drifting
    // off the drawn line, which is the only other thing that triggers one.
    const shopOrderChanged = shopOrderKey !== '' && shopOrderKey !== lastShopOrderKeyRef.current;
    const traveledFar = riderCoord && lastFetchRiderCoordRef.current
      ? distanceMeters(
        riderCoord.latitude,
        riderCoord.longitude,
        lastFetchRiderCoordRef.current.latitude,
        lastFetchRiderCoordRef.current.longitude,
      ) >= REFETCH_DISTANCE_METERS
      : false;

    if (!force && hasRoute && !waypointsChanged && !shopOrderChanged && !traveledFar) {
      // Only re-fetch when rider drifts >150 m from the polyline.
      if (riderCoord) {
        const drift = minDistanceToRouteMeters(
          riderCoord.latitude,
          riderCoord.longitude,
          routeCoordsRef.current,
        );
        if (drift <= OFF_ROUTE_METERS) return;
      } else {
        return;
      }
    }

    const now = Date.now();
    // Cooldown applies even before the first successful route — otherwise a
    // failing Directions call (bad token, network) gets retried on every GPS
    // sample (~3s) instead of waiting out the cooldown like the customer map
    // (RiderLiveMap.js) already does. directionsLastAttemptRef starts at 0,
    // so the very first attempt is never blocked by this.
    if (!force && now - directionsLastAttemptRef.current < DIRECTIONS_RETRY_COOLDOWN_MS) {
      return;
    }
    directionsLastAttemptRef.current = now;
    directionsInFlightRef.current = true;

    // Directions API drives through waypoints in the exact order given — it
    // never reorders them itself, which is exactly what we want here since
    // `stops` is already nearest-neighbor ordered above.
    const coordStr = stops.map((p) => `${p.longitude},${p.latitude}`).join(';');
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
        `?geometries=geojson&overview=full&steps=true&banner_instructions=true` +
        `&voice_instructions=true&voice_units=metric&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      routeCoordsRef.current = coords;
      waypointKeyRef.current = waypointKey;
      lastShopOrderKeyRef.current = shopOrderKey;
      lastFetchRiderCoordRef.current = riderCoord;
      setRouteGeoJson({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });

      // Flatten every leg's steps into one ordered turn-by-turn list — each
      // stop (shop, then eventually customer) is its own leg, and a fresh
      // route always starts guidance over from its first maneuver.
      const flatSteps = [];
      (route?.legs || []).forEach((leg) => {
        (leg?.steps || []).forEach((step) => {
          const loc = step?.maneuver?.location;
          if (!Array.isArray(loc) || loc.length < 2) return;
          flatSteps.push({
            instruction: step?.maneuver?.instruction || step?.name || 'Continue',
            type: step?.maneuver?.type || 'turn',
            modifier: step?.maneuver?.modifier || 'straight',
            location: { longitude: loc[0], latitude: loc[1] },
          });
        });
      });
      setSteps(flatSteps);
      setActiveStepIndex(0);
      spokenStepRef.current = -1;

      if (Number.isFinite(route.distance) && Number.isFinite(route.duration)) {
        const info = {
          distanceKm: route.distance / 1000,
          etaMinutes: Math.round(route.duration / 60),
        };
        setRouteInfo(info);
        onRouteInfo?.(info);
      }
    } catch (_) {
      // Keep last route on network / Directions failure.
    } finally {
      directionsInFlightRef.current = false;
    }
  }, [riderCoord, customer, routingShops, pickedUp, waypointKey, onRouteInfo]);

  // Fetch on mount / GPS / waypoint changes. fetchRoute itself decides whether
  // a Directions call is needed (first route, waypoint change, or >150 m drift).
  useEffect(() => {
    const waypointsChanged = waypointKey !== waypointKeyRef.current;
    const needsForce = waypointsChanged && Boolean(customer);
    fetchRoute({ force: needsForce });
  }, [fetchRoute, waypointKey, customer]);

  // Turn-by-turn: advance the banner (and speak the new instruction) once
  // the rider gets within STEP_ADVANCE_METERS of the current step's maneuver
  // point. Re-derives from live GPS on every tick rather than the route's
  // static per-step distance, since that's the rider's actual position.
  useEffect(() => {
    if (!riderCoord || steps.length === 0) return;
    const step = steps[activeStepIndex];
    if (!step) return;
    const dist = distanceMeters(
      riderCoord.latitude,
      riderCoord.longitude,
      step.location.latitude,
      step.location.longitude,
    );
    if (dist <= STEP_ADVANCE_METERS && activeStepIndex < steps.length - 1) {
      setActiveStepIndex((i) => i + 1);
    }
  }, [riderCoord, steps, activeStepIndex]);

  // Speak the active step once (not on every GPS tick / re-render).
  useEffect(() => {
    const step = steps[activeStepIndex];
    if (!step || spokenStepRef.current === activeStepIndex) return;
    spokenStepRef.current = activeStepIndex;
    Speech.speak(step.instruction, { language: 'en' });
  }, [steps, activeStepIndex]);

  useEffect(() => () => Speech.stop(), []);

  // Follow mode: pan (never zoom) the camera onto the rider on every GPS
  // tick. A real finger-drag on the map (isUserInteraction) turns it off so
  // it doesn't fight a manual pan/zoom — the earlier reported bug — and a
  // "Recenter" pill brings it back.
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);

  const onRegionIsChanging = useCallback((feature) => {
    if (feature?.properties?.isUserInteraction && followRef.current) {
      followRef.current = false;
      setFollowing(false);
    }
  }, []);

  // Heading purely from the route/destination geometry — the bearing from
  // the rider toward wherever they're actually headed — not the device
  // compass or GPS course. Those track the phone's real-world orientation
  // or real movement, neither of which lines up with a simulated/mocked
  // test location, and isn't really "the route" anyway. This is: whichever
  // way the route says to go is up on screen, always, deterministically.
  // Falls back down from the precise upcoming turn (steps) to the straight
  // line toward the current target so it's never left unset.
  const routeHeadingTarget = steps[activeStepIndex]?.location
    || (pickedUp ? customer : null)
    || routingShops[0]
    || null;
  const routeHeading = riderCoord && routeHeadingTarget
    ? bearingDeg(riderCoord.latitude, riderCoord.longitude, routeHeadingTarget.latitude, routeHeadingTarget.longitude)
    : null;

  // Shared POV camera apply — used by recenter(), the per-tick follow
  // effect below, AND fitAll (so its wide context fitBounds doesn't become
  // the camera's last word and leave the zoom stuck wide — see there).
  const applyPovCamera = useCallback((animationDuration = 500) => {
    if (!riderCoord || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [riderCoord.longitude, riderCoord.latitude],
      pitch: POV_PITCH,
      zoomLevel: POV_ZOOM,
      ...(routeHeading != null ? { heading: routeHeading } : null),
      animationDuration,
    });
  }, [riderCoord, routeHeading]);

  const recenter = useCallback(() => {
    followRef.current = true;
    setFollowing(true);
    applyPovCamera(300);
  }, [applyPovCamera]);

  // Rider POV: tilted, zoomed in, rotated to the direction of travel — like
  // a driving nav app — instead of the flat, wide overview fitAll frames for
  // context changes. A manual pinch/pan pauses follow (onRegionIsChanging),
  // so forcing zoom here never fights a still-active user gesture.
  useEffect(() => {
    if (!followRef.current) return;
    applyPovCamera(500);
  }, [applyPovCamera]);

  const fitAll = useCallback(() => {
    if (!cameraRef.current) return;
    // A real context change (new job, pickup transition, reroute) resumes
    // follow mode even if the rider had panned away earlier.
    followRef.current = true;
    setFollowing(true);
    const points = [];
    if (riderCoord) points.push(riderCoord);
    shops.forEach((s) => points.push(s));
    if (customer) points.push(customer);
    if (points.length === 0) return;
    try {
      // Include the actual route polyline (not just the endpoint pins) so a
      // curving road never bows outside the camera frame.
      const lngs = points.map((p) => p.longitude);
      const lats = points.map((p) => p.latitude);
      routeCoordsRef.current.forEach(([lng, lat]) => {
        lngs.push(lng);
        lats.push(lat);
      });
      // Padding: top / right / bottom / left — leave room for status bar +
      // the actual bottom sheet height (not a guess), so a curving route
      // near the bottom of the screen never ends up hidden under it.
      cameraRef.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [topPad + 48, 40, bottomInset + 24, 40],
        500,
      );
      // fitBounds has no zoom/pitch/heading of its own — without this, its
      // wide context view was the camera's last word after every order
      // change, pickup transition, or reroute, and the POV zoom only came
      // back once another GPS tick happened to fire. Snap into POV right
      // after the overview settles instead of waiting on that.
      setTimeout(() => {
        if (followRef.current) applyPovCamera(600);
      }, 550);
    } catch (_) { /* ignore */ }
  }, [riderCoord, shops, customer, topPad, bottomInset, applyPovCamera]);

  // Auto-fit only on real context changes (new assignment, or the
  // shop/customer waypoint set changing — e.g. pickup happened). Deliberately
  // NOT keyed on `fitAll` itself, which is recreated on every GPS tick
  // (riderCoord updates every few seconds) — including it here was snapping
  // the camera back to fitBounds() on every tick, fighting the rider's manual
  // zoom/pan (reported bug: map "auto centers" and won't stay where shifted).
  useEffect(() => {
    const t = setTimeout(fitAll, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, waypointKey]);

  // One-time fit when the rider's GPS fix first resolves, so the initial
  // view frames the rider dot too — but never again after that, so later
  // ticks can't re-trigger it.
  const riderFirstFitDoneRef = useRef(false);
  useEffect(() => {
    if (!riderCoord || riderFirstFitDoneRef.current) return undefined;
    riderFirstFitDoneRef.current = true;
    const t = setTimeout(fitAll, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderCoord]);

  // Re-fit once per waypoint set when the real driving route resolves — a
  // curving road can bow outside the pin-only bounds computed above.
  const routeFitKeyRef = useRef('');
  useEffect(() => {
    if (!routeGeoJson || routeFitKeyRef.current === waypointKey) return undefined;
    routeFitKeyRef.current = waypointKey;
    const t = setTimeout(fitAll, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGeoJson, waypointKey]);

  const center = customer || shops[0] || riderCoord || DEFAULT_MAP_CENTER;
  const activeStep = steps[activeStepIndex] || null;
  const activeStepDistanceM = activeStep && riderCoord
    ? distanceMeters(riderCoord.latitude, riderCoord.longitude, activeStep.location.latitude, activeStep.location.longitude)
    : null;
  const activeManeuver = maneuverIcon(activeStep);

  if (loading) {
    return (
      <View style={[styles.wrap, style, styles.centered]}>
        <ActivityIndicator color={colors.saffron} />
      </View>
    );
  }

  if (!mapboxAvailable) {
    return (
      <View style={[styles.wrap, style, styles.centered]}>
        <Text style={styles.errorText}>Map unavailable — Mapbox token missing</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.SatelliteStreet}
        compassEnabled
        // Margins are from the map edges; y must clear status bar + leave a gap.
        compassViewMargins={{ x: 12, y: topPad }}
        scaleBarEnabled={false}
        onRegionIsChanging={onRegionIsChanging}
      >
        <Mapbox.Camera
          ref={cameraRef}
          padding={cameraPadding}
          defaultSettings={{
            centerCoordinate: [center.longitude, center.latitude],
            zoomLevel: 17,
          }}
        />

        <AnimatedRouteLine
          routeGeoJson={routeGeoJson}
          active={Boolean(routeGeoJson)}
          idPrefix="rider-delivery"
        />

        {shops.map((shop) => (
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

        {customer ? (
          <Mapbox.MarkerView
            id="customer-dest"
            coordinate={[customer.longitude, customer.latitude]}
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
          >
            <CustomerMarker />
          </Mapbox.MarkerView>
        ) : null}

        {riderCoord ? (
          <Mapbox.MarkerView
            id="rider-self"
            coordinate={[riderCoord.longitude, riderCoord.latitude]}
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <ScootyMarker />
          </Mapbox.MarkerView>
        ) : null}
      </Mapbox.MapView>

      {activeStep ? (
        <View style={[styles.turnBanner, { top: topPad }]} pointerEvents="none">
          <View style={[styles.turnBannerIconWrap, { backgroundColor: activeManeuver.accent }]}>
            <Text style={[styles.turnBannerIconText, { transform: [{ rotate: `${activeManeuver.deg}deg` }] }]}>
              {activeManeuver.emoji}
            </Text>
          </View>
          <View style={styles.turnBannerBody}>
            <Text style={[styles.turnBannerDistance, { color: activeManeuver.accent }]}>
              {activeStepDistanceM != null
                ? (activeStepDistanceM >= 1000
                  ? `${(activeStepDistanceM / 1000).toFixed(1)} km`
                  : `${Math.round(activeStepDistanceM)} m`)
                : ''}
            </Text>
            <Text style={styles.turnBannerText} numberOfLines={2}>{activeStep.instruction}</Text>
          </View>
        </View>
      ) : null}

      {!following ? (
        <TouchableOpacity
          style={[styles.recenterBtn, { bottom: bottomInset + spacing.sm }]}
          onPress={recenter}
          accessibilityLabel="Recenter on me"
        >
          <Text style={styles.recenterBtnText}>⌖ Recenter</Text>
        </TouchableOpacity>
      ) : null}

      {routeInfo ? (
        <View style={[styles.routeInfoChip, { bottom: bottomInset + spacing.sm }]}>
          <Text style={styles.routeInfoText}>
            {routeInfo.distanceKm.toFixed(1)} km · {routeInfo.etaMinutes} min
          </Text>
        </View>
      ) : null}

      {!customer ? (
        <View style={[styles.warnChip, { top: topPad }]}>
          <Text style={styles.warnText}>Customer pin missing on this order</Text>
        </View>
      ) : null}
      {shops.length === 0 ? (
        <View style={[styles.warnChip, { top: topPad + 36 }]}>
          <Text style={styles.warnText}>No shop location set — ask admin</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 280,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
  },
  map: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.error, fontWeight: '600', textAlign: 'center', padding: spacing.md },

  scootyWrap: { alignItems: 'center' },
  scootyBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  scootyEmoji: { fontSize: 26 },
  scootyLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    color: '#5b21b6',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },

  shopWrap: { alignItems: 'center', maxWidth: 90 },
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

  pinRoot: { alignItems: 'center', width: 72 },
  pinHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    ...shadows.md,
  },
  pinTail: {
    width: 12,
    height: 12,
    marginTop: -8,
    transform: [{ rotate: '45deg' }],
  },
  customerPinHead: { backgroundColor: CUSTOMER_COLOR },
  customerPinTail: { backgroundColor: '#E05A1A' },
  customerEmoji: { fontSize: 16 },
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  customerLabel: { backgroundColor: CUSTOMER_COLOR },
  pinLabelText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  turnBanner: {
    position: 'absolute',
    left: spacing.sm,
    // Hugs its content (icon + text), never stretches to fill the row — the
    // maxWidth is only a cap for a genuinely long instruction to wrap under.
    alignSelf: 'flex-start',
    maxWidth: '70%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 17, 23, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    ...shadows.md,
  },
  turnBannerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnBannerIconText: { fontSize: 18, color: '#fff', fontWeight: '900' },
  turnBannerBody: { flexShrink: 1 },
  turnBannerDistance: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  turnBannerText: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 1 },

  recenterBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.pill,
    ...shadows.sm,
  },
  recenterBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  routeInfoChip: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    ...shadows.sm,
  },
  routeInfoText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  warnChip: {
    position: 'absolute',
    // top set at runtime via safe-area insets
    right: spacing.sm,
    maxWidth: '55%',
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  warnText: { fontSize: 10, fontWeight: '700', color: colors.warning },
});
