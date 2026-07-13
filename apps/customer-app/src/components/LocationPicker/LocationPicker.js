import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  Mapbox,
  DEFAULT_MAP_CENTER,
  mapboxAvailable,
} from '../../utils/mapbox';

const GPS_TIMEOUT_MS = 8000;

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
 * `inline`: renders as a plain embedded card (no Modal/overlay/close button)
 * instead of a bottom sheet — used on the checkout screen so the map sits
 * directly under the Current Location / Enter Manually cards.
 * `autoConfirmOnLocate`: when true, a successful "use my current location"
 * fetch also calls onConfirm immediately (no separate confirm tap needed) —
 * used for the checkout inline map so tapping Current Location both pins
 * and confirms the address in one step.
 * `fullBleed`: edge-to-edge immersive map (no horizontal margin/radius, taller)
 * — used when the map is the top of the page rather than embedded in a card.
 * `onEnterManually`: when provided, renders a third "Enter Manually" action
 * alongside Use my current location / Confirm location.
 */
export default function LocationPicker({
  visible,
  initialCenter,
  onConfirm,
  onClose,
  inline = false,
  autoConfirmOnLocate = false,
  fullBleed = false,
  onEnterManually,
  onMapTouchStart,
  onMapTouchEnd,
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  const center = initialCenter || DEFAULT_MAP_CENTER;
  const centerCoordinate = [Number(center.longitude), Number(center.latitude)];

  useEffect(() => {
    if ((!inline && !visible) || !mapboxAvailable) return;
    // Reset camera when the map (re)opens with a new center.
    try {
      cameraRef.current?.setCamera?.({
        centerCoordinate,
        zoomLevel: 13,
        animationDuration: 0,
      });
    } catch (_) { /* ignore */ }
  }, [inline, visible, centerCoordinate[0], centerCoordinate[1]]);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await getPositionWithTimeout();
      const { latitude, longitude } = position.coords;
      const next = [longitude, latitude];
      try {
        cameraRef.current?.setCamera?.({
          centerCoordinate: next,
          zoomLevel: 16,
          animationDuration: 500,
        });
      } catch (_) { /* ignore */ }
      if (autoConfirmOnLocate && typeof onConfirm === 'function') {
        onConfirm(latitude, longitude);
      }
    } catch (_) {
      setGpsError('Could not get your location. Pan the map to pin it instead.');
    } finally {
      setLocating(false);
    }
  }, [autoConfirmOnLocate, onConfirm]);

  const handleConfirm = useCallback(async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      let lat = Number(center.latitude);
      let lng = Number(center.longitude);

      if (mapboxAvailable && mapRef.current?.getCenter) {
        try {
          const c = await mapRef.current.getCenter();
          if (Array.isArray(c) && c.length >= 2) {
            lng = Number(c[0]);
            lat = Number(c[1]);
          }
        } catch (_) { /* fall through to center */ }
      } else if (!mapboxAvailable) {
        // Fallback: one-shot GPS if map unavailable (today's checkout behavior).
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const position = await getPositionWithTimeout();
            lat = position.coords.latitude;
            lng = position.coords.longitude;
          }
        } catch (_) { /* keep DEFAULT / initial */ }
      }

      if (Number.isFinite(lat) && Number.isFinite(lng) && typeof onConfirm === 'function') {
        onConfirm(lat, lng);
      }
    } finally {
      setConfirming(false);
    }
  }, [center.latitude, center.longitude, confirming, onConfirm]);

  const content = (
    <>
      <View
        style={[styles.mapWrap, inline && styles.mapWrapInline, fullBleed && styles.mapWrapFullBleed]}
        onTouchStart={onMapTouchStart}
        onTouchMove={onMapTouchStart}
        onTouchEnd={onMapTouchEnd}
        onTouchCancel={onMapTouchEnd}
      >
        {mapboxAvailable ? (
          <Mapbox.MapView
            ref={mapRef}
            style={styles.map}
            styleURL={Mapbox.StyleURL.SatelliteStreet}
            compassEnabled={false}
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
          >
            <Mapbox.Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate,
                zoomLevel: 15,
              }}
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
          <View pointerEvents="none" style={styles.pinWrap}>
            <View style={styles.pinIconOffset}>
              <View style={styles.pinHead}>
                <View style={styles.pinHighlight} />
                <View style={styles.pinHole} />
              </View>
              <View style={styles.pinTail} />
              <View style={styles.pinShadow} />
            </View>
          </View>
        ) : null}
      </View>

      {gpsError ? (
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

      <View style={[styles.actions, inline && styles.actionsInline, fullBleed && styles.actionsFullBleed]}>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.actionsRowBtn]}
            onPress={handleUseCurrentLocation}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
          >
            {locating ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Use current location</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, styles.actionsRowBtn]}
            onPress={handleConfirm}
            disabled={confirming}
            accessibilityRole="button"
            accessibilityLabel="Confirm location"
          >
            {confirming ? (
              <ActivityIndicator color={colors.textInverse || '#fff'} />
            ) : (
              <Text style={styles.primaryBtnText} numberOfLines={1}>Confirm location</Text>
            )}
          </TouchableOpacity>
        </View>

        {typeof onEnterManually === 'function' ? (
          <TouchableOpacity
            style={styles.tertiaryBtn}
            onPress={onEnterManually}
            accessibilityRole="button"
            accessibilityLabel="Enter address manually"
          >
            <Text style={styles.tertiaryBtnText}>Enter Manually</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );

  if (inline) {
    return (
      <View style={[styles.inlineCard, fullBleed && styles.inlineCardFullBleed]}>
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
  mapWrap: {
    height: 320,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
  },
  mapWrapInline: {
    height: 200,
    marginHorizontal: 0,
  },
  mapWrapFullBleed: {
    height: 340,
    marginHorizontal: 0,
    borderRadius: 0,
  },
  map: {
    flex: 1,
  },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinIconOffset: {
    alignItems: 'center',
    transform: [{ translateY: -22 }],
  },
  pinHead: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    ...shadows.md,
  },
  pinHighlight: {
    position: 'absolute',
    top: 5,
    left: 7,
    width: 14,
    height: 9,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.4)',
    transform: [{ rotate: '-25deg' }],
  },
  pinHole: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.white || '#fff',
  },
  pinTail: {
    width: 16,
    height: 16,
    marginTop: -12,
    backgroundColor: colors.error,
    transform: [{ rotate: '45deg' }],
    borderBottomRightRadius: 3,
    zIndex: 1,
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionsRowBtn: {
    flex: 1,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  secondaryBtnText: {
    ...(typography.label || {}),
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  primaryBtnText: {
    ...(typography.label || {}),
    color: colors.primaryText || colors.textInverse || '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  tertiaryBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  tertiaryBtnText: {
    ...(typography.label || {}),
    color: colors.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
