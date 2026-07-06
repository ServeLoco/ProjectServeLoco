import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  AppHeader,
  TextInputField,
  Button,
} from '../../../components';
import { colors, spacing } from '../../../theme';
import { useAuthStore } from '../../../stores';
import { authApi } from '../../../api';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore(state => state.profile);
  const setProfile = useAuthStore(state => state.setProfile);

  // Form State
  const [name, setName] = useState(profile?.name || '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || '');
  const [address, setAddress] = useState(profile?.address || '');

  // Validation State
  const [errors, setErrors] = useState({});

  // Submission State
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Animations
  const field1Anim = useRef(new Animated.Value(0)).current;
  const field2Anim = useRef(new Animated.Value(0)).current;
  const field3Anim = useRef(new Animated.Value(0)).current;
  
  const errorShakeX = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(field1Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(field2Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(field3Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [field1Anim, field2Anim, field3Anim]);

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
    if (!name.trim()) newErrors.name = 'Full name is required';
    if (whatsapp && !/^[0-9]{10}$/.test(whatsapp)) {
      newErrors.whatsapp = 'WhatsApp must be a 10-digit number';
    }
    if (!address.trim()) newErrors.address = 'Delivery address is required';

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      shakeError();
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    try {
      const response = await authApi.updateProfile({
        name,
        fullName: name,
        whatsappNumber: whatsapp,
        whatsapp,
        deliveryAddress: address,
        address,
      });
      const updatedProfile = response?.user || response?.profile || response?.data || { ...profile, name, whatsapp, address };
      setIsSaving(false);
      setIsSuccess(true);
      setProfile(updatedProfile);
      setTimeout(() => {
        navigation.goBack();
      }, 800);
    } catch (error) {
      setIsSaving(false);
      setErrors(prev => ({ ...prev, form: error.message || 'Unable to save profile' }));
      shakeError();
    }
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="Edit Profile" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <Animated.View style={{ opacity: field1Anim, transform: [{ translateY: field1Anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { translateX: errors.name ? errorShakeX : 0 }] }}>
            <TextInputField
              label="Full Name"
              placeholder="e.g. John Doe"
              value={name}
              onChangeText={(t) => { setName(t); setErrors(prev => ({ ...prev, name: null })); }}
              error={errors.name}
              containerStyle={styles.inputGroup}
            />
          </Animated.View>

          <Animated.View style={{ opacity: field2Anim, transform: [{ translateY: field2Anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { translateX: errors.whatsapp ? errorShakeX : 0 }] }}>
            <TextInputField
              label="WhatsApp Number (Optional)"
              placeholder="e.g. 9876543210"
              value={whatsapp}
              onChangeText={(t) => { setWhatsapp(t); setErrors(prev => ({ ...prev, whatsapp: null })); }}
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.whatsapp}
              containerStyle={styles.inputGroup}
            />
          </Animated.View>

          <Animated.View style={{ opacity: field3Anim, transform: [{ translateY: field3Anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { translateX: errors.address ? errorShakeX : 0 }] }}>
            <TextInputField
              label="Delivery Address"
              placeholder="House No, Building, Street, Area"
              value={address}
              onChangeText={(t) => { setAddress(t); setErrors(prev => ({ ...prev, address: null })); }}
              multiline
              numberOfLines={4}
              error={errors.address}
              containerStyle={styles.inputGroup}
            />
          </Animated.View>

          {/* Form-level error (e.g. network failure on save) */}
          {errors.form ? (
            <View style={styles.formErrorBox}>
              <Text style={styles.formErrorText} numberOfLines={3}>
                {errors.form}
              </Text>
            </View>
          ) : null}

        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: spacing.lg + insets.bottom }]}>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <Button
              label={isSaving ? "Saving..." : isSuccess ? "Saved Successfully! Done" : "Save Changes"}
              onPress={handleSave}
              disabled={isSaving || isSuccess}
              loading={isSaving}
              style={[styles.saveBtn, isSuccess && { backgroundColor: colors.success, borderColor: colors.success }]}
            />
          </Animated.View>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => navigation.goBack()}
            disabled={isSaving || isSuccess}
          />
        </View>
      </KeyboardAvoidingView>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  saveBtn: {
    marginBottom: spacing.xs,
  },
  formErrorBox: {
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.35)',
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  formErrorText: {
    color: '#C62828',
    fontSize: 13,
    fontWeight: '500',
  },
});
