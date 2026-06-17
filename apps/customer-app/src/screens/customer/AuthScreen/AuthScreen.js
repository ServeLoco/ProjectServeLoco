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
  Image,
  Keyboard,
  TouchableOpacity,
  Linking,
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
import { loginLogo } from '../../../assets';

const POLICY_URLS = {
  privacy: 'https://api.serveloco.app/policies/privacy',
  terms: 'https://api.serveloco.app/policies/terms',
};

export default function AuthScreen() {
  const setSession = useAuthStore(state => state.setSession);

  const [mode, setMode] = useState('Login'); // 'Login' | 'Sign Up' | 'Reset Password'
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Input refs for keyboard "Next" chaining
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  const resetPasswordRef = useRef(null);
  const resetConfirmRef = useRef(null);

  // Animations
  const fadeAnimHeader = useRef(new Animated.Value(0)).current;
  const slideAnimHeader = useRef(new Animated.Value(20)).current;
  const fadeAnimCard = useRef(new Animated.Value(0)).current;
  const slideAnimCard = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef(null);

  useEffect(() => {
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

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardVisible(true);
      // Scroll to bottom so active input is visible
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideListener = Keyboard.addListener(hideEvent, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardVisible(false);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
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

  const submitSignup = async () => {
    if (!name.trim() || !phone || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields');
      triggerShake();
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('Please accept the Terms of Service and Privacy Policy to continue');
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

  const switchMode = (newMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(newMode);
    setErrorMsg('');
    setSuccessMsg('');
    setPassword('');
    setConfirmPassword('');
    setTermsAccepted(false);
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        inputRef={phoneRef}
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
      />
      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      {!!successMsg && <Text style={styles.successText}>{successMsg}</Text>}
      <Button label="Login" onPress={submitLogin} loading={isLoading} style={styles.mainBtn} />
      <Button
        label="Forgot password?"
        variant="ghost"
        onPress={() => switchMode('Reset Password')}
        disabled={isLoading}
      />
      <Button
        label="Create an account"
        variant="ghost"
        onPress={() => switchMode('Sign Up')}
        disabled={isLoading}
      />
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
      />
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
      />
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
      />
      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setTermsAccepted(prev => !prev)}
        activeOpacity={0.7}
        disabled={isLoading}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: termsAccepted }}
        accessibilityLabel="Accept Terms of Service and Privacy Policy"
      >
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <AppIcon name="check" size={13} color={colors.textInverse} />}
        </View>
        <Text style={styles.termsText}>
          I agree to the{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL(POLICY_URLS.terms)}>
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL(POLICY_URLS.privacy)}>
            Privacy Policy
          </Text>
        </Text>
      </TouchableOpacity>
      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <Button label="Create Account" onPress={submitSignup} loading={isLoading} style={styles.mainBtn} />
      <Button
        label="Already have an account? Login"
        variant="ghost"
        onPress={() => switchMode('Login')}
        disabled={isLoading}
      />
    </View>
  );

  const renderResetPasswordForm = () => (
    <View style={styles.form}>
      <TextInputField
        label="Phone Number"
        placeholder="Registered mobile number"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!isLoading}
        returnKeyType="next"
        onSubmitEditing={() => resetPasswordRef.current?.focus()}
        inputRef={phoneRef}
      />
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
      />
      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <Button
        label="Send for Approval"
        onPress={submitPasswordResetRequest}
        loading={isLoading}
        style={styles.mainBtn}
      />
      <Button
        label="Back to Login"
        variant="ghost"
        onPress={() => switchMode('Login')}
        disabled={isLoading}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
    >
      <View style={styles.backdrop}>
        <AppScreen style={styles.container} safeAreaTop safeAreaBottom>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View
              style={[
                styles.header,
                { opacity: fadeAnimHeader, transform: [{ translateY: slideAnimHeader }] }
              ]}
            >
              {!isKeyboardVisible && (
                <View style={styles.headerTop}>
                  <Image
                    source={loginLogo}
                    style={styles.logoImage}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                </View>
              )}
            </Animated.View>

            <Animated.View
              style={[
                styles.authCard,
                {
                  opacity: fadeAnimCard,
                  transform: [{ translateY: slideAnimCard }, { translateX: shakeAnim }],
                }
              ]}
            >
              <SegmentedControl
                options={['Login', 'Sign Up']}
                selectedOption={mode === 'Reset Password' ? 'Login' : mode}
                onSelect={(opt) => {
                  switchMode(opt);
                }}
                disabled={isLoading}
              />

              <View style={styles.formContainer}>
                {mode === 'Login' && renderLoginForm()}
                {mode === 'Sign Up' && renderSignupForm()}
                {mode === 'Reset Password' && renderResetPasswordForm()}
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  headerTop: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: 250,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
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
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
  successText: {
    ...typography.caption,
    color: colors.success,
    textAlign: 'center',
  },
});
