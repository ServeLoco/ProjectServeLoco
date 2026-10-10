import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Easing,
  Keyboard,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  TextInput,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import {
  AppScreen,
  AppIcon,
} from '../../../components';
import styles from './AuthScreen.styles';
import { useAuthStore } from '../../../stores';
import { authApi } from '../../../api';
import { requestNotificationPermission } from '../../../hooks/useLocalNotifications';
import BlurView from '../../../components/BlurView';
import { useReducedMotion } from '../../../utils/motionPreferences';
import AuthBackdrop from './AuthBackdrop';
import useAuthKeyboard from './useAuthKeyboard';
import { getIdToken, signInWithPhoneNumber } from '@react-native-firebase/auth';
import { auth } from '../../../config/firebase';

const COUNTRY_CODE = '+91';
const OTP_LENGTH = 6;

const AUTH_LOGO = require('../../../../Images/villkro-auth-wordmark.png');
const GLASS_PLACEHOLDER = '#BDB7B0';

const POLICY_URLS = {
  privacy: 'https://api.villkro.in/policies/privacy',
  terms: 'https://api.villkro.in/policies/terms',
};

/* ── Pure helper ─────────────────────────────────────────── */
function useAnimatedValue(init) {
  const ref = useRef(new Animated.Value(init)).current;
  return ref;
}

export default function AuthScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const { rootRef, inset: keyboardInset, visible: keyboardVisible, onLayout: onRootLayout } = useAuthKeyboard(reducedMotion);

  /*
   * step: 'phone' | 'otp' | 'name'
   *   phone → user enters phone (new users are asked for a name after the OTP)
   *   otp   → user enters 6-digit Firebase OTP
   *   name  → backend said NAME_REQUIRED for a new user
   */
  const [step, setStep] = useState('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /* Form state */
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [focusedField, setFocusedField] = useState(null);

  /* Firebase state */
  const [confirmation, setConfirmation] = useState(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState(null);

  /* Refs */
  const phoneRef = useRef(null);
  const scrollRef = useRef(null);
  const otpRefs = useRef([]);
  // Double-submit guard for verifyOtp (auto-submit on 6th digit + Verify OTP
  // button tap can both fire within the same render cycle).
  const submittingRef = useRef(false);

  /* Animated values */
  const cardFade = useAnimatedValue(0);
  const cardSlide = useAnimatedValue(40);

  const logoSlide = useAnimatedValue(18);
  const shakeAnim = useAnimatedValue(0);
  const stepFade = useAnimatedValue(1);
  const stepSlide = useAnimatedValue(0);

  /* ── Entrance animations ── */
  useEffect(() => {
    if (reducedMotion) {
      cardFade.setValue(1);
      cardSlide.setValue(0);
      logoSlide.setValue(0);
      return undefined;
    }
    const common = { easing: Easing.out(Easing.cubic), useNativeDriver: true };
    const entrance = Animated.parallel([
      Animated.timing(cardFade, { toValue: 1, duration: 700, ...common }),
      Animated.timing(cardSlide, { toValue: 0, duration: 800, ...common }),
      Animated.timing(logoSlide, { toValue: 0, duration: 900, ...common }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [cardFade, cardSlide, logoSlide, reducedMotion]);

  /* ── Shake error ── */
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    if (reducedMotion) return;
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [reducedMotion, shakeAnim]);

  /* ── Step transition animation ── */
  const animateToStep = useCallback(
    (newStep) => {
      if (reducedMotion) {
        stepFade.setValue(1);
        stepSlide.setValue(0);
        setStep(newStep);
        setErrorMsg('');
        return;
      }
      Animated.parallel([
        Animated.timing(stepFade, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(stepSlide, { toValue: -16, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setStep(newStep);
        setErrorMsg('');
        stepSlide.setValue(16);
        Animated.parallel([
          Animated.timing(stepFade, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(stepSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    },
    [reducedMotion, stepFade, stepSlide]
  );

  const handleSuccess = useCallback((token, user, shop = null, rider = null, admin = null) => {
    setSession(token, user, shop, rider, admin);
    setTimeout(() => {
      requestNotificationPermission().catch(() => {});
    }, 800);
  }, [setSession]);

  /* ── Send OTP via Firebase ── */
  const sendOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setErrorMsg('Enter a valid 10-digit phone number');
      triggerShake();
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('Please accept the Terms and Privacy Policy');
      triggerShake();
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      const fullPhone = `${COUNTRY_CODE}${cleanPhone}`;
      const result = await signInWithPhoneNumber(auth, fullPhone);
      setConfirmation(result);
      setIsLoading(false);
      animateToStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 400);
    } catch (err) {
      setIsLoading(false);
      console.error('[firebase] sendOtp error:', err);
      if (err.code === 'auth/invalid-phone-number') {
        setErrorMsg('Invalid phone number format');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMsg('Too many attempts. Please try again later.');
      } else if (err.code === 'auth/quota-exceeded') {
        setErrorMsg('SMS quota exceeded. Please try again later.');
      } else {
        const cleanMsg = err.message?.includes(']') ? err.message.split('] ')[1] : err.message;
        setErrorMsg(cleanMsg || 'Failed to send OTP');
      }
      triggerShake();
    }
  };

  /* ── Verify OTP ──
   * Accepts an optional `codeOverride` so the auto-submit path (which fires
   * before React commits the state update for the 6th digit) can pass the
   * fresh code directly instead of reading stale state from the closure.
   */
  const verifyOtp = async (codeOverride) => {
    if (submittingRef.current) return;
    const code = typeof codeOverride === 'string' ? codeOverride : otp.join('');
    if (code.length !== OTP_LENGTH) {
      setErrorMsg(`Enter all ${OTP_LENGTH} digits`);
      triggerShake();
      return;
    }
    if (!confirmation) {
      setErrorMsg('Session expired. Please resend OTP.');
      triggerShake();
      return;
    }

    submittingRef.current = true;
    setErrorMsg('');
    setIsLoading(true);
    try {
      // Confirm the OTP with Firebase
      let idToken;
      try {
        const userCredential = await confirmation.confirm(code);
        idToken = await getIdToken(userCredential.user);
      } catch (confirmErr) {
        // Fallback for Android auto-verification
        // If Play Services auto-verified the SMS, the confirmation object is consumed
        // and throws auth/code-expired (or auth/session-expired), but the user is
        // already signed in. Only fall back in those specific cases — otherwise an
        // unrelated error combined with a signed-in user from a previous session
        // would mix two accounts.
        // Fallback for Android SMS auto-verify / code-expired.
        // Only reuse auth.currentUser when its phone matches what the user typed.
        // Never mint a session from a leftover Firebase user (previous login).
        const currentUser = auth.currentUser;
        const enteredPhone = phone.replace(/\D/g, '').slice(-10);
        const firebasePhone = (currentUser?.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const samePhone =
          Boolean(currentUser)
          && enteredPhone.length === 10
          && firebasePhone === enteredPhone;

        if (
          samePhone
          && (confirmErr.code === 'auth/code-expired' || confirmErr.code === 'auth/session-expired')
        ) {
          idToken = await getIdToken(currentUser, true);
        } else if (
          confirmErr.code === 'auth/session-expired' ||
          confirmErr.code === 'auth/code-expired'
        ) {
          // SMS Retriever consumed the OTP; send a fresh code for the number typed.
          const cleanPhoneRetry = phone.replace(/\D/g, '').slice(-10);
          const retryPhone = `${COUNTRY_CODE}${cleanPhoneRetry}`;
          const fresh = await signInWithPhoneNumber(auth, retryPhone);
          setConfirmation(fresh);
          setOtp(['', '', '', '', '', '']);
          setResendTimer(45);
          setErrorMsg('Your phone auto-read the SMS. We\u2019ve sent a new code \u2014 please enter it.');
          triggerShake();
          setTimeout(() => otpRefs.current[0]?.focus(), 200);
          return;
        } else {
          throw confirmErr;
        }
      }
      setFirebaseIdToken(idToken);

      // Send to backend for verification and JWT issuance
      const payload = { idToken };

      try {
        const session = await authApi.firebaseVerify(payload);
        if (!session.token) throw new Error('Response did not include a session token');
        handleSuccess(session.token, session.user, session.shop, session.rider, session.admin);
      } catch (backendErr) {
        // If backend says name is required (new user without name),
        // show the name step.
        if (backendErr.code === 'NAME_REQUIRED' ||
            backendErr.response?.code === 'NAME_REQUIRED') {
          animateToStep('name');
          return;
        }
        throw backendErr;
      }
    } catch (err) {
      console.error('[firebase] verifyOtp error:', err);
      // Backend rate-limit (HTTP 429 / TOO_MANY_REQUESTS) — handled before
      // Firebase error-code checks since it's a backend response shape.
      if (err.status === 429 || err.code === 'TOO_MANY_REQUESTS') {
        setErrorMsg('Too many attempts. Please try again later.');
        triggerShake();
        return;
      }
      if (err.code?.includes('invalid-verification-code') || err.message?.includes('invalid-verification-code')) {
        setErrorMsg('Incorrect OTP. Please try again.');
      } else if (err.code?.includes('code-expired') || err.code?.includes('session-expired') || err.message?.includes('expired')) {
        setErrorMsg('OTP has expired. Please resend.');
      } else {
        // Strip the [auth/error-code] prefix if it exists
        const cleanMsg = err.message?.includes(']') ? err.message.split('] ')[1] : err.message;
        setErrorMsg(cleanMsg || 'Failed to verify OTP');
      }
      triggerShake();
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  };

  /* ── Submit name (for new users discovered at verify time) ── */
  const submitName = async () => {
    if (!name.trim()) {
      setErrorMsg('Name is required');
      triggerShake();
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      // Re-get a fresh ID token in case the old one expired
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await getIdToken(currentUser, true) : firebaseIdToken;

      const session = await authApi.firebaseVerify({
        idToken,
        name: name.trim(),
      });
      if (!session.token) throw new Error('Response did not include a session token');
      setIsLoading(false);
      handleSuccess(session.token, session.user, session.shop, session.rider, session.admin);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to create account');
      triggerShake();
    }
  };

  /* ── OTP input handling ── */
  const handleOtpChange = (text, index) => {
    // Only allow digits
    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are filled
    if (digit && index === OTP_LENGTH - 1) {
      const code = newOtp.join('');
      if (code.length === OTP_LENGTH) {
        Keyboard.dismiss();
        // Pass the fresh code directly — state update from setOtp() above
        // hasn't committed yet, so reading `otp` inside verifyOtp would see
        // the previous value.
        verifyOtp(code);
      }
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  /* ── Resend OTP ── */
  const [resendTimer, setResendTimer] = useState(0);
  useEffect(() => {
    if (step === 'otp') {
      setResendTimer(45);
    }
  }, [step]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const resendOtp = async () => {
    if (resendTimer > 0) return;
    setOtp(['', '', '', '', '', '']);
    setErrorMsg('');
    setIsLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const fullPhone = `${COUNTRY_CODE}${cleanPhone}`;
      const forceResendingToken = confirmation?.verificationId || undefined;
      const result = await signInWithPhoneNumber(auth, fullPhone, forceResendingToken);
      setConfirmation(result);
      setResendTimer(45);
      setIsLoading(false);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to resend OTP');
      triggerShake();
    }
  };

  /* ── Render: Phone Step ── */
  const renderPhoneStep = () => (
    <View style={styles.form}>
      <Text style={styles.fieldLabel}>Phone Number</Text>
      <View style={[styles.glassInputWrap, focusedField === 'phone' && styles.inputFocused]}>
        <View style={styles.countryCode}><Text style={styles.countryCodeText}>{COUNTRY_CODE}</Text></View>
        <TextInput
          ref={phoneRef}
          accessibilityLabel="Phone Number"
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          editable={!isLoading}
          returnKeyType="done"
          onSubmitEditing={sendOtp}
          maxLength={10}
          style={styles.glassInputText}
          placeholderTextColor={GLASS_PLACEHOLDER}
          selectionColor="#FFAC3E"
          onFocus={() => setFocusedField('phone')}
          onBlur={() => setFocusedField(null)}
        />
      </View>
      <View style={styles.termsRow}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setTermsAccepted((p) => !p)}
          disabled={isLoading}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
          accessibilityLabel="Accept Terms of Service and Privacy Policy"
        >
          <AnimatedCheckbox checked={termsAccepted} reducedMotion={reducedMotion} />
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
        <View style={styles.alertRow} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
      <GradientButton
        label="Send OTP"
        onPress={sendOtp}
        loading={isLoading}
        disabled={!termsAccepted}
        style={styles.mt}
      />
    </View>
  );

  /* ── Render: OTP Step ── */
  const renderOtpStep = () => (
    <View style={styles.form}>
      <Text style={styles.otpTitle}>Verify Phone Number</Text>
      <Text style={styles.otpSubtitle}>
        Enter the 6-digit code sent to{'\n'}
        <Text style={styles.otpPhone}>{COUNTRY_CODE} {phone}</Text>
      </Text>

      <View style={styles.otpRow}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { otpRefs.current[index] = ref; }}
            style={[
              styles.otpBox,
              digit ? styles.otpBoxFilled : null,
              focusedField === index && styles.inputFocused,
            ]}
            accessibilityLabel={`OTP digit ${index + 1}`}
            selectionColor="#FFAC3E"
            onFocus={() => setFocusedField(index)}
            onBlur={() => setFocusedField(null)}
            value={digit}
            onChangeText={(text) => handleOtpChange(text, index)}
            onKeyPress={(e) => handleOtpKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={1}
            editable={!isLoading}
            selectTextOnFocus
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
          />
        ))}
      </View>

      {!!errorMsg && (
        <View style={styles.alertRow} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <GradientButton label="Verify OTP" onPress={verifyOtp} loading={isLoading} style={styles.mt} />

      <View style={styles.otpActions}>
        <TouchableOpacity
          onPress={resendOtp}
          disabled={resendTimer > 0 || isLoading}
          activeOpacity={0.65}
        >
          <Text style={[styles.resendText, resendTimer > 0 && styles.resendDisabled]}>
            {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
          </Text>
        </TouchableOpacity>
        <NavLink
          label="Change number"
          onPress={() => {
            setOtp(['', '', '', '', '', '']);
            setConfirmation(null);
            animateToStep('phone');
          }}
          disabled={isLoading}
        />
      </View>
    </View>
  );

  /* ── Render: Name Step (for new users discovered at verify time) ── */
  const renderNameStep = () => (
    <View style={styles.form}>
      <Text style={styles.otpTitle}>Almost there!</Text>
      <Text style={styles.otpSubtitle}>
        You're new here. Tell us your name to get started.
      </Text>

      <Text style={styles.fieldLabel}>Full Name</Text>
      <View style={[styles.glassInputWrap, focusedField === 'name' && styles.inputFocused]}>
        <TextInput
          accessibilityLabel="Full Name"
          placeholder="Your full name"
          value={name}
          onChangeText={setName}
          editable={!isLoading}
          returnKeyType="done"
          onSubmitEditing={submitName}
          autoCapitalize="words"
          autoCorrect={false}
          style={styles.glassInputText}
          placeholderTextColor={GLASS_PLACEHOLDER}
          selectionColor="#FFAC3E"
          onFocus={() => setFocusedField('name')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      {!!errorMsg && (
        <View style={styles.alertRow} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <GradientButton label="Create Account" onPress={submitName} loading={isLoading} style={styles.mt} />
    </View>
  );

  /* ── Animated interp values ── */
  const stepOpacity = stepFade.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const stepX = stepSlide.interpolate({ inputRange: [-16, 0, 16], outputRange: [-12, 0, 12] });

  const logoWidth = Math.min(width - insets.left - insets.right - 48, keyboardVisible ? 230 : 340);

  return (
    <AppScreen bg="#070707" style={styles.screen} safeAreaTop={false} safeAreaBottom={false} noPadding statusBarStyle="light-content">
      <View ref={rootRef} collapsable={false} style={styles.root} onLayout={onRootLayout}>
        <AuthBackdrop reducedMotion={reducedMotion} focused={focused} />
        <Animated.View style={[styles.flex, { paddingBottom: keyboardInset }]}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 12, paddingBottom: keyboardVisible ? 16 : insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets={false}
            bounces={false}
            onContentSizeChange={() => {
              if (keyboardVisible) scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
            }}
          >
            <Animated.View style={[
              styles.brand,
              { minHeight: keyboardVisible ? 110 : 200, opacity: cardFade, transform: [{ translateY: logoSlide }] },
            ]}>
              <Image source={AUTH_LOGO} accessibilityLabel="VillKro — Eat Explore Enjoy" resizeMode="contain" style={{ width: logoWidth, height: logoWidth * 793 / 1983 }} />
            </Animated.View>
            <Animated.View style={[
              styles.authCard,
              { opacity: cardFade, transform: [{ translateY: cardSlide }, { translateX: shakeAnim }] },
            ]}>
              <BlurView tint="dark" intensity={35} pointerEvents="none" style={StyleSheet.absoluteFillObject} />
              <LinearGradient
                colors={['rgba(255,244,233,0.09)', 'rgba(255,244,233,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <Animated.View style={{ opacity: stepOpacity, transform: [{ translateX: stepX }] }}>
                {step === 'phone' && renderPhoneStep()}
                {step === 'otp' && renderOtpStep()}
                {step === 'name' && renderNameStep()}
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </View>
    </AppScreen>
  );
}

/**
 * GradientButton
 */
function GradientButton({ label, onPress, loading, disabled, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={loading || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={[styles.gradientBtn, disabled && styles.gradientBtnDisabled, style]}
    >
      <LinearGradient
        colors={['#FFC060', '#FF962F']}
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
          <ActivityIndicator color="#2B1705" size="small" />
        ) : (
          <>
            <Text style={styles.gradientBtnText}>{label}</Text>
            <AppIcon name="chevronRight" size={17} color="#2B1705" />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
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
 */
function AnimatedCheckbox({ checked, reducedMotion }) {
  const scale = useAnimatedValue(checked ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) { scale.setValue(checked ? 1 : 0); return; }
    Animated.spring(scale, {
      toValue: checked ? 1 : 0,
      friction: 6,
      tension: 300,
      useNativeDriver: true,
    }).start();
  }, [checked, reducedMotion, scale]);

  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && (
        <Animated.View style={{ transform: [{ scale }] }}>
          <AppIcon name="check" size={12} color="#2B1705" />
        </Animated.View>
      )}
    </View>
  );
}
