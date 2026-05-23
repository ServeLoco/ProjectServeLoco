import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppScreen } from '../../components';
import { colors, typography, spacing, radius } from '../../theme';
import { useAdminAuthStore } from '../../stores';

export default function AdminEntryScreen() {
  const navigation = useNavigation();
  const isAdminAuthenticated = useAdminAuthStore(state => state.isAdminAuthenticated);
  const setAdminMode = useAdminAuthStore(state => state.setAdminMode);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // If already authenticated as admin, jump to Admin Dashboard
    if (isAdminAuthenticated) {
      setAdminMode(true);
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, isAdminAuthenticated, setAdminMode]);

  const handlePressIn = () => {
    Animated.spring(btnScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(btnScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleLoginPress = () => {
    setAdminMode(true);
  };

  return (
    <AppScreen style={styles.container} safeAreaTop safeAreaBottom>
      <StatusBar barStyle="light-content" backgroundColor={colors.textPrimary} />
      
      {/* Back Button */}
      <TouchableOpacity 
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backIcon}>←</Text>
        <Text style={styles.backText}>Back to App</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>Admin</Text>
          </View>
          <Text style={styles.title}>ServeLoco</Text>
          <Text style={styles.subtitle}>Admin Portal</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: btnScale }], marginTop: spacing.xxxl * 2, width: '100%' }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handleLoginPress}
            style={styles.loginBtn}
          >
            <Text style={styles.loginBtnText}>Admin Login</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.textPrimary, // Dark theme for admin entry
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    alignSelf: 'flex-start',
  },
  backIcon: {
    fontSize: 24,
    color: colors.textInverse,
    marginRight: spacing.xs,
  },
  backText: {
    ...typography.button,
    color: colors.textInverse,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: '20%', // Shift slightly up
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface + '1A', // transparent white
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border + '40',
  },
  logoIcon: {
    fontSize: 40,
  },
  title: {
    ...typography.h1,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textTertiary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  loginBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    width: '100%',
  },
  loginBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
