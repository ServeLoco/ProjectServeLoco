/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef, useState } from 'react';
import appJson from '../../../../app.json';
import * as Application from 'expo-application';
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
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  ConfirmModal,
} from '../../../components';
import * as Notifications from 'expo-notifications';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore, useCartStore, useSettingsStore } from '../../../stores';
import { authApi } from '../../../api';
import { requestNotificationPermission } from '../../../hooks/useLocalNotifications';
import { useRefetchOnFocus } from '../../../hooks/useRefetchOnFocus';

// Policy pages are served by the API itself at /policies/* (see apps/api/src/app.js).
// Both the customer app's Linking.openURL and any web/marketing link should use
// the same path so there is one source of truth.
const POLICY_URLS = {
  privacy: 'https://api.villkro.in/policies/privacy',
  terms: 'https://api.villkro.in/policies/terms',
};

// Brand-level contact links. Update these when they change.
const BRAND_LINKS = {
  contactEmail: 'mailto:decodelabsofficial@gmail.com',
};

// Section configuration — kept in one place so the menu reads like a
// declarative table of contents. Each row links to the original feature
// with the same handler signature.
const MENU_SECTIONS = [
  {
    key: 'account',
    title: 'Account',
    rows: [
      {
        key: 'edit',
        gradient: ['#FFB07A', '#F0611E'],
        icon: 'pencil',
        label: 'Edit Profile',
        caption: 'Name, phone, address',
        action: 'editProfile',
      },
      {
        key: 'orders',
        gradient: ['#7CB4FF', '#2563EB'],
        icon: 'orders',
        label: 'My Orders',
        caption: 'Track current and past orders',
        action: 'orders',
      },
      {
        key: 'notifications',
        gradient: ['#FCD34D', '#F59E0B'],
        icon: 'notification',
        label: 'Notifications',
        caption: 'notifStatus',
        action: 'notifications',
        isLast: true,
      },
    ],
  },
  {
    key: 'support',
    title: 'Support & Legal',
    rows: [
      {
        key: 'help',
        gradient: ['#5EE39A', '#16A34A'],
        icon: 'whatsapp',
        label: 'Help & Support',
        caption: 'supportPhone',
        action: 'help',
      },
      {
        key: 'privacy',
        gradient: ['#A5B4FC', '#5B5BD6'],
        icon: 'lock',
        label: 'Privacy Policy',
        caption: 'How we handle your data',
        action: 'privacy',
      },
      {
        key: 'terms',
        gradient: ['#A3B1C6', '#475569'],
        icon: 'settings',
        label: 'Terms of Service',
        caption: 'Rules for using VillKro',
        action: 'terms',
      },
      {
        key: 'data',
        gradient: ['#5EEAD4', '#0D9488'],
        icon: 'check',
        label: 'Data Safety',
        caption: 'Permissions, sharing and retention',
        action: 'dataSafety',
      },
      {
        key: 'contact',
        gradient: ['#7DD3FC', '#0284C7'],
        icon: 'mail',
        label: 'Contact us',
        caption: 'decodelabsofficial@gmail.com',
        action: 'contact',
        isLast: true,
      },
    ],
  },
  {
    key: 'actions',
    title: 'Account actions',
    rows: [
      {
        key: 'logout',
        gradient: ['#FDBA74', '#C2410C'],
        icon: 'logout',
        label: 'Logout',
        caption: 'Log out from this device',
        action: 'logout',
      },
      {
        key: 'delete',
        gradient: ['#FCA5A5', '#DC2626'],
        icon: 'delete',
        label: 'Delete Account',
        caption: '30-day grace period before permanent deletion',
        action: 'delete',
        isLast: true,
        destructive: true,
      },
    ],
  },
];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const user = useAuthStore(state => state.user);
  const profile = useAuthStore(state => state.profile);
  const setProfile = useAuthStore(state => state.setProfile);
  const logout = useAuthStore(state => state.logout);
  const clearCart = useCartStore(state => state.clearCart);
  const supportPhone = useSettingsStore(state => state.supportPhone);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notifStatus, setNotifStatus] = useState(null); // 'granted' | 'denied' | 'undetermined' | null (loading)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Two-step soft-delete flow: 'confirm' (inform user about 30-day grace,
  // ask to proceed) → 'pending' (deletion scheduled, show banner with Cancel button).
  const [deleteStep, setDeleteStep] = useState(null);

  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(16)).current;
  const sectionsFade = useRef(new Animated.Value(0)).current;
  const sectionsSlide = useRef(new Animated.Value(12)).current;

  const loadProfile = React.useCallback((refresh = false) => {
    if (refresh) setIsRefreshing(true);
    // Capture session identity so a stale /auth/me from a previous login
    // cannot overwrite the current account's profile (token/user desync).
    const { token: requestToken, sessionGeneration } = useAuthStore.getState();
    authApi.getMe()
      .then(response => {
        const current = useAuthStore.getState();
        if (
          current.sessionGeneration !== sessionGeneration
          || (requestToken && current.token !== requestToken)
        ) {
          return;
        }
        const nextProfile = response?.user || response?.profile || response?.data || response;
        if (nextProfile) setProfile(nextProfile);
      })
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  }, [setProfile]);

  // Live OS permission state — re-checked whenever the screen (re)gains focus
  // so a user who flips it in system Settings sees it reflected here too.
  const refreshNotifStatus = React.useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setNotifStatus(status))
      .catch(() => setNotifStatus('undetermined'));
  }, []);

  useEffect(() => {
    loadProfile();
    refreshNotifStatus();

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(heroFade, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(heroSlide, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(sectionsFade, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(sectionsSlide, { toValue: 0, duration: 360, useNativeDriver: true }),
      ]),
    ]).start();
  }, [loadProfile]);

  // Refetch the profile whenever the app returns to the foreground
  // (e.g. after the user opens WhatsApp from "Help & Support"). Without
  // this the screen stays mounted with stale data and looks empty.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadProfile(true);
        refreshNotifStatus();
      }
    });
    return () => subscription?.remove?.();
  }, [loadProfile, refreshNotifStatus]);

  // Coming back to this tab reloads the profile and the notification
  // permission quietly (loadProfile without `refresh` shows no spinner).
  useRefetchOnFocus(() => {
    loadProfile();
    refreshNotifStatus();
  });

  const handleHelpSupport = () => {
    if (supportPhone) {
      const digits = String(supportPhone).replace(/[^0-9]/g, '');
      const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
      openLink(`https://wa.me/${withCountryCode}`);
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
      await authApi.requestAccountDeletion({});
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

  const handleNotificationsRow = async () => {
    if (notifStatus === 'denied') {
      // Android/iOS won't re-show the system dialog once denied — the only
      // way back is the app's own notification settings page.
      Linking.openSettings().catch(() => {});
      return;
    }
    if (notifStatus === 'granted') {
      Alert.alert('Notifications are on', "You'll get order updates and offers on this device.");
      return;
    }
    const result = await requestNotificationPermission();
    setNotifStatus(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'undetermined');
  };

  const handleRowAction = (action) => {
    switch (action) {
      case 'notifications':
        handleNotificationsRow();
        break;
      case 'editProfile':
        navigation.navigate('EditProfile');
        break;
      case 'orders':
        navigation.navigate('MainTabs', { screen: 'Orders' });
        break;
      case 'help':
        handleHelpSupport();
        break;
      case 'privacy':
        openLink(POLICY_URLS.privacy);
        break;
      case 'terms':
        openLink(POLICY_URLS.terms);
        break;
      case 'dataSafety':
        openLink(POLICY_URLS.privacy);
        break;
      case 'contact':
        openLink(BRAND_LINKS.contactEmail);
        break;
      case 'logout':
        setShowLogoutConfirm(true);
        break;
      case 'delete':
        setDeleteStep('confirm');
        break;
      default:
        break;
    }
  };

  const statusLabel = profile?.status || (profile?.trusted ? 'Trusted' : 'Active');
  const statusColor =
    statusLabel === 'Blocked' ? colors.error :
    statusLabel === 'Trusted' ? colors.success :
    '#3FE09D';

  return (
    <AppScreen style={styles.container} bg={colors.bgSurface} safeAreaBottom={false}>
      <AppHeader title="Profile" bordered />

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
        {/* Hero: dark card, avatar with saffron ring, identity */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: heroFade, transform: [{ translateY: heroSlide }] },
          ]}
        >
          <LinearGradient
            colors={['#2A303D', '#0E1116']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Soft saffron glow fading in from the top-right corner */}
            <LinearGradient
              colors={['rgba(255,122,58,0.30)', 'rgba(255,122,58,0.08)', 'rgba(255,122,58,0)']}
              locations={[0, 0.45, 1]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.2, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            <View style={styles.heroTopRow}>
              <View style={styles.avatarWrap}>
                <LinearGradient
                  colors={[colors.brandGradientStart, colors.brandGradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarRing}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.avatarBadge}>
                  <AppIcon name="star" size={10} color={colors.textInverse} strokeWidth={3} />
                </View>
              </View>

              <View style={styles.heroIdentity}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {profile?.name || 'Welcome to VillKro'}
                </Text>
                <View style={styles.heroPhoneRow}>
                  <AppIcon name="phone" size={12} color="rgba(255,255,255,0.6)" strokeWidth={2.4} />
                  <Text style={styles.heroPhone} numberOfLines={1}>
                    {user?.phone || 'No phone added'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.heroEditBtn}
                onPress={() => navigation.navigate('EditProfile')}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                activeOpacity={0.78}
              >
                <AppIcon name="pencil" size={16} color={colors.textInverse} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroChipsRow}>
              <View style={styles.heroChip}>
                <AppIcon name="star" size={11} color="#FBBF24" strokeWidth={2.6} />
                <Text style={styles.heroChipText}>VillKro Member</Text>
              </View>
              <View style={styles.heroChip}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.heroChipText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Delivery address */}
        <View style={styles.addressCard}>
          <IconTile icon="location" gradient={[colors.brandGradientStart, '#F0611E']} round />
          <View style={styles.addressContent}>
            <Text style={styles.addressLabel}>Delivery address</Text>
            <Text style={styles.addressText} numberOfLines={2}>
              {profile?.address || 'No address added yet. Tap to set your delivery location.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addressEditChip}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Edit address"
          >
            <AppIcon name="pencil" size={12} color={colors.textInverse} strokeWidth={2.6} />
            <Text style={styles.addressEditChipText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Status banners (blocked / pending deletion) */}
        {profile?.status === 'Blocked' && (
          <View style={styles.blockedBanner}>
            <View style={styles.blockedBannerIcon}>
              <AppIcon name="close" size={14} color={colors.error} strokeWidth={2.6} />
            </View>
            <Text style={styles.blockedText}>
              Your account is currently restricted. Contact support to restore access.
            </Text>
          </View>
        )}

        {profile?.deletionRequestedAt && (
          <View style={styles.deletionBanner}>
            <View style={styles.deletionBannerHead}>
              <View style={styles.deletionBannerIcon}>
                <AppIcon name="warning" size={14} color="#B45309" strokeWidth={2.6} />
              </View>
              <Text style={styles.deletionBannerTitle}>Account deletion scheduled</Text>
            </View>
            <Text style={styles.deletionBannerBody}>
              Your account and data will be permanently deleted on{' '}
              <Text style={styles.deletionBannerDate}>
                {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000)
                  .toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>{' '}
              (30 days from confirmation).
            </Text>
            <TouchableOpacity
              style={styles.cancelDeleteBtn}
              onPress={handleCancelDeletion}
              disabled={isDeleting}
              activeOpacity={0.78}
            >
              <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.cancelDeleteBtnText}>
                {isDeleting ? 'Cancelling…' : 'Cancel deletion'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu sections */}
        <Animated.View
          style={[
            styles.menuContainer,
            { opacity: sectionsFade, transform: [{ translateY: sectionsSlide }] },
          ]}
        >
          {MENU_SECTIONS.map((section) => (
            <View key={section.key} style={styles.menuSection}>
              <Text style={styles.menuSectionTitle}>{section.title}</Text>
              <View style={styles.menuCard}>
                {section.rows.map((row) => {
                  const caption = row.caption === 'supportPhone'
                    ? (supportPhone ? `Chat on WhatsApp (+91 ${supportPhone.replace(/[^0-9]/g, '').slice(-10)})` : 'Contact shop support')
                    : row.caption === 'notifStatus'
                    ? (notifStatus === 'granted' ? 'On — order and offer updates'
                      : notifStatus === 'denied' ? 'Off — tap to enable in Settings'
                      : notifStatus === null ? 'Checking…'
                      : 'Off — tap to enable')
                    : row.caption;
                  return (
                    <MenuRow
                      key={row.key}
                      icon={row.icon}
                      gradient={row.gradient}
                      label={row.label}
                      caption={caption}
                      destructive={row.destructive}
                      isLast={row.isLast}
                      onPress={() => handleRowAction(row.action)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLine}>
            <Text style={styles.footerBrand}>Developed in Gorakhpur with </Text>
            <Text style={styles.footerHeart}>❤️</Text>
            <Text style={styles.footerBrand}> (Haryana)</Text>
          </View>
          {/* Native binary version — what's actually installed from the Play
              Store. appJson.expo.version is only a fallback because after an
              OTA update it reflects the JS bundle, not the installed binary. */}
          <View style={styles.footerVersionPill}>
            <Text style={styles.footerVersion}>
              v{Application.nativeApplicationVersion ?? appJson?.expo?.version ?? '1.1.1'}
            </Text>
          </View>
        </View>
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

      {/* Soft-delete flow — step 1: warn + confirm. */}
      <ConfirmModal
        visible={deleteStep === 'confirm'}
        title="Schedule account deletion?"
        message="Your account and data will be permanently deleted 30 days from now. You can cancel anytime in this Profile screen during the grace period — just tap 'Cancel deletion' on the banner above."
        confirmLabel="Schedule deletion"
        cancelLabel="Keep account"
        confirmVariant="danger"
        confirmLoading={isDeleting}
        onCancel={() => setDeleteStep(null)}
        onConfirm={handleDeleteAccount}
      />

      {/* Soft-delete flow — step 2: success, show info card with close button. */}
      <ConfirmModal
        visible={deleteStep === 'pending'}
        title="Deletion scheduled"
        message="Your account will be permanently deleted in 30 days. You can keep using the app until then. To undo, tap 'Cancel deletion' on the banner above — your account and data will be fully restored."
        confirmLabel="Got it"
        cancelLabel={false}
        confirmVariant="primary"
        onCancel={null}
        onConfirm={() => setDeleteStep(null)}
      />
    </AppScreen>
  );
}

/* ------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* ------------------------------------------------------------------------- */

// Glossy gradient tile: two-colour fill, a soft light sheen on the top half,
// and a shadow in the tile's own colour.
function IconTile({ icon, gradient, size = ROW_ICON, iconSize = 18, round = false }) {
  const shape = { width: size, height: size, borderRadius: round ? size / 2 : Math.round(size * 0.32) };
  return (
    <View style={[styles.tileShadow, shape, { shadowColor: gradient[1] }]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tile, shape]}
      >
        <View style={[styles.tileSheen, { borderTopLeftRadius: shape.borderRadius, borderTopRightRadius: shape.borderRadius }]} />
        <AppIcon name={icon} size={iconSize} color="#FFFFFF" strokeWidth={2.4} />
      </LinearGradient>
    </View>
  );
}

function MenuRow({ icon, gradient, label, caption, destructive, isLast, onPress }) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <IconTile icon={icon} gradient={gradient} />
      <View style={styles.menuRowContent}>
        <Text style={[styles.menuRowLabel, destructive && { color: colors.error }]} numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text style={styles.menuRowCaption} numberOfLines={1}>{caption}</Text>
        ) : null}
      </View>
      <View style={[styles.menuRowChevron, destructive && styles.menuRowChevronDanger]}>
        <AppIcon name="chevronRight" size={14} color={destructive ? colors.error : colors.textSecondary} strokeWidth={2.6} />
      </View>
      {/* Hairline between rows, starting after the icon */}
      {!isLast && <View style={styles.menuRowDivider} />}
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------------- */
/* Styles                                                                     */
/* ------------------------------------------------------------------------- */

// Light greys that carry the structure on the plain white page (same as the
// My Orders and Notifications pages).
const LINE = '#ECEEF2';
const MUTED_BG = '#F5F6F8';
const SIDE = 8;
const ROW_PAD_H = 14;
const ROW_ICON = 40;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSurface,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  /* ----- Hero ----- */
  hero: {
    marginHorizontal: SIDE,
    marginTop: spacing.md,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  heroGradient: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.md,
    gap: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    width: 72,
    height: 72,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#1A1F2B',
    borderWidth: 2,
    borderColor: '#1A1F2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.textInverse,
    fontWeight: '900',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1A1F2B',
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroName: {
    fontSize: 20,
    lineHeight: 25,
    color: colors.textInverse,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroPhone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  heroChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroChipText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#FBBF24',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroEditBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },

  /* ----- Address card ----- */
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: SIDE,
    marginTop: 12,
    padding: ROW_PAD_H,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LINE,
    ...shadows.xs,
  },
  addressContent: {
    flex: 1,
    minWidth: 0,
  },
  addressLabel: {
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  addressText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 18,
  },
  addressEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  addressEditChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textInverse,
  },

  /* ----- Status banners ----- */
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: SIDE,
    marginTop: 12,
    padding: ROW_PAD_H,
    backgroundColor: colors.errorLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  blockedBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(229,72,77,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedText: {
    ...typography.bodySmall,
    color: colors.error,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  deletionBanner: {
    marginHorizontal: SIDE,
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: ROW_PAD_H,
    gap: 6,
  },
  deletionBannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deletionBannerIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(180,83,9,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletionBannerTitle: {
    ...typography.labelLarge,
    color: '#92400E',
    fontWeight: '800',
    flex: 1,
  },
  deletionBannerBody: {
    ...typography.bodySmall,
    color: '#78350F',
    lineHeight: 18,
  },
  deletionBannerDate: {
    fontWeight: '800',
  },
  cancelDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: '#92400E',
    marginTop: 4,
  },
  cancelDeleteBtnText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  /* ----- Menu sections ----- */
  menuContainer: {
    marginTop: spacing.sm,
  },
  menuSection: {
    marginHorizontal: SIDE,
    marginTop: spacing.md,
  },
  menuSectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  menuCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LINE,
    overflow: 'hidden',
    ...shadows.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ROW_PAD_H,
    paddingVertical: 12,
    gap: 12,
  },
  menuRowDivider: {
    position: 'absolute',
    left: ROW_PAD_H + ROW_ICON + 12,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: LINE,
  },
  tileShadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  menuRowContent: {
    flex: 1,
    minWidth: 0,
  },
  menuRowLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '800',
    lineHeight: 19,
    marginBottom: 1,
  },
  menuRowCaption: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  menuRowChevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: MUTED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowChevronDanger: {
    backgroundColor: colors.errorLight,
  },

  /* ----- Footer ----- */
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: 8,
  },
  footerLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footerHeart: {
    fontSize: 14,
    marginHorizontal: 2,
  },
  footerVersionPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: MUTED_BG,
  },
  footerVersion: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 0.3,
  },
});
