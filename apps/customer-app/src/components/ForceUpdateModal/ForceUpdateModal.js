import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing } from '../../theme';

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.yashsiwach.villkro';

/**
 * ForceUpdateModal
 *
 * Blocking modal shown on app launch when the server reports a higher
 * minimum required version than the installed app. The user CANNOT dismiss
 * it — they must either:
 *   • "Update Now"  → opens Play Store listing
 *   • "Exit App"    → closes the app via BackHandler
 *
 * Props:
 *   visible  - show/hide the modal (controlled by App.js version check)
 */
function ForceUpdateModal({ visible }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  // Animate in when visible flips to true
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible, opacity, scale]);

  // Intercept Android hardware back button — do nothing (modal is blocking)
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible]);

  const handleUpdate = () => {
    Linking.openURL(PLAY_STORE_URL).catch(() => {
      // If the Play Store app is not present, fall back to browser
      Linking.openURL(
        'https://play.google.com/store/apps/details?id=com.yashsiwach.villkro'
      );
    });
  };

  const handleExit = () => {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
    // iOS doesn't support programmatic exit — the modal stays shown,
    // which is the correct behaviour per Apple's HIG.
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      // Prevent back-gesture dismiss on Android
      onRequestClose={() => {}}
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          {/* Icon area */}
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🚀</Text>
          </View>

          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.message}>
            A new version of VillKro is available.{'\n'}
            Please update to continue using the app.
          </Text>

          {/* Update button — primary action */}
          <Pressable
            onPress={handleUpdate}
            style={({ pressed }) => [styles.btn, styles.btnUpdate, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Update VillKro on Play Store"
          >
            <Text style={styles.btnUpdateLabel}>Update Now</Text>
          </Pressable>

          {/* Exit button — secondary / destructive */}
          <Pressable
            onPress={handleExit}
            style={({ pressed }) => [styles.btn, styles.btnExit, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Exit the app"
          >
            <Text style={styles.btnExitLabel}>Exit App</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgSurface,
    borderRadius: 24,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.20,
        shadowRadius: 28,
      },
      android: {
        elevation: 18,
      },
    }),
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  btn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  btnPressed: {
    opacity: 0.72,
  },
  btnUpdate: {
    backgroundColor: colors.primary,
  },
  btnUpdateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse || '#FFFFFF',
  },
  btnExit: {
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnExitLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default ForceUpdateModal;
