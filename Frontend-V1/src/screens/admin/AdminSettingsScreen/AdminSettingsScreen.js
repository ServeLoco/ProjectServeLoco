/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppHeader,
  AppScreen,
  Button,
  TextInputField,
} from '../../../components';
import { adminSettingsApi } from '../../../api';
import {
  colors,
  entryDistance,
  motionConfig,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../theme';

const DEFAULT_FORM = {
  shopOpen: true,
  minimumOrderAmount: '',
  deliveryCharge: '',
  nightCharge: '',
  nightChargeStart: '',
  nightChargeEnd: '',
  offerId: null,
  offerTitle: '',
  offerDescription: '',
  offerActive: false,
};

const NUMERIC_FIELDS = [
  'minimumOrderAmount',
  'deliveryCharge',
  'nightCharge',
];

function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function asBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'open', 'active', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'closed', 'inactive', 'no', '0'].includes(normalized)) return false;
  }
  return fallback;
}

function asText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function getPayloadData(payload) {
  return payload?.data || payload?.settings || payload || {};
}

function getOfferData(settingsPayload, activeOfferPayload) {
  return (
    settingsPayload?.activeOffer ||
    settingsPayload?.offer ||
    settingsPayload?.active_offer ||
    settingsPayload?.data?.activeOffer ||
    settingsPayload?.data?.offer ||
    settingsPayload?.data?.active_offer ||
    activeOfferPayload?.offer ||
    activeOfferPayload?.data?.offer ||
    activeOfferPayload?.data ||
    activeOfferPayload ||
    null
  );
}

function normalizeSettings(settingsPayload, activeOfferPayload) {
  const settings = getPayloadData(settingsPayload);
  const offer = getOfferData(settingsPayload, activeOfferPayload);

  return {
    shopOpen: asBoolean(pickFirst(settings.shopOpen, settings.shop_open), true),
    minimumOrderAmount: asText(pickFirst(
      settings.minimumOrderAmount,
      settings.minimum_order_amount,
      settings.minimumOrder,
      settings.minOrder,
    )),
    deliveryCharge: asText(pickFirst(settings.deliveryCharge, settings.delivery_charge)),
    nightCharge: asText(pickFirst(settings.nightCharge, settings.night_charge)),
    nightChargeStart: asText(pickFirst(
      settings.nightChargeStart,
      settings.night_charge_start,
    )),
    nightChargeEnd: asText(pickFirst(
      settings.nightChargeEnd,
      settings.night_charge_end,
    )),
    offerId: pickFirst(offer?.id, offer?._id, offer?.offerId, null),
    offerTitle: asText(pickFirst(offer?.title, offer?.offerTitle)),
    offerDescription: asText(pickFirst(
      offer?.description,
      offer?.subtitle,
      offer?.offerDescription,
    )),
    offerActive: asBoolean(pickFirst(offer?.active, offer?.isActive), false),
  };
}

function buildSettingsPayload(form) {
  return {
    shop_open: form.shopOpen,
    minimum_order_amount: Number(form.minimumOrderAmount),
    delivery_charge: Number(form.deliveryCharge),
    night_charge: Number(form.nightCharge),
    night_charge_start: form.nightChargeStart.trim(),
    night_charge_end: form.nightChargeEnd.trim(),
  };
}

function buildOfferPayload(form) {
  return {
    title: form.offerTitle.trim(),
    description: form.offerDescription.trim(),
    active: form.offerActive,
  };
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function AdminSettingsScreen() {
  const navigation = useNavigation();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const sectionProgress = useRef(new Animated.Value(0)).current;
  const previewOpacity = useRef(new Animated.Value(1)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const isBusy = isSavingSettings || isSavingOffer;
  const offerExists = Boolean(form.offerId);

  const animateSections = useCallback(() => {
    sectionProgress.setValue(0);
    Animated.timing(sectionProgress, {
      ...motionConfig.screen,
      toValue: 1,
    }).start();
  }, [sectionProgress]);

  const animateSuccess = useCallback(message => {
    setSuccessMessage(message);
    successOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(successOpacity, {
        ...motionConfig.small,
        toValue: 1,
      }),
      Animated.delay(1400),
      Animated.timing(successOpacity, {
        ...motionConfig.small,
        toValue: 0,
      }),
    ]).start(() => setSuccessMessage(''));
  }, [successOpacity]);

  const loadSettings = useCallback((refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setLoadError('');
    setActionError('');

    Promise.allSettled([
      adminSettingsApi.getSettings(),
      adminSettingsApi.getActiveOffer(),
    ])
      .then(([settingsResult, offerResult]) => {
        if (settingsResult.status === 'rejected') {
          throw settingsResult.reason;
        }

        const activeOfferPayload = offerResult.status === 'fulfilled'
          ? offerResult.value
          : null;

        setForm({
          ...DEFAULT_FORM,
          ...normalizeSettings(settingsResult.value, activeOfferPayload),
        });
        setErrors({});
        animateSections();
      })
      .catch(error => {
        setLoadError(getErrorMessage(error, 'Unable to load settings.'));
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [animateSections]);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    previewOpacity.setValue(0);
    Animated.timing(previewOpacity, {
      ...motionConfig.small,
      toValue: 1,
    }).start();
  }, [form.offerTitle, form.offerDescription, form.offerActive, previewOpacity]);

  const updateField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setActionError('');

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  }, [errors]);

  const validateSettings = useCallback(() => {
    const nextErrors = {};

    NUMERIC_FIELDS.forEach(field => {
      const value = form[field].trim();
      if (!value) {
        nextErrors[field] = 'Required';
      } else if (Number.isNaN(Number(value)) || Number(value) < 0) {
        nextErrors[field] = 'Enter a valid amount';
      }
    });

    setErrors(prev => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }, [form]);

  const validateOffer = useCallback(() => {
    const nextErrors = {};

    if (!form.offerTitle.trim()) {
      nextErrors.offerTitle = 'Offer title is required';
    }

    if (!form.offerDescription.trim()) {
      nextErrors.offerDescription = 'Offer description is required';
    }

    setErrors(prev => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  }, [form]);

  const saveSettings = useCallback(() => {
    if (!validateSettings()) return;

    setIsSavingSettings(true);
    setActionError('');

    adminSettingsApi.updateSettings(buildSettingsPayload(form))
      .then(payload => {
        setForm(prev => ({
          ...prev,
          ...normalizeSettings(payload, null),
          offerId: prev.offerId,
          offerTitle: prev.offerTitle,
          offerDescription: prev.offerDescription,
          offerActive: prev.offerActive,
        }));
        animateSuccess('Settings saved');
      })
      .catch(error => {
        setActionError(getErrorMessage(error, 'Unable to save settings.'));
      })
      .finally(() => setIsSavingSettings(false));
  }, [animateSuccess, form, validateSettings]);

  const saveOffer = useCallback(() => {
    if (!validateOffer()) return;

    setIsSavingOffer(true);
    setActionError('');

    const payload = buildOfferPayload(form);
    const request = offerExists
      ? adminSettingsApi.updateOffer(form.offerId, payload)
      : adminSettingsApi.createOffer(payload);

    request
      .then(response => {
        const savedOffer = getOfferData(response, null) || response;
        setForm(prev => ({
          ...prev,
          offerId: pickFirst(savedOffer?.id, savedOffer?._id, prev.offerId),
          offerTitle: pickFirst(savedOffer?.title, payload.title),
          offerDescription: pickFirst(
            savedOffer?.description,
            savedOffer?.subtitle,
            payload.description,
          ),
          offerActive: asBoolean(pickFirst(savedOffer?.active, savedOffer?.isActive), payload.active),
        }));
        animateSuccess(offerExists ? 'Offer updated' : 'Offer created');
      })
      .catch(error => {
        setActionError(getErrorMessage(error, 'Unable to save offer.'));
      })
      .finally(() => setIsSavingOffer(false));
  }, [animateSuccess, form, offerExists, validateOffer]);

  const previewTitle = form.offerTitle.trim() || 'Flat 30% off on snacks & combos';
  const previewDescription = form.offerDescription.trim() || 'Limited-time offer appears here.';

  const sectionStyle = useCallback(index => ({
    opacity: sectionProgress,
    transform: [{
      translateY: sectionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [entryDistance + (index * 2), 0],
      }),
    }],
  }), [sectionProgress]);

  if (isLoading) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Settings" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="Settings" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
      >
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.stateLabel}>Connection issue</Text>
            <Text style={styles.stateTitle}>Failed to load settings</Text>
            <Text style={styles.stateText}>{loadError}</Text>
            <Button label="Retry" onPress={() => loadSettings()} fullWidth={false} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadSettings(true)}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.section, sectionStyle(0)]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>Shop Status</Text>
                  <Text style={styles.sectionSubtitle}>
                    Control whether customers can place new orders.
                  </Text>
                </View>
                <Switch
                  disabled={isBusy}
                  ios_backgroundColor={colors.borderStrong}
                  onValueChange={value => updateField('shopOpen', value)}
                  thumbColor={form.shopOpen ? colors.success : colors.bgSurface}
                  trackColor={styles.switchTrack}
                  value={form.shopOpen}
                />
              </View>
              <StatusBanner isOpen={form.shopOpen} />
            </Animated.View>

            <Animated.View style={[styles.section, sectionStyle(1)]}>
              <Text style={styles.sectionTitle}>Order Rules</Text>
              <View style={styles.inputRow}>
                <TextInputField
                  disabled={isBusy}
                  error={errors.minimumOrderAmount}
                  keyboardType="numeric"
                  label="Minimum Order"
                  onChangeText={value => updateField('minimumOrderAmount', value)}
                  placeholder="199"
                  style={styles.inputHalf}
                  value={form.minimumOrderAmount}
                />
                <TextInputField
                  disabled={isBusy}
                  error={errors.deliveryCharge}
                  keyboardType="numeric"
                  label="Delivery Charge"
                  onChangeText={value => updateField('deliveryCharge', value)}
                  placeholder="20"
                  style={styles.inputHalf}
                  value={form.deliveryCharge}
                />
              </View>
              <TextInputField
                disabled={isBusy}
                error={errors.nightCharge}
                keyboardType="numeric"
                label="Night Charge"
                onChangeText={value => updateField('nightCharge', value)}
                placeholder="30"
                value={form.nightCharge}
              />
              <View style={styles.inputRow}>
                <TextInputField
                  disabled={isBusy}
                  label="Night Start"
                  onChangeText={value => updateField('nightChargeStart', value)}
                  placeholder="22:00"
                  style={styles.inputHalf}
                  value={form.nightChargeStart}
                />
                <TextInputField
                  disabled={isBusy}
                  label="Night End"
                  onChangeText={value => updateField('nightChargeEnd', value)}
                  placeholder="06:00"
                  style={styles.inputHalf}
                  value={form.nightChargeEnd}
                />
              </View>
              <Button
                disabled={isSavingOffer}
                label="Save Settings"
                loading={isSavingSettings}
                onPress={saveSettings}
              />
            </Animated.View>

            <Animated.View style={[styles.section, sectionStyle(2)]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>Active Offer Banner</Text>
                  <Text style={styles.sectionSubtitle}>
                    This offer can appear on the customer Home screen.
                  </Text>
                </View>
                <Switch
                  disabled={isBusy}
                  ios_backgroundColor={colors.borderStrong}
                  onValueChange={value => updateField('offerActive', value)}
                  thumbColor={form.offerActive ? colors.primary : colors.bgSurface}
                  trackColor={styles.offerSwitchTrack}
                  value={form.offerActive}
                />
              </View>

              <TextInputField
                disabled={isBusy}
                error={errors.offerTitle}
                label="Offer Title"
                onChangeText={value => updateField('offerTitle', value)}
                placeholder="Flat 30% off"
                value={form.offerTitle}
              />
              <TextInputField
                disabled={isBusy}
                error={errors.offerDescription}
                label="Offer Subtitle"
                multiline
                numberOfLines={3}
                onChangeText={value => updateField('offerDescription', value)}
                placeholder="On snacks, drinks and combos"
                value={form.offerDescription}
              />

              {showPreview ? (
                <Animated.View style={[styles.previewCard, { opacity: previewOpacity }]}>
                  <View style={styles.previewHeader}>
                    <Text style={styles.previewLabel}>Offer Preview</Text>
                    <Text style={[
                      styles.previewStatus,
                      form.offerActive ? styles.previewStatusActive : styles.previewStatusInactive,
                    ]}>
                      {form.offerActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Text style={styles.previewTitle}>{previewTitle}</Text>
                  <Text style={styles.previewText}>{previewDescription}</Text>
                </Animated.View>
              ) : null}

              <View style={styles.offerActions}>
                <Button
                  disabled={isBusy}
                  label={showPreview ? 'Hide Preview' : 'Preview Offer'}
                  onPress={() => setShowPreview(prev => !prev)}
                  style={styles.secondaryButton}
                  variant="outline"
                />
                <Button
                  disabled={isSavingSettings}
                  label={offerExists ? 'Update Offer' : 'Create Offer'}
                  loading={isSavingOffer}
                  onPress={saveOffer}
                  style={styles.secondaryButton}
                />
              </View>
            </Animated.View>

            {actionError ? (
              <Text style={styles.actionError}>{actionError}</Text>
            ) : null}

            {successMessage ? (
              <Animated.View style={[styles.successToast, { opacity: successOpacity }]}>
                <Text style={styles.successText}>{successMessage}</Text>
              </Animated.View>
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function StatusBanner({ isOpen }) {
  return (
    <View style={[
      styles.statusBanner,
      isOpen ? styles.statusBannerOpen : styles.statusBannerClosed,
    ]}>
      <Text style={[
        styles.statusTitle,
        isOpen ? styles.statusTitleOpen : styles.statusTitleClosed,
      ]}>
        {isOpen ? 'Accepting Orders' : 'Shop Closed'}
      </Text>
      <Text style={styles.statusText}>
        {isOpen
          ? 'Checkout remains available for eligible customers.'
          : 'Customers can browse, but checkout should stay blocked.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  keyboardWrap: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  stateLabel: {
    ...typography.labelSmall,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  stateTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  switchTrack: {
    false: colors.borderStrong,
    true: `${colors.success}55`,
  },
  offerSwitchTrack: {
    false: colors.borderStrong,
    true: `${colors.primary}55`,
  },
  statusBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statusBannerOpen: {
    backgroundColor: colors.successLight,
    borderColor: `${colors.success}33`,
  },
  statusBannerClosed: {
    backgroundColor: colors.errorLight,
    borderColor: colors.errorBorder,
  },
  statusTitle: {
    ...typography.labelLarge,
    marginBottom: spacing.xs,
  },
  statusTitleOpen: {
    color: colors.success,
  },
  statusTitleClosed: {
    color: colors.error,
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inputHalf: {
    flex: 1,
  },
  previewCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
    marginBottom: spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  previewLabel: {
    ...typography.captionMedium,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  previewStatus: {
    ...typography.captionMedium,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  previewStatusActive: {
    color: colors.success,
    backgroundColor: colors.successLight,
  },
  previewStatusInactive: {
    color: colors.textSecondary,
    backgroundColor: colors.bgSurface,
  },
  previewTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  previewText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  offerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
  },
  actionError: {
    ...typography.bodySmall,
    color: colors.textError,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  successToast: {
    alignSelf: 'center',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.label,
    color: colors.textInverse,
  },
});

export default AdminSettingsScreen;
