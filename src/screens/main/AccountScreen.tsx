import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useDevPreviewStore } from '../../stores/devPreviewStore';
import { clearDevPreview } from '../../navigation/devPreview';
import { usersService } from '../../services/firestore/users';
import {
  createPartnerInvite,
  listPartnerInvites,
  acceptPartnerInvite,
} from '../../services/householdInvites';
import { useUnifiedOrders } from '../../hooks/useUnifiedOrders';
import type { PartnerInvite, Household, UserProfile } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { useActiveProfile, profileDisplayName } from '../../context/ActiveProfileContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { isOpsAdmin } from '../../constants/admin';

type Nav = StackNavigationProp<MainStackParamList>;

const PREVIEW_SIGNED_IN_USER = {
  uid: 'preview-user',
  email: 'alex@example.com',
  emails: ['alex@example.com'],
  displayName: 'Alex',
};

const PREVIEW_HOUSEHOLD: Household = {
  id: 'preview-household',
  name: 'Fox family',
  ownerId: 'preview-user',
  memberIds: ['preview-user'],
  childUserIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PREVIEW_PROFILE: UserProfile = {
  uid: 'preview-user',
  email: 'alex@example.com',
  displayName: 'Alex',
  role: 'parent',
  householdId: 'preview-household',
  onboardingComplete: true,
  boxRevealComplete: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PREVIEW_ORDER_COUNT = 1;

export function AccountScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <AccountScreenBody />
    </StorefrontChrome>
  );
}

function AccountScreenBody() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createAccountStyles(colors, isDesktop), [colors, isDesktop]);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { household: sessionHousehold, profile: sessionProfile, loading: sessionLoading } = useSession();
  const { activeProfile, activeChild } = useActiveProfile();
  const guestHidden = useGuestSessionStore((s) => s.hiddenHolidays);
  const toggleGuestHidden = useGuestSessionStore((s) => s.toggleHiddenHoliday);
  const previewKey = useDevPreviewStore((s) => s.previewKey);
  const fakeSignedIn = previewKey === 'account-signed-in';

  const user = fakeSignedIn ? PREVIEW_SIGNED_IN_USER : authUser;
  const household = fakeSignedIn ? PREVIEW_HOUSEHOLD : sessionHousehold;
  const profile = fakeSignedIn ? PREVIEW_PROFILE : sessionProfile;

  const { orders: unifiedOrders } = useUnifiedOrders();
  const orderCount = fakeSignedIn ? PREVIEW_ORDER_COUNT : unifiedOrders.length;
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const hiddenHolidays = profile?.hiddenHolidays ?? guestHidden;

  const load = useCallback(async () => {
    if (fakeSignedIn) {
      setInvites([]);
      setLoading(false);
      return;
    }
    if (!household?.id) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setInvites(await listPartnerInvites({ householdId: household.id }));
    } finally {
      setLoading(false);
    }
  }, [household?.id, fakeSignedIn]);

  useEffect(() => {
    load();
  }, [load]);

  const sendInvite = async () => {
    if (fakeSignedIn || !household?.id || !inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      await createPartnerInvite({
        householdId: household.id,
        email: inviteEmail.trim(),
        invitedByName: profile?.displayName ?? user?.displayName ?? 'Partner',
      });
      setInviteEmail('');
      await load();
    } finally {
      setInviteSending(false);
    }
  };

  const acceptInvite = async () => {
    if (fakeSignedIn || !inviteCode.trim()) return;
    setInviteSending(true);
    try {
      await acceptPartnerInvite({ inviteId: inviteCode.trim() });
      setInviteCode('');
      await load();
    } finally {
      setInviteSending(false);
    }
  };

  const restoreHidden = async (holidayId: string) => {
    toggleGuestHidden(holidayId);
    if (authUser?.uid) {
      const next = hiddenHolidays.filter((id) => id !== holidayId);
      await usersService.upsert(authUser.uid, { hiddenHolidays: next });
    }
  };

  const onSignOut = () => {
    if (fakeSignedIn) {
      clearDevPreview();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/store?preview=account';
      }
      return;
    }
    void logout();
  };

  const goOrders = () => navigation.navigate('Orders');

  if (!fakeSignedIn && (sessionLoading || loading)) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!user) {
    return (
      <WebContentPanel {...panelProps}>
        <GuestAuthPrompt returnTo="Account" />
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel {...panelProps}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {fakeSignedIn ? (
          <Text style={styles.previewBanner}>Preview — signed-in account (mock data)</Text>
        ) : null}
        <Text style={styles.title}>Account</Text>
        <Text style={styles.email}>{user?.email ?? 'Exploring as guest'}</Text>
        {profile?.displayName ? <Text style={styles.meta}>{profile.displayName}</Text> : null}

        <Text style={styles.section}>Household</Text>
        <Text style={styles.meta}>{household?.name ?? 'Your household'}</Text>
        {household?.id ? (
          <>
            <Text style={styles.hint}>Invite a partner to edit the same box.</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="partner@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!fakeSignedIn}
              fontSize={16}
            />
            <TouchableOpacity
              style={[styles.inviteBtn, fakeSignedIn && styles.inviteBtnDisabled]}
              onPress={() => void sendInvite()}
              disabled={inviteSending || fakeSignedIn}
            >
              <Text style={styles.inviteBtnText}>{inviteSending ? 'Sending…' : 'Send invite'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Paste invite code to join"
              autoCapitalize="none"
              editable={!fakeSignedIn}
              fontSize={16}
            />
            <TouchableOpacity
              style={[styles.inviteBtn, fakeSignedIn && styles.inviteBtnDisabled]}
              onPress={() => void acceptInvite()}
              disabled={inviteSending || fakeSignedIn}
            >
              <Text style={styles.inviteBtnText}>{inviteSending ? 'Joining…' : 'Accept invite'}</Text>
            </TouchableOpacity>
            {invites.map((inv) => (
              <Text key={inv.id} style={styles.inviteRow}>
                {inv.invitedEmail} — {inv.status}
              </Text>
            ))}
          </>
        ) : (
          <Text style={styles.hint}>Sign in to invite a partner and share your box.</Text>
        )}

        {!PILOT_PARENT_ONLY ? (
          <>
            <Text style={styles.section}>Profiles</Text>
            <Text style={styles.hint}>
              Active: {profileDisplayName(activeProfile, profile?.displayName, activeChild)}
            </Text>
            <TouchableOpacity style={styles.profilesBtn} onPress={() => navigation.navigate('Profiles')}>
              <Text style={styles.profilesBtnText}>Who&apos;s using Grapejuice?</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {hiddenHolidays.length ? (
          <>
            <Text style={styles.section}>Hidden holidays</Text>
            {hiddenHolidays.map((id) => (
              <TouchableOpacity key={id} onPress={() => void restoreHidden(id)}>
                <Text style={styles.restoreLink}>Show {id} again</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>Gift a box</Text>
        <Text style={styles.hint}>Send gift credit or a curated gift box to another family (grandparent flow).</Text>
        <TouchableOpacity style={styles.profilesBtn} onPress={() => navigation.navigate('GiftGive')}>
          <Text style={styles.profilesBtnText}>Send a gift</Text>
        </TouchableOpacity>

        {isOpsAdmin(user) ? (
          <>
            <Text style={styles.section}>Ops</Text>
            <Text style={styles.hint}>Add or edit Hanukkah catalog SKUs (books, menorahs, etc.).</Text>
            <TouchableOpacity
              style={styles.profilesBtn}
              onPress={() => navigation.navigate('AdminCatalog')}
            >
              <Text style={styles.profilesBtnText}>Catalog admin</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <Text style={styles.section}>Orders</Text>
        <Text style={styles.hint}>
          {orderCount === 0
            ? 'Gift boxes you send and your household Hanukkah box appear here.'
            : `${orderCount} order${orderCount === 1 ? '' : 's'} — gifts, your box, and add-ons.`}
        </Text>
        <TouchableOpacity style={styles.profilesBtn} onPress={goOrders}>
          <Text style={styles.profilesBtnText}>
            {orderCount === 0 ? 'View orders' : 'View all orders'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={onSignOut}>
          <Text style={styles.logoutText}>{fakeSignedIn ? 'Exit preview' : 'Sign out'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebContentPanel>
  );
}

function createAccountStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewBanner: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginBottom: spacing.md,
      letterSpacing: -0.22,
    },
    title: { fontSize: 24, fontWeight: '700' },
    email: { fontSize: typography.lg, marginTop: spacing.xs },
    meta: { fontSize: typography.md, color: colors.textSecondary, marginTop: 4 },
    section: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
    hint: { fontSize: typography.md, color: colors.textTertiary },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      marginTop: spacing.sm,
      fontSize: 16,
    },
    inviteBtn: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: colors.brand,
    },
    inviteBtnDisabled: { opacity: 0.45 },
    inviteBtnText: { color: colors.brand, fontWeight: '600' },
    inviteRow: { fontSize: typography.sm, color: colors.textSecondary, marginTop: spacing.xs },
    profilesBtn: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      backgroundColor: colors.accentCream,
    },
    profilesBtnText: { fontWeight: '600', color: colors.textPrimary },
    restoreLink: { color: colors.brand, fontWeight: '600', marginBottom: spacing.xs },
    orderCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    orderId: { fontWeight: '600' },
    orderStatus: { color: colors.brand, fontWeight: '600' },
    orderTotal: { marginTop: spacing.xs, fontSize: typography.lg },
    trackLink: { marginTop: spacing.sm, color: colors.brand, fontWeight: '600' },
    cancelOrderBtn: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelOrderBtnDisabled: { opacity: 0.45 },
    cancelOrderBtnText: { color: colors.textSecondary, fontWeight: '600' },
    logoutBtn: {
      marginTop: spacing.xxl,
      padding: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.pill,
    },
    logoutText: { fontWeight: '600', color: colors.textSecondary },
  });
}
