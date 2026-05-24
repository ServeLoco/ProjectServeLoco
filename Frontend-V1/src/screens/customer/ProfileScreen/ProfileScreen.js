/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Animated,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  Button,
  AppIcon,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore, useSettingsStore } from '../../../stores';
import { authApi } from '../../../api';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const profile = useAuthStore(state => state.profile);
  const logout = useAuthStore(state => state.logout);
  const setProfile = useAuthStore(state => state.setProfile);
  const supportPhone = useSettingsStore(state => state.supportPhone);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;

  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(10)).current;
  const listAnim1 = useRef(new Animated.Value(0)).current;
  const listAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAuthenticated) {
      authApi.getMe()
        .then(response => {
          const nextProfile = response?.user || response?.profile || response?.data || response;
          setProfile(nextProfile);
        })
        .catch(() => {});

      Animated.stagger(100, [
        Animated.parallel([
          Animated.timing(cardFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(cardSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(listAnim1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(listAnim2, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isAuthenticated, setProfile]);

  const openLogoutModal = () => {
    setShowLogoutModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 1, friction: 6, useNativeDriver: true })
    ]).start();
  };

  const closeLogoutModal = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.8, duration: 200, useNativeDriver: true })
    ]).start(() => {
      setShowLogoutModal(false);
    });
  };

  const handleLogout = () => {
    closeLogoutModal();
    logout();
  };

  const handleHelpSupport = () => {
    if (supportPhone) {
      Linking.openURL(`tel:${supportPhone}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="My Profile" />
        <View style={styles.emptyState}>
          <AppIcon name="profile" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
          <Text style={styles.emptyTitle}>Welcome to ServeLoco</Text>
          <Text style={styles.emptyDesc}>Login to view your profile, manage addresses, and track your orders.</Text>
          <Button label="Login / Signup" onPress={() => navigation.navigate('Auth')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="My Profile" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Profile Card */}
        <Animated.View style={[styles.profileCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
              <TouchableOpacity
                style={styles.editIconBtn}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <AppIcon name="edit" size={18} color={colors.primary} />
              </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>{profile?.name || 'User'}</Text>

          <View style={styles.infoRow}>
            <AppIcon name="phone" size={18} color={colors.textSecondary} style={styles.infoIcon} />
            <Text style={styles.infoText}>{user?.phone || 'No phone added'}</Text>
          </View>

          {profile?.whatsapp && (
            <View style={styles.infoRow}>
              <AppIcon name="whatsapp" size={18} color={colors.textSecondary} style={styles.infoIcon} />
              <Text style={styles.infoText}>{profile.whatsapp} (WhatsApp)</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <AppIcon name="location" size={18} color={colors.textSecondary} style={styles.infoIcon} />
            <Text style={styles.infoText} numberOfLines={2}>
              {profile?.address || 'No address added yet.'}
            </Text>
          </View>

          {profile?.status === 'Blocked' && (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>Your account is currently restricted. Contact support.</Text>
            </View>
          )}
        </Animated.View>

        {/* Menu Options */}
        <Animated.View style={[styles.menuGroup, { opacity: listAnim1, transform: [{ translateY: listAnim1.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>Account</Text>

          <MenuOption
            icon="Edit"
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuOption
            icon="Box"
            label="My Orders"
            onPress={() => navigation.navigate('Orders')}
          />
          <MenuOption
            icon="Pin"
            label="Saved Address"
            onPress={() => navigation.navigate('EditProfile')} // Route to EditProfile for now
          />
        </Animated.View>

        <Animated.View style={[styles.menuGroup, { opacity: listAnim2, transform: [{ translateY: listAnim2.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>More</Text>

          <MenuOption
            icon="Help"
            label="Help and Support"
            onPress={handleHelpSupport}
          />
          <MenuOption
            icon="Out"
            label="Logout"
            onPress={openLogoutModal}
            isDestructive
          />
        </Animated.View>

      </ScrollView>

      {/* Logout Modal */}
      <Modal visible={showLogoutModal} transparent animationType="none" onRequestClose={closeLogoutModal}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]} />
          <Animated.View style={[styles.modalContent, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
            <AppIcon name="logout" size={44} color={colors.primary} style={styles.modalEmoji} />
            <Text style={styles.modalTitle}>Leaving so soon?</Text>
            <Text style={styles.modalDesc}>Are you sure you want to logout from your account?</Text>

            <View style={styles.modalActions}>
              <Button
                label="Stay Logged In"
                onPress={closeLogoutModal}
                style={styles.modalBtn}
              />
              <Button
                label="Logout"
                variant="outline"
                onPress={handleLogout}
                style={[styles.modalBtn, { borderColor: colors.error }]}
                textStyle={{ color: colors.error }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>

    </AppScreen>
  );
}

function MenuOption({ icon, label, onPress, isDestructive }) {
  const iconNameByLabel = {
    Edit: 'edit',
    Box: 'orders',
    Pin: 'location',
    Help: 'phone',
    Out: 'logout',
  };
  const iconColor = isDestructive ? colors.error : colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.menuOption}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <AppIcon name={iconNameByLabel[icon] || 'box'} size={20} color={iconColor} style={styles.menuIcon} />
      <Text style={[styles.menuLabel, isDestructive && { color: colors.error }]}>
        {label}
      </Text>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '40',
  },
  avatarText: {
    ...typography.h2,
    color: colors.primary,
  },
  editIconBtn: {
    padding: spacing.xs,
    backgroundColor: colors.bgApp,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    paddingRight: spacing.lg,
  },
  infoIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  infoText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
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
  menuGroup: {
    marginBottom: spacing.xl,
  },
  menuGroupTitle: {
    ...typography.labelLarge,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    marginRight: spacing.md,
    width: 28,
  },
  menuLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '500',
  },
  menuChevron: {
    transform: [{ rotate: '-90deg' }],
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
