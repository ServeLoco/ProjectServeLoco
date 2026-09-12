import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppState,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import AppIcon from '../../components/AppIcon';
import AnimatedRouteLine from '../../components/AnimatedRouteLine';
import {
  remainingSecondsFromExpiresAt,
  formatCountdown,
} from '../../utils/riderOfferTime';
import { Mapbox, mapboxAvailable } from '../../utils/mapbox';

const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Small zoomable/pannable pin preview for the drop-off — rider's live GPS +
 * a driving route are added once location resolves, and the camera fits
 * both pins (and the route) into frame so neither is cropped out. */
function DropoffMap({ latitude, longitude }) {
  // MapView's native SurfaceView doesn't reliably pick up a percentage/flex
  // width from its RN parent on first mount — it can size to its measured-0
  // layout pass and never re-expand. Measuring the wrap and handing the
  // MapView an explicit pixel width sidesteps that.
  const [mapWidth, setMapWidth] = useState(null);
  const onWrapLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setMapWidth(w);
  }, []);

  const cameraRef = useRef(null);
  const [riderCoord, setRiderCoord] = useState(null);
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const routeCoordsRef = useRef([]);
  // fitBounds is a command dispatched to the Camera's NATIVE view. Issued
  // before that view exists, or after this sheet has been torn down (accepting
  // from the floating card resumes the app and closes the offer almost in the
  // same breath), Mapbox never resolves the view tag and logs
  // "ViewTagResolver | view: N but is null". Only talk to the camera between
  // the map reporting itself loaded and this component going away.
  const [mapLoaded, setMapLoaded] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // One-shot GPS fix — this preview doesn't need a live watch, just "roughly
  // how far away am I" while the rider decides to accept/reject.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Never ASK from the background. Expo's request opens the system
      // permission dialog as a background activity start, which drags the whole
      // app to the front on top of whatever the rider is doing — the exact
      // thing an offer arriving while minimized must not do. A map preview is
      // not worth that, so only prompt while this popup is really on screen.
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (AppState.currentState !== 'active') return;
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (cancelled || status !== 'granted') return;
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude: lat, longitude: lng } = current?.coords || {};
        if (!cancelled && Number.isFinite(lat) && Number.isFinite(lng)) {
          setRiderCoord({ latitude: lat, longitude: lng });
        }
      } catch (_) { /* ignore — preview just shows the drop-off pin alone */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // One-shot driving route rider -> drop-off, once the GPS fix resolves.
  useEffect(() => {
    if (!riderCoord) return undefined;
    const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const coordStr =
          `${riderCoord.longitude},${riderCoord.latitude};${longitude},${latitude}`;
        const url =
          `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
          `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (!cancelled && Array.isArray(coords) && coords.length >= 2) {
          routeCoordsRef.current = coords;
          setRouteGeoJson({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          });
        }
      } catch (_) { /* ignore — falls back to pin-only bounds */ }
    })();
    return () => { cancelled = true; };
  }, [riderCoord, latitude, longitude]);

  // Fit both pins (and the route, so a curving road never bows out of frame)
  // once the rider's location is known.
  useEffect(() => {
    if (!mapLoaded || !riderCoord || !cameraRef.current || !aliveRef.current) return;
    try {
      const lngs = [longitude, riderCoord.longitude, ...routeCoordsRef.current.map((c) => c[0])];
      const lats = [latitude, riderCoord.latitude, ...routeCoordsRef.current.map((c) => c[1])];
      cameraRef.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [40, 40, 40, 40],
        500,
      );
    } catch (_) { /* ignore */ }
  }, [mapLoaded, riderCoord, latitude, longitude, routeGeoJson]);

  return (
    <View style={styles.dropoffMapWrap} onLayout={onWrapLayout}>
      <Mapbox.MapView
        style={[styles.dropoffMap, mapWidth ? { width: mapWidth } : null]}
        scaleBarEnabled={false}
        logoEnabled={false}
        onDidFinishLoadingMap={() => {
          if (aliveRef.current) setMapLoaded(true);
        }}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [longitude, latitude], zoomLevel: 15 }}
        />

        <AnimatedRouteLine
          routeGeoJson={routeGeoJson}
          active={Boolean(routeGeoJson)}
          idPrefix="offer-preview"
        />

        <Mapbox.MarkerView
          id="offer-dropoff"
          coordinate={[longitude, latitude]}
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.dropoffPinRoot}>
            <View style={styles.dropoffPinHead}>
              <AppIcon name="map" size={14} color={colors.textInverse} />
            </View>
            <View style={styles.dropoffPinTail} />
          </View>
        </Mapbox.MarkerView>

        {riderCoord ? (
          <Mapbox.MarkerView
            id="offer-rider"
            coordinate={[riderCoord.longitude, riderCoord.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.riderDotWrap}>
              <Text style={styles.riderDotEmoji}>🛵</Text>
            </View>
          </Mapbox.MarkerView>
        ) : null}
      </Mapbox.MapView>
    </View>
  );
}

/**
 * Premium non-dismissible Accept/Reject offer modal — bottom sheet, Uber-style.
 * Same data/handlers/conditionals as before, restyled to slide up from the
 * bottom instead of a centered card.
 * Countdown is always derived from server expiresAt.
 */
// Fallback only — the real total now rides on offer.offerTimeoutSec so the
// progress bar can't silently drift if RIDER_OFFER_TIMEOUT_SEC is overridden
// via env without a matching client release.
const DEFAULT_OFFER_TIMEOUT_SEC = 150;

const SCREEN_HEIGHT = Dimensions.get('window').height;

/**
 * @param {object} props
 * @param {object} props.offer - current front-of-queue offer
 * @param {number} [props.queueIndex=0] - 0-based index in offer queue
 * @param {number} [props.queueTotal=1] - total pending offers
 * @param {number} [props.activeJobCount=0] - already-accepted jobs
 */
export default function RiderOfferPopup({
  offer: offerProp,
  onAccept,
  onReject,
  hasActiveJobs = false,
  queueIndex = 0,
  queueTotal = 1,
  activeJobCount = 0,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // The sheet has to survive its own offer disappearing, or accept/reject would
  // rip it off screen with no exit animation. Keep drawing the last offer while
  // the slide-down plays, then stop rendering entirely.
  const [leaving, setLeaving] = useState(false);
  const lastOfferRef = useRef(null);
  if (offerProp) lastOfferRef.current = offerProp;
  const offer = offerProp || (leaving ? lastOfferRef.current : null);

  // Heavy children (the Mapbox preview) mount only after the entrance has
  // finished. Inflating a map mid-slide is what made the sheet hitch on its
  // way up — the animation is on the UI thread, but the map's first layout is
  // not, and it lands squarely in the middle of the transition.
  const [contentReady, setContentReady] = useState(false);


  const enter = useRef(new Animated.Value(0)).current;
  // Drives the Accept button's own countdown fill. One continuous Animated.timing
  // per offer (from however much time is left down to 0) instead of snapping
  // a width to a new value every second — that's what makes it read as a
  // smooth drain instead of a series of 1s jumps.
  const progressAnim = useRef(new Animated.Value(1)).current;
  const offerKey = offer?.id || offer?.offerId;

  useEffect(() => {
    if (!offerProp) return undefined;
    setContentReady(false);
    enter.setValue(0);
    // Spring, not a 180ms timing: the sheet travels most of the screen height,
    // and at that distance a short ease-out with an overshoot curve reads as a
    // snap that bounces past its resting place. This settles instead.
    const anim = Animated.spring(enter, {
      toValue: 1,
      damping: 24,
      stiffness: 210,
      mass: 0.9,
      overshootClamping: true,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setContentReady(true);
    });
    // Never leave the map unmounted if the spring is interrupted.
    const fallback = setTimeout(() => setContentReady(true), 600);
    return () => {
      anim.stop();
      clearTimeout(fallback);
    };
    // offerKey only — a re-fetch that swaps `offer` for a fresher object with
    // the same id must not replay the entrance animation (looked like the
    // popup opening twice).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey, enter]);

  // Slide back down when the offer is answered or expires, instead of vanishing.
  useEffect(() => {
    if (offerProp) {
      setLeaving(false);
      return undefined;
    }
    if (!lastOfferRef.current) return undefined;
    setLeaving(true);
    const anim = Animated.timing(enter, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) {
        lastOfferRef.current = null;
        setLeaving(false);
      }
    });
    return () => anim.stop();
  }, [offerProp, enter]);

  useEffect(() => {
    if (!offer) return undefined;
    const expiresAt = offer.expiresAt || offer.expires_at;
    const totalSec = offer.offerTimeoutSec || offer.offer_timeout_sec || DEFAULT_OFFER_TIMEOUT_SEC;
    const remainingMs = expiresAt
      ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
      : totalSec * 1000;
    const startValue = totalSec > 0 ? Math.min(1, remainingMs / 1000 / totalSec) : 0;
    progressAnim.setValue(startValue);
    if (remainingMs <= 0) return undefined;
    // This one animates a width, so it cannot use the native driver and every
    // frame of it lands on the JS thread. Held back until the sheet has
    // finished travelling, so it is not competing with the entrance.
    if (!contentReady) return undefined;
    const anim = Animated.timing(progressAnim, {
      toValue: 0,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey, progressAnim, contentReady]);

  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [offerKey]);

  useEffect(() => {
    if (!offer) return undefined;
    const expiresAt = offer.expiresAt || offer.expires_at;
    const tick = () => setSecondsLeft(remainingSecondsFromExpiresAt(expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey]);

  const handleAccept = useCallback(async () => {
    setError(null);
    setBusy('accept');
    try {
      await onAccept(offer);
    } catch (err) {
      setError(err?.message || 'Could not accept. Try again.');
      setBusy(null);
    }
  }, [offer, onAccept]);

  const handleReject = useCallback(async () => {
    setError(null);
    setBusy('reject');
    try {
      await onReject(offer);
    } catch (err) {
      setError(err?.message || 'Could not reject. Try again.');
      setBusy(null);
    }
  }, [offer, onReject]);

  if (!offer) return null;

  // Travel a full screen height rather than a fixed 420: the sheet grows to
  // 88% of the screen on a long offer, and anything shorter than its real
  // height leaves a strip of it already visible before it starts moving.
  // Measuring instead would change the distance mid-flight and jump.
  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  // Dim with the sheet. A backdrop that snaps to full black the instant the
  // offer lands, while the sheet is still travelling, is most of what made
  // this feel abrupt.
  const backdropOpacity = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const countdownLabel = formatCountdown(secondsLeft);
  const countdownUrgent = secondsLeft <= 30;
  const shops = offer.shops || [];
  const items = offer.items || [];
  const phone = offer.phone;
  const isFast = offer.deliveryType === 'fast' || offer.delivery_type === 'fast';
  const dropoffLat = numOrNull(offer.latitude ?? offer.lat);
  const dropoffLng = numOrNull(offer.longitude ?? offer.lng);
  const hasDropoffPin = mapboxAvailable && dropoffLat != null && dropoffLng != null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}}>
      <View style={styles.overlayRoot}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />

          <View style={styles.badgeRow}>
            <View style={[styles.timerChip, countdownUrgent && styles.timerChipUrgent]}>
              <AppIcon
                name="clock"
                size={13}
                color={countdownUrgent ? colors.error : colors.saffronDark}
              />
              <Text style={[styles.timerChipText, countdownUrgent && styles.timerChipTextUrgent]}>
                {secondsLeft > 0 ? countdownLabel : '0:00'}
              </Text>
            </View>
            <View style={[styles.deliveryTypeBadge, isFast && styles.deliveryTypeBadgeFast]}>
              <AppIcon
                name="navigation"
                size={12}
                color={colors.textInverse}
              />
              <Text style={[styles.deliveryTypeBadgeText, isFast && styles.deliveryTypeBadgeTextFast]}>
                {isFast ? 'Fast' : 'Standard'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.rejectPill}
              activeOpacity={0.8}
              onPress={handleReject}
              disabled={busy !== null}
            >
              {busy === 'reject' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.rejectPillText}>Reject</Text>
              )}
            </TouchableOpacity>
          </View>

          {queueTotal > 1 ? (
            <View style={styles.queueBanner}>
              <AppIcon name="orders" size={14} color={colors.saffronDark} />
              <Text style={styles.queueBannerText}>
                Offer {Math.min(queueIndex + 1, queueTotal)} of {queueTotal}
                {queueTotal - queueIndex - 1 > 0
                  ? ` · ${queueTotal - queueIndex - 1} more waiting`
                  : ''}
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollBodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={styles.orderNumber}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              Order #{offer.orderNumber || offer.order_number}
            </Text>

            {(offer.customerName || offer.customer_name || phone) ? (
              <View style={styles.customerCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>
                    {offer.customerName || offer.customer_name || 'Customer'}
                  </Text>
                  {phone ? <Text style={styles.customerPhone}>{phone}</Text> : null}
                </View>
                {phone ? (
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${phone}`)}
                    activeOpacity={0.85}
                  >
                    <AppIcon name="phone" size={16} color={colors.info} />
                    <Text style={styles.callBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {(hasActiveJobs || activeJobCount > 0) ? (
              <Text style={styles.multiJobHint}>
                {activeJobCount > 0
                  ? `You already have ${activeJobCount} active ${
                    activeJobCount === 1 ? 'delivery' : 'deliveries'
                  } — accept to add this to your job queue.`
                  : 'You already have active deliveries — accept to add this to your job queue.'}
              </Text>
            ) : null}

            {/* Trip-style route: pickup shop(s), Uber-esque numbered markers */}
            {(shops.length > 0 || (offer.address && !hasDropoffPin)) ? (
              <View style={styles.routeCard}>
                {shops.map((s, idx) => (
                  <View key={s.id} style={styles.routeRow}>
                    <View style={styles.routeMarkerCol}>
                      <View style={styles.routeDot}>
                        <Text style={styles.routeDotText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.routeLine} />
                    </View>
                    <View style={styles.routeTextCol}>
                      <Text style={styles.routeLabel}>Pickup</Text>
                      <Text style={styles.routeText}>{s.name}</Text>
                    </View>
                  </View>
                ))}
                {(offer.address && !hasDropoffPin) ? (
                  <View style={[styles.routeRow, styles.routeRowLast]}>
                    <View style={styles.routeMarkerCol}>
                      <View style={styles.routeSquare} />
                    </View>
                    <View style={styles.routeTextCol}>
                      <Text style={styles.routeLabel}>Drop-off</Text>
                      <Text style={styles.routeText}>{offer.address}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Drop-off pin: full-bleed map, no label/marker chrome. The
                placeholder holds the exact map height so mounting it after the
                entrance does not resize the sheet under the rider's thumb. */}
            {hasDropoffPin ? (
              contentReady
                ? <DropoffMap latitude={dropoffLat} longitude={dropoffLng} />
                : <View style={[styles.dropoffMapWrap, styles.dropoffMapPlaceholder]} />
            ) : null}

            {items.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Order items</Text>
                <View style={styles.itemsCard}>
                  {items.map((it, idx) => {
                    const shopName = it.shopName || it.shop_name;
                    return (
                      <View
                        key={it.id ?? idx}
                        style={[styles.itemRow, idx === items.length - 1 && styles.itemRowLast]}
                      >
                        <Text style={styles.itemQty}>{it.quantity}x</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {it.productName || it.product_name}
                            {shopName ? <Text style={styles.itemShopName}> · {shopName}</Text> : null}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {offer.total != null ? (
                    <View style={[styles.itemRow, styles.itemRowLast, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Order total</Text>
                      <Text style={styles.totalValue}>₹{Number(offer.total).toFixed(0)}</Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {error ? (
              <View style={styles.errorPill}>
                <AppIcon name="close" size={14} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <SafeAreaView edges={['bottom']} style={styles.actionRow}>
            <SlideToAcceptButton
              label="Slide to accept order"
              busy={busy === 'accept'}
              disabled={busy !== null || secondsLeft <= 0}
              onConfirm={handleAccept}
              progressAnim={progressAnim}
            />
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const THUMB_SIZE = 52;
const TRACK_PAD = 5;

function SlideToAcceptButton({ label, busy, disabled, onConfirm, progressAnim }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - TRACK_PAD * 2, 1);
  const maxTranslateRef = useRef(maxTranslate);
  useEffect(() => { maxTranslateRef.current = maxTranslate; }, [maxTranslate]);

  const translateX = useRef(new Animated.Value(0)).current;
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    wasBusyRef.current = busy;
  }, [busy, translateX]);

  // Chevrons nudge right inside the thumb — hints "keep sliding"
  const arrowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [arrowAnim]);
  const chevronShift = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

  // PanResponder is created once — read gating flags from refs (kept in sync
  // below) so a stale closure never freezes "disabled"/"busy" from mount time.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !busyRef.current,
      onMoveShouldSetPanResponder: (evt, gesture) => (
        !disabledRef.current && !busyRef.current && Math.abs(gesture.dx) > 4
      ),
      onPanResponderMove: (evt, gesture) => {
        const x = Math.min(Math.max(gesture.dx, 0), maxTranslateRef.current);
        translateX.setValue(x);
      },
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx >= maxTranslateRef.current * 0.7) {
          Animated.timing(translateX, {
            toValue: maxTranslateRef.current,
            duration: 150,
            useNativeDriver: false,
          }).start();
          onConfirmRef.current();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
        }
      },
    })
  ).current;

  const textOpacity = translateX.interpolate({
    inputRange: [0, Math.max(maxTranslate * 0.6, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.slideTrack, { opacity: disabled && !busy ? 0.6 : 1 }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={[colors.btnInfoStart, colors.btnInfoEnd]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      {progressAnim ? (
        // Countdown IS the track's own background now — a dark wash that
        // smoothly drains left-to-right as the offer's timer runs out.
        <Animated.View
          pointerEvents="none"
          style={[
            styles.acceptFillOverlay,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      ) : null}
      <Animated.Text style={[styles.slideTrackText, { opacity: textOpacity }]}>
        {label}
      </Animated.Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.slideThumb, { transform: [{ translateX }] }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.info} />
        ) : (
          <View style={styles.slideThumbChevrons}>
            <Animated.View style={{ transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={colors.info} />
            </Animated.View>
            <Animated.View style={{ marginLeft: -14, transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={colors.info} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayDark,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    ...shadows.modal,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  rejectPill: {
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rejectPillText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.saffronLight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timerChipUrgent: { backgroundColor: colors.errorLight },
  timerChipText: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.saffronDark,
    fontVariant: ['tabular-nums'],
  },
  timerChipTextUrgent: { color: colors.error },
  deliveryTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.info,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deliveryTypeBadgeFast: { backgroundColor: colors.saffron },
  deliveryTypeBadgeText: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.textInverse,
  },
  deliveryTypeBadgeTextFast: { color: colors.textInverse },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.warningLight || colors.saffronLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  queueBannerText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.saffronDark || colors.warning,
  },

  scrollBody: { flexGrow: 0 },
  scrollBodyContent: { paddingBottom: spacing.xs },

  orderNumber: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  multiJobHint: {
    ...typography.caption,
    color: colors.info || colors.saffronDark,
    backgroundColor: colors.infoLight || colors.saffronLight,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  // Uber-style trip block: numbered dot per pickup shop, square for drop-off,
  // connected by a vertical line — replaces the old separate address/shops cards.
  routeCard: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  routeRow: { flexDirection: 'row', gap: spacing.md },
  routeRowLast: {},
  routeMarkerCol: { alignItems: 'center', width: 22 },
  routeDot: {
    width: 20,
    height: 20,
    borderRadius: radius.circle,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDotText: { color: colors.saffronDark, fontWeight: '800', fontSize: 11 },
  routeSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.textPrimary,
    marginTop: 4,
  },
  routeLine: {
    flex: 1,
    minHeight: 18,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  routeTextCol: { flex: 1, paddingBottom: spacing.sm },
  routeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.saffronDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 20,
  },
  dropoffMapWrap: {
    width: '100%',
    alignSelf: 'stretch',
    height: 190,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  dropoffMap: { flex: 1 },
  dropoffMapPlaceholder: { backgroundColor: colors.bgSkeletonBase },
  dropoffPinRoot: { alignItems: 'center' },
  dropoffPinHead: {
    width: 28,
    height: 28,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSurface,
    ...shadows.sm,
  },
  dropoffPinTail: {
    width: 10,
    height: 10,
    marginTop: -6,
    backgroundColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  riderDotWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    borderWidth: 2,
    borderColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  riderDotEmoji: { fontSize: 16 },

  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  customerName: { ...typography.body, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  customerPhone: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.infoLight,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  callBtnText: { color: colors.info, fontWeight: '800', fontSize: 13 },

  sectionLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  itemsCard: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemRowLast: { borderBottomWidth: 0 },
  totalRow: { justifyContent: 'space-between' },
  totalLabel: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },
  itemQty: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.saffronDark,
    minWidth: 28,
  },
  itemName: { flex: 1, ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  itemShopName: { fontSize: 11, fontWeight: '700', color: colors.saffronDark },

  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontWeight: '600', fontSize: 13, flexShrink: 1 },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  acceptFillOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  slideTrack: {
    flex: 1,
    height: THUMB_SIZE + TRACK_PAD * 2,
    borderRadius: radius.circle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: TRACK_PAD,
  },
  slideTrackText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    paddingLeft: THUMB_SIZE + TRACK_PAD * 2,
  },
  slideThumb: {
    position: 'absolute',
    left: TRACK_PAD,
    top: TRACK_PAD,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.circle,
    backgroundColor: colors.textInverse,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  slideThumbChevrons: { flexDirection: 'row', alignItems: 'center' },
});
