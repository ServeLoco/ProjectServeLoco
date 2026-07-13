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

/**
 * Interactive map location picker (Feature A).
 * Fixed center pin; map pans underneath. Parent reverse-geocodes on confirm.
 */
export default function LocationPicker({
  visible,
  initialCenter,
  onConfirm,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const center = initialCenter || DEFAULT_MAP_CENTER;
  const centerCoordinate = [Number(center.longitude), Number(center.latitude)];

  useEffect(() => {
    if (!visible || !mapboxAvailable) return;
    // Reset camera when sheet opens with a new center.
    try {
      cameraRef.current?.setCamera?.({
        centerCoordinate,
        zoomLevel: 15,
        animationDuration: 0,
      });
    } catch (_) { /* ignore */ }
  }, [visible, centerCoordinate[0], centerCoordinate[1]]);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = position.coords;
      const next = [longitude, latitude];
      try {
        cameraRef.current?.setCamera?.({
          centerCoordinate: next,
          zoomLevel: 16,
          animationDuration: 500,
        });
      } catch (_) { /* ignore */ }
    } catch (_) {
      // Permission denied or GPS failure — silent no-op (parent still can confirm).
    } finally {
      setLocating(false);
    }
  }, []);

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
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
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

          <View style={styles.mapWrap}>
            {mapboxAvailable ? (
              <Mapbox.MapView
                ref={mapRef}
                style={styles.map}
                styleURL={Mapbox.StyleURL.Street}
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
                  Use your current location or close and type the address manually.
                </Text>
              </View>
            )}

            {mapboxAvailable ? (
              <View pointerEvents="none" style={styles.pinWrap}>
                <View style={styles.pin} />
                <View style={styles.pinStem} />
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleUseCurrentLocation}
              disabled={locating}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
            >
              {locating ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryBtnText}>Use my current location</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleConfirm}
              disabled={confirming}
              accessibilityRole="button"
              accessibilityLabel="Confirm location"
            >
              {confirming ? (
                <ActivityIndicator color={colors.textInverse || '#fff'} />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm location</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  mapWrap: {
    height: 320,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
  },
  map: {
    flex: 1,
  },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white || '#fff',
    marginBottom: -2,
  },
  pinStem: {
    width: 2,
    height: 14,
    backgroundColor: colors.primary,
    borderRadius: 1,
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
  secondaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryBtnText: {
    ...(typography.label || {}),
    color: colors.primary,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryBtnText: {
    ...(typography.label || {}),
    color: colors.primaryText || colors.textInverse || '#fff',
    fontWeight: '700',
  },
});
