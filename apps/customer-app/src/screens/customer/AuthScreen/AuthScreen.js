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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppScreen,
  TextInputField,
  AppIcon,
} from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import { useAuthStore } from '../../../stores';
import { authApi } from '../../../api';
import { requestNotificationPermission } from '../../../hooks/useLocalNotifications';
import { loginLogo } from '../../../assets';
import { getIdToken, signInWithPhoneNumber } from '@react-native-firebase/auth';
import { auth } from '../../../config/firebase';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const COUNTRY_CODE = '+91';
const OTP_LENGTH = 6;

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

  /*
   * step: 'phone' | 'otp' | 'name'
   *   phone → user enters phone (and name if signup mode)
   *   otp   → user enters 6-digit Firebase OTP
   *   name  → backend said NAME_REQUIRED for a new user
   */
  const [step, setStep] = useState('phone');
  const [mode, setMode] = useState('Login'); // 'Login' | 'Sign Up'
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /* Form state */
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
  const stepFade = useAnimatedValue(1);
  const stepSlide = useAnimatedValue(0);

  /* ── Entrance animations ── */
  useEffect(() => {
    const t = 350;
    const common = { easing: Easing.out(Easing.cubic), useNativeDriver: true };

    Animated.parallel([
      Animated.timing(blobA, { toValue: 1, duration: 900, ...common }),
      Animated.timing(blobB, { toValue: 1, duration: 1000, delay: 120, ...common }),
      Animated.timing(blobC, { toValue: 1, duration: 1100, delay: 240, ...common }),
      Animated.stagger(t, [
        Animated.parallel([
          Animated.timing(logoScale, { toValue: 1, duration: 700, ...common }),
          Animated.timing(logoRotate, { toValue: 0, duration: 700, ...common }),
          Animated.timing(heroFade, { toValue: 1, duration: 700, ...common }),
          Animated.timing(heroSlide, { toValue: 0, duration: 700, ...common }),
        ]),
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
    const hideListener = Keyboard.addListener(hideEvent, () => {});

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

  /* ── Step transition animation ── */
  const animateToStep = useCallback(
    (newStep) => {
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
    [stepFade, stepSlide]
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
    if (mode === 'Sign Up' && !name.trim()) {
      setErrorMsg('Name is required');
      triggerShake();
      return;
    }
    if (mode === 'Sign Up' && !termsAccepted) {
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
      if (mode === 'Sign Up' && name.trim()) {
        payload.name = name.trim();
      }

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

  /* ── Mode switch (Login / Sign Up toggle) ── */
  const switchMode = useCallback(
    (newMode) => {
      if (newMode === mode) return;
      setMode(newMode);
      setErrorMsg('');
      setTermsAccepted(false);
    },
    [mode]
  );

  /* ── Render: Phone Step ── */
  const renderPhoneStep = () => (
    <View style={styles.form}>
      {mode === 'Sign Up' && (
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
      )}
      <View style={styles.phoneRow}>
        <View style={styles.countryCode}>
          <Text style={styles.countryCodeText}>{COUNTRY_CODE}</Text>
        </View>
        <View style={styles.phoneInputWrap}>
          <TextInputField
            label={mode === 'Sign Up' ? '' : 'Phone Number'}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={sendOtp}
            inputRef={phoneRef}
            containerStyle={styles.fieldGap}
            maxLength={10}
          />
        </View>
      </View>
      {mode === 'Sign Up' && (
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
      )}
      {!!errorMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
      <GradientButton
        label={mode === 'Sign Up' ? 'Get OTP' : 'Send OTP'}
        onPress={sendOtp}
        loading={isLoading}
        style={styles.mt}
      />
      <View style={styles.linkRowSingle}>
        {mode === 'Login' ? (
          <NavLink
            label="Don't have an account? Sign Up"
            onPress={() => switchMode('Sign Up')}
            disabled={isLoading}
          />
        ) : (
          <NavLink
            label="Already have an account? Login"
            onPress={() => switchMode('Login')}
            disabled={isLoading}
          />
        )}
      </View>
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
            ]}
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
        <View style={styles.alertRow}>
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

      <TextInputField
        label="Full Name"
        placeholder="Your full name"
        value={name}
        onChangeText={setName}
        editable={!isLoading}
        returnKeyType="done"
        onSubmitEditing={submitName}
        autoCapitalize="words"
        containerStyle={styles.fieldGap}
      />

      {!!errorMsg && (
        <View style={styles.alertRow}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <GradientButton label="Create Account" onPress={submitName} loading={isLoading} style={styles.mt} />
    </View>
  );

  /* ── Animated interp values ── */
  const logoRotateDeg = logoRotate.interpolate({
    inputRange: [-8, 0],
    outputRange: ['-8deg', '0deg'],
  });

  const blobAS = blobA.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const blobAT = blobA.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  const blobBS = blobB.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const blobBT = blobB.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const blobCS = blobC.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const blobCT = blobC.interpolate({ inputRange: [0, 1], outputRange: [90, 0] });

  const stepOpacity = stepFade.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const stepX = stepSlide.interpolate({ inputRange: [-16, 0, 16], outputRange: [-12, 0, 12] });

  const heroTitle = step === 'phone'
    ? 'Welcome'
    : step === 'otp'
    ? 'Verification'
    : 'One more step';

  const heroSub = step === 'phone'
    ? 'Login or sign up with your phone number.'
    : step === 'otp'
    ? 'We sent a code to your phone.'
    : 'Tell us your name.';

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
              <Text style={styles.heroTitle}>{heroTitle}</Text>
              <Text style={styles.heroSub}>{heroSub}</Text>
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
              {/* Form area with animated transition */}
              <Animated.View
                style={{
                  opacity: stepOpacity,
                  transform: [{ translateX: stepX }],
                }}
              >
                {step === 'phone' && renderPhoneStep()}
                {step === 'otp' && renderOtpStep()}
                {step === 'name' && renderNameStep()}
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
          <ActivityIndicator color={colors.textInverse} size="small" />
        ) : (
          <Text style={styles.gradientBtnText}>{label}</Text>
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

  /* Phone row with country code */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  countryCode: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.input || 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  countryCodeText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  phoneInputWrap: {
    flex: 1,
  },

  /* OTP */
  otpTitle: {
    ...typography.heading || { fontSize: 20, fontWeight: '700' },
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  otpSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  otpPhone: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  otpBox: {
    flex: 1,
    maxWidth: 52,
    minWidth: 36,
    aspectRatio: 0.82,
    marginHorizontal: 3,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  otpBoxFilled: {
    borderColor: colors.saffron || colors.primary,
    backgroundColor: 'rgba(255,107,53,0.06)',
  },
  otpActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  resendText: {
    ...typography.bodySmall,
    color: colors.saffronDark || colors.primary,
    fontWeight: '600',
  },
  resendDisabled: {
    color: colors.textTertiary,
  },

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
  linkRowSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
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
});
