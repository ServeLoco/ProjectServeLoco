import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppScreen, TextInputField, Button } from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';

export default function AdminLoginScreen() {
  const navigation = useNavigation();
  const setAdminSession = useAuthStore(state => state.setAdminSession);

  // Form State
  const [ownerId, setOwnerId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  
  // Submission State
  const [isLoading, setIsLoading] = useState(false);

  // Animations
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(20)).current;
  const errorShakeX = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [cardFade, cardSlide]);

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(errorShakeX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(errorShakeX, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const validate = () => {
    const newErrors = {};
    if (!ownerId.trim()) newErrors.ownerId = 'Owner ID is required';
    if (!password.trim()) newErrors.password = 'Password is required';

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      shakeError();
      return false;
    }
    return true;
  };

  const handleLogin = () => {
    setApiError(null);
    if (!validate()) return;

    setIsLoading(true);
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    // Mock POST /admin/login
    setTimeout(() => {
      setIsLoading(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

      if (ownerId === 'admin' && password === 'admin') {
        setAdminSession('mock-admin-jwt-token');
        // navigation.replace('AdminDashboard'); // Uncomment when AdminDashboard exists
        console.log('Login Success. Navigating to AdminDashboard');
      } else {
        setApiError('Invalid Owner ID or Password. Try admin / admin');
        shakeError();
      }
    }, 1500);
  };

  return (
    <AppScreen style={styles.container} safeAreaTop safeAreaBottom>
      
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View 
          style={[
            styles.card, 
            { 
              opacity: cardFade, 
              transform: [{ translateY: cardSlide }, { translateX: Object.keys(errors).length > 0 || apiError ? errorShakeX : 0 }] 
            }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.logoIcon}>⚙️</Text>
            <Text style={styles.title}>Admin Login</Text>
            <Text style={styles.subtitle}>Enter your credentials to access the shop dashboard.</Text>
          </View>

          <TextInputField
            label="Owner ID"
            placeholder="e.g. store_owner_1"
            value={ownerId}
            onChangeText={(t) => { setOwnerId(t); setErrors(prev => ({ ...prev, ownerId: null })); setApiError(null); }}
            error={errors.ownerId}
            autoCapitalize="none"
            editable={!isLoading}
            containerStyle={styles.inputSpacing}
          />

          <View style={styles.inputSpacing}>
            <TextInputField
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={(t) => { setPassword(t); setErrors(prev => ({ ...prev, password: null })); setApiError(null); }}
              secureTextEntry={!showPassword}
              error={errors.password}
              editable={!isLoading}
            />
            <TouchableOpacity 
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              disabled={isLoading}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {apiError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{apiError}</Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: spacing.md }}>
            <Button 
              label={isLoading ? "Authenticating..." : "Login"}
              onPress={handleLogin}
              disabled={isLoading}
              style={styles.loginBtn}
            />
          </Animated.View>

          <Button 
            label="Back to App"
            variant="ghost"
            onPress={() => navigation.goBack()}
            disabled={isLoading}
            style={styles.backBtn}
            textStyle={styles.backBtnText}
          />

        </Animated.View>
      </KeyboardAvoidingView>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.textPrimary, // Dark theme background
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  inputSpacing: {
    marginBottom: spacing.lg,
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 34, // approximate center for text input
    padding: spacing.xs,
    zIndex: 2,
  },
  eyeIcon: {
    fontSize: 16,
  },
  loginBtn: {
    width: '100%',
    marginBottom: spacing.md,
  },
  backBtn: {
    width: '100%',
  },
  backBtnText: {
    color: colors.textSecondary,
  },
  errorBanner: {
    backgroundColor: colors.error + '1A',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.error,
  },
});
