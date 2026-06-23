import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Keyboard,
  TouchableOpacity,
  Linking,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppScreen,
  TextInputField,
  SegmentedControl,
  AppIcon,
} from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import { useAuthStore } from '../../../stores';
import { authApi } from '../../../api';
import { requestNotificationPermission } from '../../../hooks/useLocalNotifications';
import { loginLogo } from '../../../assets';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const POLICY_URLS = {
  privacy: 'https://api.serveloco.app/policies/privacy',
  terms: 'https://api.serveloco.app/policies/terms',
};

/* ── Pure helper ─────────────────────────────────────────── */
function useAnimatedValue(init) {
  const ref = useRef(new Animated.Value(init)).current;
  return ref;
}

export default function AuthScreen() {
  const setSession = useAuthStore((state) => state.setSession);

  const [mode, setMode] = useState('Login'); // 'Login' | 'Sign Up' | 'Reset Password'
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  /* Form state */
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* Refs */
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const resetPasswordRef = useRef(null);
  const resetConfirmRef = useRef(null);
  const scrollRef = useRef(null);

  /* Animated values */
  const heroFade = useAnimatedValue(0);
  const heroSlide = useAnimatedValue(24);
  const logoScale = useAnimatedValue(0.8);
  const logoRotate = useAnimatedValue(-8);

  const cardFade = useAnimatedValue(0);
  const cardSlide = useAnimatedValue(40);

  const blobA = useAnimatedValue(0);
  const blobB = useAnimatedValue(0);
  const blobC = useAnimatedValue(0);

  const shakeAnim = useAnimatedValue(0);
  const modeFade = useAnimatedValue(1);
  const modeSlide = useAnimatedValue(0);

  /* ── Entrance animations ── */
  useEffect(() => {
    const t = 350;
    const common = { easing: Easing.out(Easing.cubic), useNativeDriver: true };

    Animated.parallel([
      Animated.timing(blobA, { toValue: 1, duration: 900, ...common }),
      Animated.timing(blobB, { toValue: 1, duration: 1000, delay: 120, ...common }),
      Animated.timing(blobC, { toValue: 1, duration: 1100, delay: 240, ...common }),
      Animated.stagger(t, [
        /* logo */
        Animated.parallel([
          Animated.timing(logoScale, { toValue: 1, duration: 700, ...common }),
          Animated.timing(logoRotate, { toValue: 0, duration: 700, ...common }),
          Animated.timing(heroFade, { toValue: 1, duration: 700, ...common }),
          Animated.timing(heroSlide, { toValue: 0, duration: 700, ...common }),
        ]),
        /* card */
        Animated.parallel([
          Animated.timing(cardFade, { toValue: 1, duration: 700, ...common }),
          Animated.timing(cardSlide, { toValue: 0, duration: 700, ...common }),
        ]),
      ]),
    ]).start();

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    });
    const hideListener = Keyboard.addListener(hideEvent, () => {
      /* no-op — ScrollView manages itself */
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Shake error ── */
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  /* ── Mode switch animation ── */
  const switchMode = useCallback(
    (newMode) => {
      if (newMode === mode) return;
      // exit
      Animated.parallel([
        Animated.timing(modeFade, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(modeSlide, { toValue: -16, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setMode(newMode);
        setErrorMsg('');
        setSuccessMsg('');
        setPassword('');
        setConfirmPassword('');
        setTermsAccepted(false);
        // enter
        modeSlide.setValue(16);
        Animated.parallel([
          Animated.timing(modeFade, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(modeSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    },
    [mode, modeFade, modeSlide]
  );

  const handleSuccess = useCallback((token, user) => {
    setSession(token, user);
    setTimeout(() => {
      requestNotificationPermission().catch(() => {});
    }, 800);
  }, [setSession]);

  /* ── Login ── */
  const submitLogin = async () => {
    if (!phone || !password) {
      setErrorMsg('Phone and password are required');
      triggerShake();
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    try {
      const session = await authApi.login({ phone, password });
      if (!session.token) throw new Error('Login response did not include a session token');
      setIsLoading(false);
      handleSuccess(session.token, session.user);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to login');
      triggerShake();
    }
  };

  /* ── Signup ── */
  const submitSignup = async () => {
    if (!name.trim() || !phone || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields');
      triggerShake();
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('Please accept the Terms and Privacy Policy to continue');
      triggerShake();
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      triggerShake();
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      triggerShake();
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    try {
      const session = await authApi.signup({
        name: name.trim(),
        fullName: name.trim(),
        phone,
        password,
      });
      if (!session.token) throw new Error('Signup response did not include a session token');
      setIsLoading(false);
      handleSuccess(session.token, session.user);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to sign up');
      triggerShake();
    }
  };

  /* ── Reset password ── */
  const submitPasswordResetRequest = async () => {
    if (!phone || !password || !confirmPassword) {
      setErrorMsg('Phone and new password are required');
      triggerShake();
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      triggerShake();
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      triggerShake();
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const response = await authApi.requestPasswordReset({
        phone,
        newPassword: password,
        new_password: password,
      });
      setPassword('');
      setConfirmPassword('');
      setMode('Login');
      setSuccessMsg(response.message || 'Password reset request sent for admin approval');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to request password reset');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Forms ── */
  const renderLoginForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Phone Number"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        inputRef={phoneRef}
        containerStyle={styles.fieldGap}
      />
      <TextInputField
        label="Password"
        placeholder="Enter your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
        returnKeyType="done"
        onSubmitEditing={submitLogin}
        inputRef={passwordRef}
        containerStyle={styles.fieldGap}
      />
      {!!errorMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
      {!!successMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      )}
      <GradientButton label="Login" onPress={submitLogin} loading={isLoading} style={styles.mt} />
      <View style={styles.linkRow}>
        <NavLink label="Forgot password?" onPress={() => switchMode('Reset Password')} disabled={isLoading} />
        <View style={styles.dividerDot} />
        <NavLink label="Create account" onPress={() => switchMode('Sign Up')} disabled={isLoading} />
      </View>
    </View>
  );

  const renderSignupForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Full Name"
        placeholder="Your full name"
        value={name}
        onChangeText={setName}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        autoCapitalize="words"
        containerStyle={styles.fieldGap}
      />
      <View style={styles.phoneWrap}>
        <TextInputField
          label="Phone Number"
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          editable={!isLoading}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          inputRef={phoneRef}
          containerStyle={styles.fieldGap}
        />
        <Text style={styles.hintText}>This number will be used for delivery</Text>
      </View>
      <TextInputField
        label="Password"
        placeholder="Minimum 8 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
        inputRef={passwordRef}
        containerStyle={styles.fieldGap}
      />
      <TextInputField
        label="Confirm Password"
        placeholder="Re-enter password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!isLoading}
        returnKeyType="done"
        onSubmitEditing={submitSignup}
        inputRef={confirmPasswordRef}
        containerStyle={styles.fieldGap}
      />
      <View style={styles.termsRow}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setTermsAccepted((p) => !p)}
          disabled={isLoading}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
          accessibilityLabel="Accept Terms of Service and Privacy Policy"
        >
          <AnimatedCheckbox checked={termsAccepted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.termsText}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(POLICY_URLS.terms)}>
              Terms
            </Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(POLICY_URLS.privacy)}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
      {!!errorMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
      <GradientButton label="Create Account" onPress={submitSignup} loading={isLoading} style={styles.mt} />
      <View style={styles.linkRowSingle}>
        <NavLink label="Already have an account? Login" onPress={() => switchMode('Login')} disabled={isLoading} />
      </View>
    </View>
  );

  const renderResetPasswordForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Phone Number"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        inputRef={phoneRef}
        containerStyle={styles.fieldGap}
      />
      <Text style={styles.hintText}>This number will be used for delivery</Text>
      <TextInputField
        label="New Password"
        placeholder="Minimum 8 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => resetConfirmRef.current?.focus()}
        inputRef={resetPasswordRef}
        containerStyle={styles.fieldGap}
      />
      <TextInputField
        label="Confirm New Password"
        placeholder="Re-enter new password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!isLoading}
        returnKeyType="done"
        onSubmitEditing={submitPasswordResetRequest}
        inputRef={resetConfirmRef}
        containerStyle={styles.fieldGap}
      />
      {!!errorMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
      {!!successMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      )}
      <GradientButton label="Send for Approval" onPress={submitPasswordResetRequest} loading={isLoading} style={styles.mt} />
      <View style={styles.linkRowSingle}>
        <NavLink label="Back to Login" onPress={() => switchMode('Login')} disabled={isLoading} />
      </View>
    </View>
  );

  /* ── Animated interp values ── */
  const logoRotateDeg = logoRotate.interpolate({
    inputRange: [-8, 0],
    outputRange: ['-8deg', '0deg'],
  });

  const blobAS = blobA.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });
  const blobAT = blobA.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 0],
  });
  const blobBS = blobB.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const blobBT = blobB.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });
  const blobCS = blobC.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });
  const blobCT = blobC.interpolate({
    inputRange: [0, 1],
    outputRange: [90, 0],
  });

  const modeOpacity = modeFade.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const modeX = modeSlide.interpolate({
    inputRange: [-16, 0, 16],
    outputRange: [-12, 0, 12],
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <AppScreen style={styles.screen} safeAreaTop safeAreaBottom noPadding>
        <LinearGradient
          colors={['#FFF8EF', '#FFF0D9', '#FFF6EF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        >
          {/* Floating blobs */}
          <Animated.View
            style={[
              styles.blob,
              { top: -SCREEN_H * 0.06, left: -SCREEN_W * 0.18, backgroundColor: 'rgba(255,180,130,0.22)' },
              { opacity: blobA, transform: [{ scale: blobAS }, { translateY: blobAT }] },
            ]}
          />
          <Animated.View
            style={[
              styles.blob,
              { top: SCREEN_H * 0.08, right: -SCREEN_W * 0.22, backgroundColor: 'rgba(255,120,50,0.14)' },
              { opacity: blobB, transform: [{ scale: blobBS }, { translateY: blobBT }] },
            ]}
          />
          <Animated.View
            style={[
              styles.blob,
              { bottom: -SCREEN_H * 0.04, left: SCREEN_W * 0.3, backgroundColor: 'rgba(255,150,80,0.18)' },
              { opacity: blobC, transform: [{ scale: blobCS }, { translateY: blobCT }] },
            ]}
          />

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* ── Hero ── */}
            <Animated.View
              style={[
                styles.heroWrap,
                { opacity: heroFade, transform: [{ translateY: heroSlide }] },
              ]}
            >
              <Animated.Image
                source={loginLogo}
                style={[
                  styles.heroLogo,
                  {
                    transform: [{ scale: logoScale }, { rotate: logoRotateDeg }],
                  },
                ]}
                resizeMode="contain"
              />
              <Text style={styles.heroTitle}>
                Welcome back
              </Text>
              <Text style={styles.heroSub}>
                Login or sign up to continue.
              </Text>
            </Animated.View>

            {/* ── Auth Card ── */}
            <Animated.View
              style={[
                styles.authCard,
                {
                  opacity: cardFade,
                  transform: [
                    { translateY: cardSlide },
                    { translateX: shakeAnim },
                  ],
                },
              ]}
            >
              {/* Mode switcher */}
              {mode !== 'Reset Password' && (
                <SegmentedControl
                  options={['Login', 'Sign Up']}
                  selectedOption={mode}
                  onSelect={(opt) => switchMode(opt)}
                  disabled={isLoading}
                  style={{ marginBottom: spacing.lg }}
                />
              )}

              {/* Form area with animated transition */}
              <Animated.View
                style={{
                  opacity: modeOpacity,
                  transform: [{ translateX: modeX }],
                }}
              >
                {mode === 'Login' && renderLoginForm()}
                {mode === 'Sign Up' && renderSignupForm()}
                {mode === 'Reset Password' && renderResetPasswordForm()}
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </LinearGradient>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

/**
 * GradientButton
 * Primary action with a soft saffron-to-dark gradient and subtle shadow
 */
function GradientButton({ label, onPress, loading, style }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={loading} style={[styles.gradientBtn, style]}>
      <LinearGradient
        colors={[colors.saffronLight, colors.saffron, colors.saffronDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.btnInner}>
        {loading ? (
          <ActivityIcon />
        ) : (
          <Text style={styles.gradientBtnText}>{label}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function ActivityIcon() {
  return <ActivityIndicator color={colors.textInverse} size="small" />;
}

function NavLink({ label, onPress, disabled }) {
  return (
    <TouchableOpacity activeOpacity={0.65} onPress={onPress} disabled={disabled}>
      <Text style={[styles.navLink, disabled && styles.navLinkDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * AnimatedCheckbox
 * Small animated scale pop on check/uncheck
 */
function AnimatedCheckbox({ checked }) {
  const scale = useAnimatedValue(checked ? 1 : 0);
  useEffect(() => {
    Animated.spring(scale, {
      toValue: checked ? 1 : 0,
      friction: 6,
      tension: 300,
      useNativeDriver: true,
    }).start();
  }, [checked, scale]);

  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && (
        <Animated.View style={{ transform: [{ scale }] }}>
          <AppIcon name="check" size={13} color={colors.textInverse} />
        </Animated.View>
      )}
    </View>
  );
}

/* ═════════════════ Styling ═════════════════ */
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: 'transparent' },
  gradientBg: { flex: 1, position: 'relative' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg + 8,
    paddingBottom: spacing.xxl,
  },

  /* Decorative floating blobs */
  blob: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
  },

  /* Hero */
  heroWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl + 4,
  },
  heroLogo: {
    width: SCREEN_W * 0.52,
    height: SCREEN_W * 0.36,
    marginBottom: spacing.md - 2,
  },
  heroTitle: {
    ...typography.display,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  heroSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs + 2,
  },

  /* Auth glass card */
  authCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 28,
    padding: spacing.lg + 4,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    ...Platform.select({
      ios: {
        shadowColor: '#C8490F',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  /* Forms */
  form: { gap: spacing.sm - 2 },
  fieldGap: { marginBottom: 2 },
  mt: { marginTop: spacing.md + 2 },

  /* Alerts */
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs + 2,
    marginBottom: spacing.xs + 2,
    paddingHorizontal: 2,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  successText: {
    ...typography.caption,
    color: colors.success,
    flex: 1,
  },

  /* Gradient primary button */
  gradientBtn: {
    borderRadius: radius.button + 2,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.saffronDark,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBtnText: {
    ...typography.buttonLarge,
    color: colors.textInverse,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  /* Links */
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  linkRowSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  dividerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
  },
  navLink: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  navLinkDisabled: {
    color: colors.textDisabled,
  },

  /* Terms */
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.saffronDark,
    fontWeight: '700',
  },
  phoneWrap: {
    gap: 2,
    marginBottom: 2,
  },
  hintText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: 2,
  },
});
