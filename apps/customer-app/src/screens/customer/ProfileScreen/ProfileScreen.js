/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Linking,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  ConfirmModal,
  TextInputField,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore, useCartStore, useSettingsStore } from '../../../stores';
import { authApi } from '../../../api';

// Policy pages are served by the API itself at /policies/* (see apps/api/src/app.js).
// Both the customer app's Linking.openURL and any web/marketing link should use
// the same path so there is one source of truth.
const POLICY_URLS = {
  privacy: 'https://api.serveloco.app/policies/privacy',
  terms: 'https://api.serveloco.app/policies/terms',
};

// Brand-level contact links. Update these when social handles change.
const BRAND_LINKS = {
  instagram: 'https://instagram.com/villkro',
  contactEmail: 'mailto:decodelabsofficial@gmail.com',
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const user = useAuthStore(state => state.user);
  const profile = useAuthStore(state => state.profile);
  const setProfile = useAuthStore(state => state.setProfile);
  const logout = useAuthStore(state => state.logout);
  const clearCart = useCartStore(state => state.clearCart);
  const supportPhone = useSettingsStore(state => state.supportPhone);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Three-step soft-delete flow: 'password' (ask for current password) →
  // 'confirm' (inform user about 30-day grace, ask to proceed) →
  // 'pending' (deletion scheduled, show banner with Cancel button).
  const [deleteStep, setDeleteStep] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');

  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(10)).current;
  const listAnim1 = useRef(new Animated.Value(0)).current;
  const listAnim2 = useRef(new Animated.Value(0)).current;
  const listAnim3 = useRef(new Animated.Value(0)).current;

  const loadProfile = React.useCallback((refresh = false) => {
    if (refresh) setIsRefreshing(true);
    authApi.getMe()
      .then(response => {
        const nextProfile = response?.user || response?.profile || response?.data || response;
        setProfile(nextProfile);
      })
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  }, [setProfile]);

  useEffect(() => {
    loadProfile();

    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(listAnim1, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(listAnim2, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(listAnim3, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [loadProfile]);

  const handleHelpSupport = () => {
    if (supportPhone) {
      Linking.openURL(`tel:${supportPhone}`);
    }
  };

  const openLink = (url) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open link', url);
    });
  };

  const handleLogout = () => {
    clearCart();
    logout();
    setShowLogoutConfirm(false);
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await authApi.requestAccountDeletion({ password: deletePassword });
      // Reload profile so the banner with the scheduled-delete date appears.
      loadProfile(true);
      setDeleteStep('pending');
    } catch (err) {
      Alert.alert(
        'Could not schedule account deletion',
        err?.response?.data?.message || err?.message || 'Please try again or contact support.'
      );
      setDeleteStep('confirm');
    } finally {
      setIsDeleting(false);
      setDeletePassword('');
    }
  };

  const handleCancelDeletion = async () => {
    setIsDeleting(true);
    try {
      await authApi.cancelAccountDeletion();
      loadProfile(true);
      setDeleteStep('confirm');
    } catch (err) {
      Alert.alert(
        'Could not cancel account deletion',
        err?.response?.data?.message || err?.message || 'Please try again.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="Profile" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadProfile(true)}
            tintColor={colors.primary}
            colors={[colors.primary, colors.success, colors.saffron]}
            title="Refreshing VillKro"
            titleColor={colors.textSecondary}
          />
        }
      >

        {/* Profile Card */}
        <Animated.View style={[styles.profileCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}>
          <View style={styles.profileTopRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={styles.identityBlock}>
              <Text style={styles.profileName} numberOfLines={1}>{profile?.name || 'User'}</Text>
              <Text style={styles.profilePhone} numberOfLines={1}>{user?.phone || 'No phone added'}</Text>
              <View style={styles.memberChip}>
                <AppIcon name="star" size={12} color={colors.warning} />
                <Text style={styles.memberChipText}>VillKro Member</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editIconBtn}
              onPress={() => navigation.navigate('EditProfile')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <AppIcon name="edit" size={17} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfoGrid}>
            <View style={styles.infoTile}>
              <View style={styles.infoTileIcon}>
                <AppIcon name="phone" size={16} color={colors.primary} />
              </View>
              <Text style={styles.infoTileLabel}>Phone</Text>
              <Text style={styles.infoTileValue} numberOfLines={1}>{user?.phone || 'Not added'}</Text>
            </View>
            <View style={styles.infoTile}>
              <View style={styles.infoTileIcon}>
                <AppIcon name="orders" size={16} color={colors.primary} />
              </View>
              <Text style={styles.infoTileLabel}>Orders</Text>
              <Text style={styles.infoTileValue} numberOfLines={1}>{profile?.orderCount ?? 0}</Text>
            </View>
            <View style={styles.infoTile}>
              <View style={styles.infoTileIcon}>
                <AppIcon name="star" size={16} color={colors.primary} />
              </View>
              <Text style={styles.infoTileLabel}>Status</Text>
              <Text style={styles.infoTileValue} numberOfLines={1}>
                {profile?.status || (profile?.trusted ? 'Trusted' : 'Active')}
              </Text>
            </View>
          </View>

          <View style={styles.addressPanel}>
            <AppIcon name="location" size={17} color={colors.textSecondary} />
            <Text style={styles.addressText} numberOfLines={2}>
              {profile?.address || 'No address added yet.'}
            </Text>
          </View>

          {profile?.status === 'Blocked' && (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>Your account is currently restricted. Contact support.</Text>
            </View>
          )}

          {profile?.deletionRequestedAt && (
            <View style={styles.deletionBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AppIcon name="warning" size={18} color={colors.error} />
                <Text style={styles.deletionBannerTitle}>Account deletion scheduled</Text>
              </View>
              <Text style={styles.deletionBannerBody}>
                Your account and data will be permanently deleted on{' '}
                <Text style={{ fontWeight: '700' }}>
                  {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
                    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>{' '}
                (30 days from when you confirmed).
              </Text>
              <TouchableOpacity
                style={styles.cancelDeleteBtn}
                onPress={handleCancelDeletion}
                disabled={isDeleting}
              >
                <Text style={styles.cancelDeleteBtnText}>
                  {isDeleting ? 'Cancelling…' : 'Cancel deletion'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* Menu Options */}
        <Animated.View style={[styles.menuGroup, { opacity: listAnim1, transform: [{ translateY: listAnim1.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>Account</Text>
          <View style={styles.menuCard}>
            <MenuOption
              icon="Edit"
              label="Edit Profile"
              caption="Name, phone, address"
              onPress={() => navigation.navigate('EditProfile')}
            />
            <MenuOption
              icon="Box"
              label="My Orders"
              caption="Track current and past orders"
              onPress={() => navigation.navigate('MainTabs', { screen: 'Orders' })}
            />
            <MenuOption
              icon="Pin"
              label="Saved Address"
              caption="Delivery address details"
              onPress={() => navigation.navigate('EditProfile')} // Route to EditProfile for now
              isLast
            />
          </View>
        </Animated.View>

        <Animated.View style={[styles.menuGroup, { opacity: listAnim2, transform: [{ translateY: listAnim2.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>Support</Text>
          <View style={styles.menuCard}>
            <MenuOption
              icon="Help"
              label="Help and Support"
              caption={supportPhone ? `Call ${supportPhone}` : 'Contact shop support'}
              onPress={handleHelpSupport}
            />
            <MenuOption
              icon="Privacy"
              label="Privacy Policy"
              caption="How we handle your data"
              onPress={() => openLink(POLICY_URLS.privacy)}
            />
            <MenuOption
              icon="Terms"
              label="Terms of Service"
              caption="Rules for using VillKro"
              onPress={() => openLink(POLICY_URLS.terms)}
            />
            <MenuOption
              icon="DataSafety"
              label="Data Safety"
              caption="Permissions, sharing and retention"
              onPress={() => openLink(POLICY_URLS.privacy)}
            />
            <MenuOption
              icon="Instagram"
              label="Follow us on Instagram"
              caption="@villkro"
              onPress={() => openLink(BRAND_LINKS.instagram)}
            />
            <MenuOption
              icon="Contact"
              label="Contact us"
              caption="decodelabsofficial@gmail.com"
              onPress={() => openLink(BRAND_LINKS.contactEmail)}
              isLast
            />
          </View>
        </Animated.View>

        <Animated.View style={[styles.menuGroup, { opacity: listAnim3, transform: [{ translateY: listAnim3.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>Account actions</Text>
          <View style={styles.menuCard}>
            <MenuOption
              icon="Logout"
              label="Logout"
              caption="Log out from this device."
              onPress={() => setShowLogoutConfirm(true)}
            />
            <MenuOption
              icon="DeleteAccount"
              label="Delete Account"
              caption="Scheduled deletion with a 30-day grace period"
              onPress={() => { setDeletePassword(''); setDeleteStep('password'); }}
              isDestructive
              isLast
            />
          </View>
        </Animated.View>

      </ScrollView>

      <ConfirmModal
        visible={showLogoutConfirm}
        title="Logout?"
        message="You will need to login again to place orders and view your account."
        confirmLabel="Logout"
        cancelLabel="Stay"
        confirmVariant="danger"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />

      {/* Soft-delete flow — step 1: ask for current password to verify identity. */}
      <DeletePasswordModal
        visible={deleteStep === 'password'}
        password={deletePassword}
        onChangePassword={setDeletePassword}
        loading={isDeleting}
        onCancel={() => { setDeleteStep(null); setDeletePassword(''); }}
        onConfirm={() => setDeleteStep('confirm')}
      />

      {/* Soft-delete flow — step 2: warn + confirm. */}
      <ConfirmModal
        visible={deleteStep === 'confirm'}
        title="Schedule account deletion?"
        message="Your account and data will be permanently deleted 30 days from now. You can cancel anytime in this Profile screen during the grace period — just tap 'Cancel deletion' on the red banner."
        confirmLabel="Schedule deletion"
        cancelLabel="Keep account"
        confirmVariant="danger"
        confirmLoading={isDeleting}
        onCancel={() => setDeleteStep('password')}
        onConfirm={handleDeleteAccount}
      />

      {/* Soft-delete flow — step 3: success, show info card with close button. */}
      <ConfirmModal
        visible={deleteStep === 'pending'}
        title="Deletion scheduled"
        message="Your account will be permanently deleted in 30 days. You can keep using the app until then. To undo, tap 'Cancel deletion' on the red banner above — your account and data will be fully restored."
        confirmLabel="Got it"
        cancelLabel={false}
        confirmVariant="primary"
        onCancel={null}
        onConfirm={() => setDeleteStep(null)}
      />
    </AppScreen>
  );
}

/**
 * Step-1 modal for the soft-delete flow. Reuses ConfirmModal (which now
 * accepts children) so the password input sits between the message and the
 * action row. The eye toggle is local to this component.
 */
function DeletePasswordModal({ visible, password, onChangePassword, loading, onCancel, onConfirm }) {
  const [showPassword, setShowPassword] = useState(false);
  const confirmDisabled = loading || !password;

  return (
    <ConfirmModal
      visible={visible}
      title="Delete account?"
      message="To confirm, enter your current password. We'll mark your account for permanent deletion in 30 days — you can cancel anytime before then."
      confirmLabel="Continue"
      cancelLabel="Cancel"
      confirmVariant="danger"
      confirmLoading={loading}
      onCancel={onCancel}
      onConfirm={confirmDisabled ? undefined : onConfirm}
    >
      <View style={styles.passwordWrap}>
        <Text style={styles.passwordLabel}>Your password</Text>
        <View style={styles.passwordRow}>
          <TextInputField
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={onChangePassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(s => !s)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <AppIcon name={showPassword ? 'Hide' : 'Show'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </ConfirmModal>
  );
}

function MenuOption({ icon, label, caption, onPress, isDestructive, isLast }) {
  const iconNameByLabel = {
    Edit: 'edit',
    Box: 'orders',
    Pin: 'location',
    Help: 'phone',
    Privacy: 'lock',
    Terms: 'settings',
    DataSafety: 'check',
    Instagram: 'atsign',
    Contact: 'mail',
    Logout: 'logout',
    DeleteAccount: 'delete',
  };
  const iconColor = isDestructive ? colors.error : colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.menuOption}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.menuIconWrap}>
        <AppIcon name={iconNameByLabel[icon] || 'box'} size={19} color={iconColor} />
      </View>
      <View style={[styles.menuTextBlock, isLast && styles.menuTextBlockLast]}>
        <Text style={[styles.menuLabel, isDestructive && { color: colors.error }]}>
          {label}
        </Text>
        {caption ? <Text style={styles.menuCaption} numberOfLines={1}>{caption}</Text> : null}
      </View>
      <AppIcon name="down" size={18} color={colors.textTertiary} style={styles.menuChevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    padding: spacing.md,
    // Bottom padding needs to clear the floating tab bar in CustomerBottomTabs
    // (height 64 + bottom offset 16 = 80px) plus some breathing room. The old
    // value used spacing.xxxl which is undefined in this theme, so the result
    // was NaN and React Native silently treated it as 0, hiding the last row.
    paddingBottom: 120,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  profileCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.cardRaised,
    overflow: 'hidden',
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  avatarText: {
    ...typography.h2,
    color: colors.textInverse,
    fontWeight: '900',
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
  },
  editIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  profileName: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '900',
    marginBottom: 2,
  },
  profilePhone: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.warningLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  memberChipText: {
    ...typography.caption,
    color: colors.successDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  profileInfoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoTile: {
    flex: 1,
    minHeight: 74,
    borderRadius: radius.lg,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  infoTileIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  infoTileLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoTileValue: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    marginTop: 1,
  },
  addressPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  addressText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  blockedBanner: {
    marginTop: spacing.md,
    backgroundColor: colors.error + '1A',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  blockedText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  deletionBanner: {
    marginTop: spacing.md,
    backgroundColor: '#fef3c7',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f59e0b',
    padding: spacing.md,
    gap: 4,
  },
  deletionBannerTitle: {
    ...typography.bodyStrong,
    color: '#92400e',
  },
  deletionBannerBody: {
    ...typography.caption,
    color: '#78350f',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  cancelDeleteBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: '#92400e',
  },
  cancelDeleteBtnText: {
    ...typography.caption,
    color: '#fff7ed',
    fontWeight: '700',
  },
  passwordWrap: {
    marginBottom: spacing.md,
  },
  passwordLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'left',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  menuGroup: {
    marginBottom: spacing.md,
  },
  menuGroupTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  menuCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgSurface,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgApp,
    marginRight: spacing.sm,
  },
  menuTextBlock: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingRight: spacing.sm,
  },
  menuTextBlockLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    lineHeight: 18,
  },
  menuCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 15,
  },
  menuChevron: {
    transform: [{ rotate: '-90deg' }],
    marginLeft: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.xl,
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  modalActions: {
    width: '100%',
    gap: spacing.md,
  },
  modalBtn: {
    width: '100%',
  },
});
