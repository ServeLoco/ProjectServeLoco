import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useReducedMotion } from '../../utils';
import {
  Mapbox,
  DEFAULT_MAP_CENTER,
  mapboxAvailable,
} from '../../utils/mapbox';
import {
  requestPreciseLocationPermission,
  openAppLocationSettings,
} from '../../hooks/usePreciseLocationPermissionOnStart';
import AppIcon from '../AppIcon';
import PressableScale from '../PressableScale';

const GPS_TIMEOUT_MS = 8000;
// Delivery pin colors (not live GPS — live is the blue recenter FAB only).
const CUSTOMER_COLOR = '#FF7A3A';
const CUSTOMER_DARK = '#E05A1A';
// Google Maps–style live-location blue (recenter control only)
const RECENTER_BLUE = colors.info || '#3B82F6';
const RECENTER_BLUE_RING = 'rgba(59, 130, 246, 0.55)';
// Small nudge so the pin tip (not the head center) marks the true point.
const PIN_TIP_OFFSET_Y = -17;
const PIN_LIFT_Y = -12;
// Extra lift above the optical mid of the free map (checkout sheet chrome).
const PIN_EXTRA_UP_Y = -64;
// Zoom used when auto-locating or tapping recenter (close pin view).
const LIVE_ZOOM = 16.5;
// Initial map zoom before / until live GPS flies in (higher = closer).
const DEFAULT_ZOOM = 13.5;
// Camera bottom padding is FIXED to collapsed-sheet size so dragging the
// checkout sheet up/down never re-pads the camera (that was re-centering to live GPS).
const FIXED_CAMERA_SHEET_PAD = Math.round(Dimensions.get('window').height * 0.40);

// GPS can hang indefinitely on some devices; cap it so buttons never spin forever.
function getPositionWithTimeout() {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('GPS_TIMEOUT')), GPS_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Interactive map location picker (Feature A).
 * Fixed center pin; map pans underneath. Parent reverse-geocodes on confirm.
 *
 * Flow:
 * 1. Optional one-shot auto-locate when the map first opens (moves camera only).
 * 2. Recenter FAB — fly to live GPS; does NOT set delivery.
 * 3. User pans the map so the fixed pin marks the spot they want.
 * 4. Confirm location reads map center → that is the delivery pin.
 *
 * `inline` / `fullBleed`: checkout embedding.
 * `immersive`: full-screen map (rider delivery style). Pair with parent bottom sheet.
 * `hideActions`: omit Confirm / Enter manually (parent sheet owns those buttons).
 * `autoCommit`: (legacy) GPS + pan end auto-call onConfirm — prefer Confirm button.
 * `sheetReserve`: bottom px reserved for parent sheet so recenter FAB sits above it.
 * `autoLocateOnMount`: fetch live GPS once when map appears (camera only unless autoCommit).
 * `showConfirmHint`: plain cue above Confirm when user tried Place Order without confirming.
 * `onLocateStatus`: 'loading' | 'ready' | 'error' for parent chips (live GPS helper).
 * `onPinMoved`: after pan or recenter — parent should clear confirmed delivery (non-autoCommit).
 *
 * Imperative (`apiRef`): `{ confirmLocation(), locateToLive() }`.
 * (Plain function + apiRef — avoids forwardRef barrel interop issues on RN.)
 */
export default function LocationPicker({
  visible,
  initialCenter,
  onConfirm,
  onClose,
  inline = false,
  autoLocateOnMount = false,
  showConfirmHint = false,
  fullBleed = false,
  immersive = false,
  hideActions = false,
  autoCommit = false,
  sheetReserve = 0,
  apiRef = null,
  onEnterManually,
  onMapTouchStart,
  onMapTouchEnd,
  onLocateStatus,
  onPinMoved,
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dropTimeoutRef = useRef(null);
  const didAutoLocateRef = useRef(false);
  const locatingInFlightRef = useRef(false);
  // Map view size — needed to convert the fixed pin's screen point → lat/lng.
  const mapLayoutRef = useRef({ width: 0, height: 0 });
  // Last camera center from onMapIdle / pan (must stay in sync with native map).
  const lastMapCenterRef = useRef(null);
  // True after user pans — blocks live-GPS fly retries from yanking the map back.
  const userMovedMapRef = useRef(false);
  // Freeze pin screen offset after Confirm so sheet expand doesn't slide the tip.
  const frozenPinOffsetRef = useRef(null);
  const onLocateStatusRef = useRef(onLocateStatus);
  const onPinMovedRef = useRef(onPinMoved);
  const onConfirmRef = useRef(onConfirm);
  const autoCommitRef = useRef(autoCommit);
  const sheetReserveRef = useRef(sheetReserve);
  const immersiveRef = useRef(immersive);
  onLocateStatusRef.current = onLocateStatus;
  onPinMovedRef.current = onPinMoved;
  onConfirmRef.current = onConfirm;
  autoCommitRef.current = autoCommit;
  sheetReserveRef.current = sheetReserve;
  immersiveRef.current = immersive;
  const commitTimerRef = useRef(null);
  const zoomRetryTimersRef = useRef([]);
  // Last zoom applied via setCamera — seed effect must not clobber live zoom.
  const zoomRef = useRef(DEFAULT_ZOOM);
  const liveZoomAppliedRef = useRef(false);
  // 0 = settled on map, 1 = lifted while panning
  const pinLift = useRef(new Animated.Value(0)).current;
  // Soft ground pulse (0 → 1 loop)
  const pulse = useRef(new Animated.Value(0)).current;
  // Recenter FAB: two staggered blue rings expanding outward
  const recenterRingA = useRef(new Animated.Value(0)).current;
  const recenterRingB = useRef(new Animated.Value(0)).current;
  const [confirming, setConfirming] = useState(false);
  const [recentering, setRecentering] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  // Saffron after the user taps Confirm location.
  const [pinActive, setPinActive] = useState(false);
  // Live GPS / last fly-to center (map only until Confirm).
  const [liveCenter, setLiveCenter] = useState(null);
  // When true, Camera is free (user panned) — do NOT pass centerCoordinate props
  // or sheet re-renders / padding changes will snap back to live GPS.
  const [freeCamera, setFreeCamera] = useState(false);
  // Drive Mapbox.Camera via props only for intentional fly/zoom.
  const [cameraTarget, setCameraTarget] = useState(() => {
    // Always start at explicit default / initial — never 0,0 or stale live GPS.
    const c = initialCenter || DEFAULT_MAP_CENTER;
    return {
      centerCoordinate: [Number(c.longitude), Number(c.latitude)],
      zoomLevel: DEFAULT_ZOOM,
      animationMode: 'moveTo',
      animationDuration: 0,
      key: 0,
    };
  });

  const confirmEnter = useRef(new Animated.Value(0)).current;

  const center = liveCenter || initialCenter || DEFAULT_MAP_CENTER;
  const centerCoordinate = [Number(center.longitude), Number(center.latitude)];

  // Slide + fade the pin action in when the map is shown.
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive) {
      confirmEnter.setValue(0);
      return undefined;
    }
    if (reducedMotion) {
      confirmEnter.setValue(1);
      return undefined;
    }
    confirmEnter.setValue(0);
    Animated.spring(confirmEnter, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [inline, visible, confirmEnter, reducedMotion]);

  const dropPin = useCallback(() => {
    if (reducedMotion) {
      pinLift.setValue(0);
      return;
    }
    pinLift.stopAnimation();
    // Ease-out-back: tip overshoots slightly then settles on the map.
    Animated.timing(pinLift, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.back(1.8)),
      useNativeDriver: true,
    }).start();
  }, [pinLift, reducedMotion]);

  const liftPin = useCallback(() => {
    if (reducedMotion) return;
    pinLift.stopAnimation();
    Animated.timing(pinLift, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pinLift, reducedMotion]);

  // Fixed padding — independent of live sheet height so drag/snap never moves the map.
  const cameraPadding = useMemo(() => {
    if (!immersive) return undefined;
    return {
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: FIXED_CAMERA_SHEET_PAD + Math.abs(PIN_EXTRA_UP_Y) * 2,
      paddingLeft: 0,
    };
  }, [immersive]);

  const applyCamera = useCallback((latitude, longitude, {
    zoomLevel = DEFAULT_ZOOM,
    animated = true,
    duration,
  } = {}) => {
    if (!mapboxAvailable) return;
    // Programmatic move re-engages controlled Camera for this fly only.
    setFreeCamera(false);
    const z = Number(zoomLevel);
    zoomRef.current = z;
    if (z >= LIVE_ZOOM - 0.1) liveZoomAppliedRef.current = true;
    const anim = animated && !reducedMotion;
    const animDuration = duration != null ? duration : (anim ? 1100 : 0);
    const animMode = anim ? 'flyTo' : 'moveTo';
    const coord = [Number(longitude), Number(latitude)];

    // 1) React props — bump key so Camera always receives a new stop (zoom+center).
    setCameraTarget((prev) => ({
      centerCoordinate: coord,
      zoomLevel: z,
      animationMode: animMode,
      animationDuration: animDuration,
      key: (prev.key || 0) + 1,
    }));

    // 2) Imperative backup (recenter / late mount).
    const payload = {
      centerCoordinate: coord,
      zoomLevel: z,
      pitch: 55,
      animationMode: animMode,
      animationDuration: animDuration,
    };
    if (cameraPadding) payload.padding = cameraPadding;
    try {
      cameraRef.current?.setCamera?.(payload);
    } catch (_) { /* ignore */ }
  }, [cameraPadding, reducedMotion]);

  const clearZoomRetries = useCallback(() => {
    zoomRetryTimersRef.current.forEach(clearTimeout);
    zoomRetryTimersRef.current = [];
  }, []);

  /**
   * Keep React Camera props aligned with the native map.
   * Without this, after the user pans, cameraTarget still holds live GPS —
   * and any re-render (Confirm → sheet expand) snaps the map back to live.
   */
  const syncCameraPropsFromNative = useCallback(async () => {
    if (!mapboxAvailable || !mapRef.current) return null;
    try {
      const c = await mapRef.current.getCenter?.();
      if (!Array.isArray(c) || c.length < 2) return null;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      lastMapCenterRef.current = { latitude: lat, longitude: lng };
      setCameraTarget((prev) => {
        const [plng, plat] = prev.centerCoordinate || [];
        if (
          Number.isFinite(plng)
          && Number.isFinite(plat)
          && Math.abs(plng - lng) < 1e-8
          && Math.abs(plat - lat) < 1e-8
        ) {
          return prev;
        }
        // Same key — do not force a fly; only update props so re-renders keep place.
        return {
          ...prev,
          centerCoordinate: [lng, lat],
          animationMode: 'moveTo',
          animationDuration: 0,
        };
      });
      return { lat, lng };
    } catch (_) {
      return null;
    }
  }, []);

  const flyTo = useCallback((latitude, longitude, animated = true, zoomLevel = 13) => {
    // Recenter FAB / auto-locate: user is accepting a programatic move again.
    userMovedMapRef.current = false;
    frozenPinOffsetRef.current = null;
    setLiveCenter({ latitude, longitude });
    lastMapCenterRef.current = { latitude, longitude };
    if (!mapboxAvailable) return;
    liftPin();
    clearZoomRetries();
    applyCamera(latitude, longitude, { zoomLevel, animated });

    // Mapbox often ignores the first camera update while the native map is still
    // laying out (auto-locate on mount). Re-apply close zoom shortly after.
    // Skip retries if the user already panned away.
    if (zoomLevel >= LIVE_ZOOM - 0.1) {
      const t1 = setTimeout(() => {
        if (userMovedMapRef.current) return;
        applyCamera(latitude, longitude, { zoomLevel, animated: true, duration: 900 });
      }, 450);
      const t2 = setTimeout(() => {
        if (userMovedMapRef.current) return;
        applyCamera(latitude, longitude, { zoomLevel, animated: true, duration: 600 });
        dropPin();
      }, 1000);
      const t3 = setTimeout(() => {
        if (userMovedMapRef.current) return;
        applyCamera(latitude, longitude, { zoomLevel, animated: false, duration: 0 });
      }, 1700);
      zoomRetryTimersRef.current = [t1, t2, t3];
    } else {
      if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
      dropTimeoutRef.current = setTimeout(dropPin, animated && !reducedMotion ? 520 : 40);
    }
  }, [applyCamera, clearZoomRetries, dropPin, liftPin, reducedMotion]);

  /**
   * Ask for precise location permission, then fetch live GPS and move the pin
   * (does not confirm delivery). Recenter FAB and first-load both use this.
   * @param {{ fromUser?: boolean }} opts - fromUser true only for FAB press (FAB spinner).
   */
  const locateToLive = useCallback(async ({ fromUser = false } = {}) => {
    // Prevent double-fires (concurrent taps / overlapping calls).
    if (locatingInFlightRef.current) return false;
    locatingInFlightRef.current = true;
    // FAB spinner only on explicit button press — first-load locate uses map chip only.
    if (fromUser) setRecentering(true);
    setGpsError(null);
    onLocateStatusRef.current?.('loading');
    try {
      // Always request precise (fine) permission before GPS — system dialog if needed.
      const perm = await requestPreciseLocationPermission();
      if (!perm.granted) {
        setGpsError(
          perm.needsSettings
            ? 'Location blocked. Open Settings → Location → Allow (Precise).'
            : 'Allow precise location to use live GPS, or pan the map instead.',
        );
        onLocateStatusRef.current?.('error');
        // User tapped recenter and OS won't show the dialog again → open Settings.
        if (fromUser && perm.needsSettings) {
          openAppLocationSettings();
        }
        return false;
      }

      const position = await getPositionWithTimeout();
      const { latitude, longitude } = position.coords;
      // Auto-locate + recenter: fly in close on the pin.
      flyTo(latitude, longitude, true, LIVE_ZOOM);
      if (autoCommitRef.current) {
        // Live GPS pin = delivery location (no separate Confirm step).
        setPinActive(true);
        if (typeof onConfirmRef.current === 'function') {
          onConfirmRef.current(latitude, longitude);
        }
      } else {
        // Relocating invalidates a previous Confirm — must confirm again.
        setPinActive(false);
        onPinMovedRef.current?.();
      }
      onLocateStatusRef.current?.('ready');
      return true;
    } catch (_) {
      setGpsError('Could not get live location. Pan the map to pin it instead.');
      onLocateStatusRef.current?.('error');
      dropPin();
      return false;
    } finally {
      locatingInFlightRef.current = false;
      if (fromUser) setRecentering(false);
    }
  }, [dropPin, flyTo]);

  // Continuous soft pulse under the pin while map is visible.
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive || !mapboxAvailable || reducedMotion) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [inline, visible, pulse, reducedMotion]);

  // Blue expanding rings on the recenter control (radar / live-location style).
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive || reducedMotion) {
      recenterRingA.setValue(0);
      recenterRingB.setValue(0);
      return undefined;
    }
    const makeRingLoop = (val, delayMs) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(val, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    const loopA = makeRingLoop(recenterRingA, 0);
    const loopB = makeRingLoop(recenterRingB, 800);
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
      recenterRingA.setValue(0);
      recenterRingB.setValue(0);
    };
  }, [inline, visible, reducedMotion, recenterRingA, recenterRingB]);

  // Entrance drop when the picker opens / mounts.
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive || !mapboxAvailable) return;
    if (reducedMotion) {
      pinLift.setValue(0);
      return;
    }
    pinLift.setValue(1);
    const t = setTimeout(dropPin, 80);
    return () => clearTimeout(t);
  }, [inline, visible, dropPin, pinLift, reducedMotion]);

  // Seed camera once to default / initial center (NOT live GPS).
  // Live GPS only runs when user taps the blue recenter FAB (or autoLocateOnMount).
  const didSeedCameraRef = useRef(false);
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive || !mapboxAvailable) {
      didSeedCameraRef.current = false;
      return;
    }
    if (didSeedCameraRef.current) return;
    // Skip seed if live GPS already applied a close zoom.
    if (liveZoomAppliedRef.current) return;
    didSeedCameraRef.current = true;
    const seed = initialCenter || DEFAULT_MAP_CENTER;
    lastMapCenterRef.current = {
      latitude: Number(seed.latitude),
      longitude: Number(seed.longitude),
    };
    applyCamera(seed.latitude, seed.longitude, {
      zoomLevel: DEFAULT_ZOOM,
      animated: false,
      duration: 0,
    });
    // Re-apply shortly after native map mounts (first setCamera is often ignored).
    const t1 = setTimeout(() => {
      if (liveZoomAppliedRef.current) return;
      applyCamera(seed.latitude, seed.longitude, {
        zoomLevel: DEFAULT_ZOOM,
        animated: false,
        duration: 0,
      });
    }, 400);
    const t2 = setTimeout(() => {
      if (liveZoomAppliedRef.current) return;
      applyCamera(seed.latitude, seed.longitude, {
        zoomLevel: DEFAULT_ZOOM,
        animated: false,
        duration: 0,
      });
    }, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot seed on open only
  }, [inline, visible]);

  // Intentionally NO effect on sheetReserve: dragging/snapping the sheet must
  // never call setCamera or re-bind centerCoordinate (that recentered to live GPS).

  // One-shot live GPS after permission when the map first opens.
  // Never re-runs on re-render; further locates only via recenter FAB.
  useEffect(() => {
    const mapActive = inline || visible;
    if (!mapActive || !autoLocateOnMount) return undefined;
    if (didAutoLocateRef.current) return undefined;
    didAutoLocateRef.current = true;
    // Slight delay so MapView/Camera native refs are ready for setCamera zoom.
    const t = setTimeout(() => {
      locateToLive({ fromUser: false });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on open
  }, [inline, visible, autoLocateOnMount]);

  /**
   * Coordinate UNDER the fixed delivery pin tip (not camera center, not live GPS).
   * Pin is screen-centered with optional upward offset for the checkout sheet.
   */
  const readPinCoordinate = useCallback(async () => {
    const layout = mapLayoutRef.current;
    const isImmersive = immersiveRef.current;
    // Same fixed offset as render — not live sheet height (sheet drag must not move tip).
    const pinTranslateY = frozenPinOffsetRef.current != null
      ? frozenPinOffsetRef.current
      : (isImmersive
        ? -Math.round(FIXED_CAMERA_SHEET_PAD * 0.5) + PIN_EXTRA_UP_Y
        : 0);

    // Preferred: screen point of the pin tip → geo (handles pitch + padding).
    if (
      mapboxAvailable
      && mapRef.current?.getCoordinateFromView
      && layout.width > 0
      && layout.height > 0
    ) {
      const x = layout.width / 2;
      const y = layout.height / 2 + pinTranslateY + PIN_TIP_OFFSET_Y;
      try {
        const c = await mapRef.current.getCoordinateFromView([x, y]);
        if (Array.isArray(c) && c.length >= 2) {
          const lng = Number(c[0]);
          const lat = Number(c[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            lastMapCenterRef.current = { latitude: lat, longitude: lng };
            return { lat, lng };
          }
        }
      } catch (_) { /* fall through */ }
    }

    // Fallback: camera center from last idle (user pan) — never live GPS alone.
    if (mapboxAvailable && mapRef.current?.getCenter) {
      try {
        const c = await mapRef.current.getCenter();
        if (Array.isArray(c) && c.length >= 2) {
          const lng = Number(c[0]);
          const lat = Number(c[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            lastMapCenterRef.current = { latitude: lat, longitude: lng };
            return { lat, lng };
          }
        }
      } catch (_) { /* fall through */ }
    }

    const tracked = lastMapCenterRef.current;
    if (tracked && Number.isFinite(tracked.latitude) && Number.isFinite(tracked.longitude)) {
      return { lat: tracked.latitude, lng: tracked.longitude };
    }

    // Last resort (map unavailable): seed center only — not a fresh GPS read.
    return {
      lat: Number(center.latitude),
      lng: Number(center.longitude),
    };
  }, [center.latitude, center.longitude]);

  const commitPin = useCallback(async ({ immediate = false } = {}) => {
    const run = async () => {
      try {
        // Cancel any in-flight live-GPS fly retries so Confirm never races a recenter.
        clearZoomRetries();
        locatingInFlightRef.current = false;
        // CRITICAL: sync Camera React props to the native map BEFORE parent
        // re-renders (sheet expand). Otherwise props still hold live GPS and
        // the map bounces back when Confirm expands the sheet.
        await syncCameraPropsFromNative();
        const { lat, lng } = await readPinCoordinate();
        if (Number.isFinite(lat) && Number.isFinite(lng) && typeof onConfirmRef.current === 'function') {
          lastMapCenterRef.current = { latitude: lat, longitude: lng };
          // Freeze pin Y at the fixed free-map offset (independent of sheet height).
          if (immersiveRef.current) {
            frozenPinOffsetRef.current =
              -Math.round(FIXED_CAMERA_SHEET_PAD * 0.5) + PIN_EXTRA_UP_Y;
          }
          setPinActive(true);
          // Do not move the camera — only save the pin under the marker.
          onConfirmRef.current(lat, lng);
        }
      } catch (_) { /* ignore */ }
    };
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (immediate) {
      await run();
      return;
    }
    // Debounce pan commits so reverse-geocode / cart calc aren't hammered.
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      run();
    }, 320);
  }, [readPinCoordinate, clearZoomRetries, syncCameraPropsFromNative]);

  const handleMapIdle = useCallback((state) => {
    const c = state?.properties?.center;
    if (Array.isArray(c) && c.length >= 2) {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        lastMapCenterRef.current = { latitude: lat, longitude: lng };
        // Keep controlled Camera props in sync so sheet re-renders don't snap
        // back to the old live-GPS centerCoordinate.
        setCameraTarget((prev) => {
          const [plng, plat] = prev.centerCoordinate || [];
          if (
            Number.isFinite(plng)
            && Number.isFinite(plat)
            && Math.abs(plng - lng) < 1e-8
            && Math.abs(plat - lat) < 1e-8
          ) {
            return prev;
          }
          return {
            ...prev,
            centerCoordinate: [lng, lat],
            animationMode: 'moveTo',
            animationDuration: 0,
          };
        });
      }
    }
  }, []);

  const handleMapTouchStart = useCallback(() => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      // User is taking control — stop live GPS fly retries and release Camera props
      // so sheet drag / re-renders cannot snap back to live GPS.
      userMovedMapRef.current = true;
      setFreeCamera(true);
      clearZoomRetries();
      locatingInFlightRef.current = false;
      liftPin();
      // Non-autoCommit: panning invalidates confirm until user confirms again.
      if (!autoCommitRef.current && pinActive) {
        frozenPinOffsetRef.current = null;
        setPinActive(false);
        onPinMoved?.();
      }
    }
    onMapTouchStart?.();
  }, [liftPin, onMapTouchStart, onPinMoved, pinActive, clearZoomRetries]);

  const handleMapTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dropPin();
      // Sync props as soon as the finger lifts (idle may lag).
      syncCameraPropsFromNative();
      if (autoCommitRef.current) {
        commitPin({ immediate: false });
      }
    }
    onMapTouchEnd?.();
  }, [dropPin, onMapTouchEnd, commitPin, syncCameraPropsFromNative]);

  useEffect(() => () => {
    if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    clearZoomRetries();
  }, [clearZoomRetries]);

  const handleConfirm = useCallback(async () => {
    if (confirming || recentering) return;
    setConfirming(true);
    setGpsError(null);
    try {
      await commitPin({ immediate: true });
    } finally {
      setConfirming(false);
    }
  }, [commitPin, confirming, recentering]);

  // Parent (checkout sheet) calls confirm / locate via mutable apiRef.
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      confirmLocation: handleConfirm,
      locateToLive: () => locateToLive({ fromUser: true }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, handleConfirm, locateToLive]);

  const fabBottom = immersive
    ? Math.max(sheetReserve + spacing.sm, spacing.sm + insets.bottom)
    : spacing.sm;
  const topPad = Math.max(insets.top, spacing.md);
  // Pin optical offset is FIXED (collapsed sheet size) so dragging the sheet
  // never slides the tip across the map / looks like a recenter.
  const pinTranslateY = (() => {
    if (!immersive) return 0;
    if (frozenPinOffsetRef.current != null) return frozenPinOffsetRef.current;
    return -Math.round(FIXED_CAMERA_SHEET_PAD * 0.5) + PIN_EXTRA_UP_Y;
  })();

  const content = (
    <>
      <View
        style={[
          styles.mapFrame,
          immersive
            ? styles.mapFrameImmersive
            : [inline && styles.mapFrameInline, fullBleed && styles.mapFrameFullBleed],
        ]}
      >
        <View
          style={[
            styles.mapWrap,
            immersive
              ? styles.mapWrapImmersive
              : [inline && styles.mapWrapInline, fullBleed && styles.mapWrapFullBleed],
          ]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout || {};
            if (width > 0 && height > 0) {
              mapLayoutRef.current = { width, height };
            }
          }}
          onTouchStart={handleMapTouchStart}
          onTouchMove={handleMapTouchStart}
          onTouchEnd={handleMapTouchEnd}
          onTouchCancel={handleMapTouchEnd}
        >
          {mapboxAvailable ? (
            <Mapbox.MapView
              ref={mapRef}
              style={styles.map}
              styleURL={Mapbox.StyleURL.SatelliteStreet}
              compassEnabled
              compassFadeWhenNorth
              compassViewMargins={immersive ? { x: 12, y: topPad } : undefined}
              pitchEnabled
              rotateEnabled
              logoEnabled={false}
              attributionEnabled={false}
              scaleBarEnabled={false}
              onMapIdle={handleMapIdle}
            >
              <Mapbox.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: cameraTarget.centerCoordinate,
                  zoomLevel: DEFAULT_ZOOM,
                  pitch: 55,
                  padding: cameraPadding,
                }}
                // After the user pans, free the camera — do not keep feeding
                // centerCoordinate (that snapped back to live GPS on sheet drag).
                {...(!freeCamera
                  ? {
                      centerCoordinate: cameraTarget.centerCoordinate,
                      zoomLevel: cameraTarget.zoomLevel,
                      animationMode: cameraTarget.animationMode,
                      animationDuration: cameraTarget.animationDuration,
                    }
                  : {})}
                pitch={55}
                padding={cameraPadding}
              />
            </Mapbox.MapView>
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.fallbackTitle}>Map unavailable</Text>
              <Text style={styles.fallbackBody}>
                Use your current location or type the address manually.
              </Text>
            </View>
          )}

          {mapboxAvailable ? (
            <View
              pointerEvents="none"
              style={[
                styles.pinWrap,
                pinTranslateY !== 0 && {
                  transform: [{ translateY: pinTranslateY }],
                },
              ]}
            >
              {/* Ground pulse ring — marks the exact map point under the tip */}
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.45, 0],
                    }),
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 1.65],
                        }),
                      },
                      {
                        scaleX: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.35],
                        }),
                      },
                      {
                        scaleY: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.75],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.pinIconOffset,
                  {
                    transform: [
                      {
                        translateY: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [PIN_TIP_OFFSET_Y, PIN_TIP_OFFSET_Y + PIN_LIFT_Y],
                        }),
                      },
                      {
                        scale: pinLift.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.06],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.pinLabel}>
                  <Text style={styles.pinLabelText}>Delivery</Text>
                </View>
                <View style={styles.pinHead}>
                  <View style={styles.pinHole} />
                </View>
                <View style={styles.pinTail} />
                <Animated.View
                  style={[
                    styles.pinShadow,
                    {
                      opacity: pinLift.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.35, 0.15],
                      }),
                      transform: [
                        {
                          scaleX: pinLift.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.6],
                          }),
                        },
                        {
                          scaleY: pinLift.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0.7],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </Animated.View>
            </View>
          ) : null}

          {/* Map gesture hint — pinch to zoom (immersive checkout). */}
          {immersive ? (
            <View
              pointerEvents="none"
              style={[
                styles.zoomHintRow,
                {
                  // Sit just above the sheet / recenter FAB (lower = closer to sheet).
                  bottom: Math.max(fabBottom + 12, spacing.md),
                },
              ]}
            >
              <View style={styles.zoomHintChip}>
                <Text style={styles.zoomHintText}>
                  Use two fingers to zoom in or out
                </Text>
              </View>
            </View>
          ) : null}

          {/* Blue live-location control + expanding rings (bottom-left on map) */}
          <View
            style={[styles.recenterFabWrap, { bottom: fabBottom }]}
            pointerEvents="box-none"
          >
            {!reducedMotion ? (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.recenterRing,
                    {
                      opacity: recenterRingA.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.55, 0],
                      }),
                      transform: [
                        {
                          scale: recenterRingA.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.15],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.recenterRing,
                    {
                      opacity: recenterRingB.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.55, 0],
                      }),
                      transform: [
                        {
                          scale: recenterRingB.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.15],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </>
            ) : null}
            <PressableScale
              style={styles.recenterFab}
              onPress={() => locateToLive({ fromUser: true })}
              disabled={recentering || confirming}
              scaleTo={0.92}
              accessibilityRole="button"
              accessibilityLabel="Recenter to live location"
            >
              {recentering ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <AppIcon name="locate" size={15} color="#fff" />
              )}
            </PressableScale>
          </View>
        </View>
      </View>

      {!hideActions && gpsError ? (
        <Text
          style={[
            styles.gpsErrorText,
            inline && styles.gpsErrorTextInline,
            fullBleed && styles.gpsErrorTextFullBleed,
          ]}
        >
          {gpsError}
        </Text>
      ) : null}

      {!hideActions ? (
        <View style={[styles.actions, inline && styles.actionsInline, fullBleed && styles.actionsFullBleed]}>
          {showConfirmHint ? (
            <View style={styles.confirmHintLine} accessibilityLiveRegion="polite">
              <Text style={styles.confirmHintText}>Press this button to confirm</Text>
            </View>
          ) : null}
          <Animated.View
            style={{
              opacity: confirmEnter,
              transform: [
                {
                  translateY: confirmEnter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
                {
                  scale: confirmEnter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            }}
          >
            <PressableScale
              style={[
                styles.actionBtn,
                pinActive ? styles.actionBtnPrimary : styles.actionBtnSecondary,
                showConfirmHint && styles.actionBtnHinted,
              ]}
              onPress={handleConfirm}
              disabled={confirming}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Confirm location"
              accessibilityState={{ selected: pinActive }}
            >
              <View
                style={[
                  styles.actionIconWrap,
                  pinActive ? styles.actionIconWrapPrimary : styles.actionIconWrapSecondary,
                ]}
              >
                {confirming ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      pinActive
                        ? (colors.textInverse || '#fff')
                        : (colors.saffronDark || colors.primary)
                    }
                  />
                ) : (
                  <AppIcon
                    name="check"
                    size={16}
                    color={
                      pinActive
                        ? (colors.textInverse || '#fff')
                        : (colors.saffronDark || colors.primary)
                    }
                  />
                )}
              </View>
              <View style={styles.actionTextCol}>
                <Text
                  style={pinActive ? styles.actionTitlePrimary : styles.actionTitleSecondary}
                  numberOfLines={1}
                >
                  {confirming ? 'Saving…' : 'Confirm location'}
                </Text>
                <Text
                  style={pinActive ? styles.actionSubtitlePrimary : styles.actionSubtitle}
                  numberOfLines={2}
                >
                  Press when you are pinned to delivery location
                </Text>
              </View>
            </PressableScale>
          </Animated.View>

          {typeof onEnterManually === 'function' ? (
            <PressableScale
              style={styles.tertiaryBtn}
              onPress={onEnterManually}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Enter address manually"
            >
              <AppIcon name="pencil" size={14} color={colors.textSecondary} />
              <Text style={styles.tertiaryBtnText}>Enter manually</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <View
        style={[
          styles.inlineCard,
          fullBleed && styles.inlineCardFullBleed,
          immersive && styles.inlineCardImmersive,
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Pin delivery location</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

          {content}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gpsErrorText: {
    ...typography.caption,
    color: colors.error,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  gpsErrorTextInline: {
    paddingHorizontal: 0,
  },
  gpsErrorTextFullBleed: {
    paddingHorizontal: spacing.lg,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayDark || 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgApp,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    ...(shadows.lg || {}),
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    ...(typography.h3 || typography.label || {}),
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  closeBtnText: {
    ...(typography.label || {}),
    color: colors.saffronDark || colors.primary,
    fontWeight: '600',
  },
  inlineCard: {
    marginTop: spacing.sm,
  },
  inlineCardFullBleed: {
    marginTop: 0,
  },
  inlineCardImmersive: {
    flex: 1,
    marginTop: 0,
  },
  mapFrame: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 3,
    borderColor: '#000000',
    padding: 0,
  },
  mapFrameInline: {
    marginHorizontal: 0,
  },
  mapFrameFullBleed: {
    // True edge-to-edge — cancels parent horizontal padding/safe-area inset gaps.
    width: Dimensions.get('window').width,
    alignSelf: 'center',
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#000000',
    backgroundColor: '#000000',
    padding: 0,
  },
  mapFrameImmersive: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: '#000000',
    padding: 0,
  },
  mapWrap: {
    height: 320,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    position: 'relative',
  },
  mapWrapInline: {
    height: 200,
  },
  mapWrapFullBleed: {
    height: 340,
    borderRadius: 0,
  },
  mapWrapImmersive: {
    flex: 1,
    height: '100%',
    minHeight: 0,
    borderRadius: 0,
  },
  map: {
    flex: 1,
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
  // Blue my-location control (bottom-left) with expanding ring halo.
  recenterFabWrap: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  recenterRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: RECENTER_BLUE_RING,
    backgroundColor: 'transparent',
  },
  recenterFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RECENTER_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    ...shadows.md,
  },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.55)',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  pinIconOffset: {
    alignItems: 'center',
  },
  pinHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CUSTOMER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    zIndex: 3,
    ...shadows.md,
  },
  pinHole: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  pinTail: {
    width: 12,
    height: 12,
    marginTop: -8,
    backgroundColor: CUSTOMER_DARK,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  pinLabel: {
    // Sit clearly above the pin head (not tight against it).
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill || 100,
    backgroundColor: CUSTOMER_COLOR,
    zIndex: 4,
    ...shadows.xs,
  },
  pinLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    marginTop: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackTitle: {
    ...(typography.h3 || {}),
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  fallbackBody: {
    ...(typography.caption || {}),
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionsInline: {
    paddingHorizontal: 0,
  },
  actionsFullBleed: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  confirmHintLine: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: 2,
  },
  confirmHintText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  actionBtn: {
    alignSelf: 'stretch',
    minHeight: 58,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionBtnSecondary: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    ...shadows.sm,
  },
  actionBtnPrimary: {
    backgroundColor: colors.saffron || colors.primary,
    borderWidth: 1.5,
    borderColor: colors.saffronDark || colors.primaryDark || colors.primary,
    ...shadows.md,
  },
  actionBtnHinted: {
    borderColor: colors.saffron || colors.primary,
    borderWidth: 2,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapSecondary: {
    backgroundColor: colors.saffronLight || colors.primaryLight || '#FFF2EB',
    borderWidth: 1,
    borderColor: (colors.saffron || colors.primary) + '40',
  },
  actionIconWrapPrimary: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  actionTitleSecondary: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionTitlePrimary: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: colors.textInverse || '#fff',
  },
  actionSubtitle: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  actionSubtitlePrimary: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
  },
  tertiaryBtn: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tertiaryBtnText: {
    ...(typography.label || {}),
    color: colors.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
