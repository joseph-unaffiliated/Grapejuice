import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { ordersService } from '../../services/firestore/orders';
import { usersService } from '../../services/firestore/users';
import {
  createPartnerInvite,
  listPartnerInvites,
  acceptPartnerInvite,
} from '../../services/householdInvites';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { PilotOrder, PartnerInvite } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { useActiveProfile, profileDisplayName } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';

type Nav = StackNavigationProp<MainStackParamList>;

function statusLabel(status: PilotOrder['status']): string {
  switch (status) {
    case 'pending':
      return 'Processing payment';
    case 'committed':
      return 'Committed — charged at ship';
    case 'confirmed':
      return 'Confirmed';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    default:
      return status;
  }
}

export function AccountScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createAccountStyles(colors), [colors]);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { household, profile, loading: sessionLoading } = useSession();
  const { activeProfile, activeChild } = useActiveProfile();
  const guestHidden = useGuestSessionStore((s) => s.hiddenHolidays);
  const toggleGuestHidden = useGuestSessionStore((s) => s.toggleHiddenHoliday);

  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const hiddenHolidays = profile?.hiddenHolidays ?? guestHidden;

  const load = useCallback(async () => {
    if (!household?.id) {
      setOrders([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [list, partnerInvites] = await Promise.all([
      ordersService.listForHousehold(household.id),
      listPartnerInvites({ householdId: household.id }),
    ]);
    setOrders(list);
    setInvites(partnerInvites);
    setLoading(false);
  }, [household?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const sendInvite = async () => {
    if (!household?.id || !inviteEmail.trim()) return;
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
    if (!inviteCode.trim()) return;
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
    if (user?.uid) {
      const next = hiddenHolidays.filter((id) => id !== holidayId);
      await usersService.upsert(user.uid, { hiddenHolidays: next });
    }
  };

  const openTracking = (order: PilotOrder) => {
    if (!order.trackingNumber) return;
    const carrier = (order.carrier ?? '').toLowerCase();
    let url = `https://www.google.com/search?q=${encodeURIComponent(order.trackingNumber + ' tracking')}`;
    if (carrier.includes('ups')) {
      url = `https://www.ups.com/track?tracknum=${order.trackingNumber}`;
    } else if (carrier.includes('usps')) {
      url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.trackingNumber}`;
    } else if (carrier.includes('fedex')) {
      url = `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber}`;
    }
    Linking.openURL(url);
  };

  if (sessionLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!user) {
    return (
      <WebContentPanel>
        <GuestAuthPrompt returnTo="Account" />
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
              fontSize={16}
            />
            <TouchableOpacity style={styles.inviteBtn} onPress={() => void sendInvite()} disabled={inviteSending}>
              <Text style={styles.inviteBtnText}>{inviteSending ? 'Sending…' : 'Send invite'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Paste invite code to join"
              autoCapitalize="none"
              fontSize={16}
            />
            <TouchableOpacity style={styles.inviteBtn} onPress={() => void acceptInvite()} disabled={inviteSending}>
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
        <Text style={styles.hint}>Send a $50 Hanukkah box credit to another family (grandparent flow).</Text>
        <TouchableOpacity style={styles.profilesBtn} onPress={() => navigation.navigate('GiftGive')}>
          <Text style={styles.profilesBtnText}>Send a gift</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Orders</Text>
        {orders.length === 0 ? (
          <Text style={styles.hint}>No orders yet. Configure your box and check out from My Box.</Text>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
                <Text style={styles.orderStatus}>{statusLabel(order.status)}</Text>
              </View>
              <Text style={styles.orderTotal}>{formatDollars(order.totalCents)}</Text>
              {order.trackingNumber ? (
                <TouchableOpacity onPress={() => openTracking(order)}>
                  <Text style={styles.trackLink}>
                    Track package — {order.carrier ?? 'carrier'} {order.trackingNumber}
                  </Text>
                </TouchableOpacity>
              ) : order.status === 'confirmed' ? (
                <Text style={styles.hint}>Tracking will appear when your box ships.</Text>
              ) : null}
            </View>
          ))
        )}

        {user ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </WebContentPanel>
  );
}

function createAccountStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: spacing.lg, paddingBottom: 120 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
