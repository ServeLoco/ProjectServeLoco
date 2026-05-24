/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import {
  AppScreen,
  TextInputField,
  Button,
  SegmentedControl,
  AppIcon,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore } from '../../../stores';
import { authApi } from '../../../api';
import { normalizeSession } from '../../../utils';

export default function AuthScreen() {
  const setSession = useAuthStore(state => state.setSession);

  const [mode, setMode] = useState('Login'); // 'Login' | 'Sign Up'
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Animations
  const fadeAnimHeader = useRef(new Animated.Value(0)).current;
  const slideAnimHeader = useRef(new Animated.Value(20)).current;
  const floatAnimIllustration = useRef(new Animated.Value(0)).current;
  const fadeAnimCard = useRef(new Animated.Value(0)).current;
  const slideAnimCard = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Mount animations
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(fadeAnimHeader, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnimHeader, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnimCard, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnimCard, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ]).start();

    // Float loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnimIllustration, { toValue: -10, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatAnimIllustration, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const handleSuccess = (token, user) => {
    setSession(token, user);
  };

  const submitLogin = async () => {
    if (!phone || !password) {
      setErrorMsg('Phone and password are required');
      triggerShake();
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const session = normalizeSession(await authApi.login({ phone, password }));
      if (!session.token) {
        throw new Error('Login response did not include a session token');
      }
      setIsLoading(false);
      handleSuccess(session.token, session.user);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to login');
      triggerShake();
    }
  };

  const submitSignup = async () => {
    if (!name || !phone || !address || !password || !confirmPassword) {
      setErrorMsg('Please fill in all required fields');
      triggerShake();
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      triggerShake();
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const session = normalizeSession(await authApi.signup({
        name,
        fullName: name,
        phone,
        whatsappNumber: whatsapp,
        deliveryAddress: address,
        address,
        password,
      }));
      if (!session.token) {
        throw new Error('Signup response did not include a session token');
      }
      setIsLoading(false);
      handleSuccess(session.token, session.user);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to sign up');
      triggerShake();
    }
  };

  const renderLoginForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Phone Number"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
      />
      <TextInputField
        label="Password"
        placeholder="Enter your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
      />
      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <Button
        label="Login"
        onPress={submitLogin}
        loading={isLoading}
        style={styles.mainBtn}
      />
      <Button
        label="Create an account"
        variant="ghost"
        onPress={() => setMode('Sign Up')}
        disabled={isLoading}
      />
    </View>
  );

  const renderSignupForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Full Name *"
        placeholder="John Doe"
        value={name}
        onChangeText={setName}
        editable={!isLoading}
      />
      <TextInputField
        label="Phone Number *"
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
      />
      <TextInputField
        label="WhatsApp Number (Optional)"
        placeholder="For order updates"
        keyboardType="phone-pad"
        value={whatsapp}
        onChangeText={setWhatsapp}
        editable={!isLoading}
      />
      <TextInputField
        label="Delivery Address *"
        placeholder="Complete address with landmark"
        multiline
        value={address}
        onChangeText={setAddress}
        editable={!isLoading}
      />
      <TextInputField
        label="Password *"
        placeholder="Minimum 6 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isLoading}
      />
      <TextInputField
        label="Confirm Password *"
        placeholder="Re-enter password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!isLoading}
      />
      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <Button
        label="Create Account"
        onPress={submitSignup}
        loading={isLoading}
        style={styles.mainBtn}
      />
      <Button
        label="Already have an account? Login"
        variant="ghost"
        onPress={() => setMode('Login')}
        disabled={isLoading}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.backdrop}>
        <AppScreen style={styles.container} safeAreaTop safeAreaBottom>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header / Brand Placeholder */}
            <Animated.View 
              style={[
                styles.header, 
                { opacity: fadeAnimHeader, transform: [{ translateY: slideAnimHeader }] }
              ]}
            >
              <View style={styles.headerTop}>
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>ServeLoco</Text>
                </View>
              </View>
              <Text style={styles.trustLine}>
                Food, snacks and essentials delivered fast.
              </Text>

              {/* Small local illustration / product image placeholder */}
              <Animated.View style={[styles.illustrationBox, { transform: [{ translateY: floatAnimIllustration }] }]}>
                <AppIcon name="shoppingBag" size={30} color={colors.primary} />
              </Animated.View>
            </Animated.View>

            {/* Auth Card */}
            <Animated.View 
              style={[
                styles.authCard, 
                { 
                  opacity: fadeAnimCard, 
                  transform: [{ translateY: slideAnimCard }, { translateX: shakeAnim }] 
                }
              ]}
            >
              <SegmentedControl
                options={['Login', 'Sign Up']}
                selectedOption={mode}
                onSelect={(opt) => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setMode(opt);
                  setErrorMsg('');
                }}
                disabled={isLoading}
              />

              <View style={styles.formContainer}>
                {mode === 'Login' ? renderLoginForm() : renderSignupForm()}
              </View>
            </Animated.View>
          </ScrollView>
        </AppScreen>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    marginBottom: spacing.xl,
    marginTop: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoPlaceholder: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  logoText: {
    ...typography.h3,
    color: colors.textInverse,
  },
  trustLine: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: '80%',
  },
  illustrationBox: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgDisabled,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  authCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.card,
  },
  formContainer: {
    marginTop: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  mainBtn: {
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
});
