/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore, useSettingsStore } from '../../../stores';
import { authApi } from '../../../api';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const user = useAuthStore(state => state.user);
  const profile = useAuthStore(state => state.profile);
  const setProfile = useAuthStore(state => state.setProfile);
  const supportPhone = useSettingsStore(state => state.supportPhone);

  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(10)).current;
  const listAnim1 = useRef(new Animated.Value(0)).current;
  const listAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, [setProfile]);

  const handleHelpSupport = () => {
    if (supportPhone) {
      Linking.openURL(`tel:${supportPhone}`);
    }
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="Profile" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

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
                <Text style={styles.memberChipText}>ServeLoco Member</Text>
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
                <AppIcon name={profile?.whatsapp ? 'whatsapp' : 'location'} size={16} color={colors.success} />
              </View>
              <Text style={styles.infoTileLabel}>{profile?.whatsapp ? 'WhatsApp' : 'Address'}</Text>
              <Text style={styles.infoTileValue} numberOfLines={1}>
                {profile?.whatsapp || profile?.address || 'Not added'}
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
              onPress={() => navigation.navigate('Orders')}
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
          <Text style={styles.menuGroupTitle}>More</Text>
          <View style={styles.menuCard}>
            <MenuOption
              icon="Help"
              label="Help and Support"
              caption={supportPhone ? `Call ${supportPhone}` : 'Contact shop support'}
              onPress={handleHelpSupport}
              isLast
            />
          </View>
        </Animated.View>

      </ScrollView>

    </AppScreen>
  );
}

function MenuOption({ icon, label, caption, onPress, isDestructive, isLast }) {
  const iconNameByLabel = {
    Edit: 'edit',
    Box: 'orders',
    Pin: 'location',
    Help: 'phone',
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
    paddingBottom: spacing.xxxl * 2,
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
