import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { useAuthStore } from '../../stores/authStore';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import { convertReceivedGiftToCredit, reopenReceivedGiftBox } from '../../services/gift/giftFlow';
import { formatDollars } from '../../services/box/buildDefaultBox';
import {
  CURATED_GIFT_BOX_LABEL,
  GIFT_CREDIT_LABEL,
  GIFT_CREDIT_SPEND_HINT,
} from '../../constants/giftCopy';
import { formatThreadListDate } from '../../services/hanukkah/dates';
import type { MainStackParamList } from '../../navigation/types';
import type { ReceivedGift } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { AccountHubHeader } from '../../components/account/AccountHubHeader';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';

type Nav = StackNavigationProp<MainStackParamList>;

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return formatThreadListDate(new Date(ms));
}

function statusLabel(gift: ReceivedGift): string {
  if (gift.status === 'converted_to_credit') return 'Converted to credit';
  if (gift.status === 'accepted') return `${CURATED_GIFT_BOX_LABEL} accepted`;
  if (gift.kind === 'credit') return 'Credit applied';
  if (gift.viewedAt) return 'Viewed · ready to convert';
  return 'Ready to open';
}

function itemPreview(gift: ReceivedGift): string | null {
  const items = gift.lineItems ?? [];
  if (!items.length) return null;
  const labels = items
    .map((li) => li.label?.trim() || li.itemId)
    .filter(Boolean)
    .slice(0, 3);
  if (!labels.length) return null;
  const more = items.length > labels.length ? ` +${items.length - labels.length} more` : '';
  return `${labels.join(' · ')}${more}`;
}

function GiftCard({
  gift,
  styles,
  onView,
  onEdit,
  onConvert,
  onReopen,
  converting,
  reopening,
}: {
  gift: ReceivedGift;
  styles: ReturnType<typeof createStyles>;
  onView: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onReopen: () => void;
  converting: boolean;
  reopening: boolean;
}) {
  const isBox = gift.kind === 'box';
  const available = isBox && gift.status === 'available';
  const accepted = isBox && gift.status === 'accepted';
  const converted = gift.status === 'converted_to_credit';
  const preview = isBox ? itemPreview(gift) : null;
  // Accepted without a fulfilled checkout can be reopened (legacy Review CTA).
  const canReopen = accepted;

  return (
    <View style={styles.card}>
      <Text style={styles.cardKind}>{isBox ? CURATED_GIFT_BOX_LABEL : GIFT_CREDIT_LABEL}</Text>
      <Text style={styles.cardTitle}>From {gift.giverName || 'someone special'}</Text>
      <Text style={styles.cardMeta}>
        Claimed {formatDate(gift.claimedAt)} · {statusLabel(gift)}
      </Text>
      {gift.message ? <Text style={styles.message}>&ldquo;{gift.message}&rdquo;</Text> : null}
      {preview ? <Text style={styles.preview}>{preview}</Text> : null}

      {gift.kind === 'credit' ? (
        <Text style={styles.body}>
          {formatDollars(gift.creditCents)} was added to your {GIFT_CREDIT_LABEL.toLowerCase()} balance. {GIFT_CREDIT_SPEND_HINT}
        </Text>
      ) : available ? (
        <Text style={styles.body}>
          Open this curated gift box to adjust items, add from other gifts, or convert it to gift credit.
        </Text>
      ) : converted ? (
        <Text style={styles.body}>
          Converted to {formatDollars(gift.creditCents)} in gift credit
          {gift.convertedAt ? ` on ${formatDate(gift.convertedAt)}` : ''}.
        </Text>
      ) : accepted ? (
        <Text style={styles.body}>
          This gift was marked accepted. Reopen it to edit, add from other gifts, or convert to
          credit — unless you already finished checkout.
        </Text>
      ) : (
        <Text style={styles.body}>You&apos;re receiving this {CURATED_GIFT_BOX_LABEL.toLowerCase()} as a gift.</Text>
      )}

      {available ? (
        <>
          <TouchableOpacity style={styles.primaryBtn} onPress={onEdit}>
            <Text style={styles.primaryBtnText}>Open gift box</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={onView}>
            <Text style={styles.editBtnText}>View reveal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, converting && styles.secondaryBtnDisabled]}
            disabled={converting}
            onPress={onConvert}
          >
            <Text style={styles.secondaryBtnText}>
              {converting
                ? 'Converting…'
                : `Convert to ${formatDollars(gift.creditCents)} credit`}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}

      {canReopen ? (
        <>
          <TouchableOpacity
            style={[styles.primaryBtn, reopening && styles.secondaryBtnDisabled]}
            disabled={reopening}
            onPress={onReopen}
          >
            <Text style={styles.primaryBtnText}>
              {reopening ? 'Reopening…' : 'Reopen to manage'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={onView}>
            <Text style={styles.editBtnText}>View reveal</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

function MyGiftsBody() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, loading: sessionLoading, refresh: refreshSession } = useSession();
  const { gifts, loading, error, refresh } = useReceivedGifts();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshSession({ silent: true });
    }, [refresh, refreshSession])
  );

  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const availableBoxGifts = useMemo(
    () => gifts.filter((g) => g.kind === 'box' && g.status === 'available'),
    [gifts]
  );
  const multiBoxHint = availableBoxGifts.length >= 2;

  const openGift = useCallback(
    (gift: ReceivedGift) => {
      navigation.navigate('GiftRecipientReveal', {
        giftInviteId: gift.giftInviteId,
        giverName: gift.giverName || 'Someone who loves you',
        message: gift.message,
        giftCreditCents: gift.kind === 'credit' ? gift.creditCents : 0,
        hasGiverDraft: gift.kind === 'box',
      });
    },
    [navigation]
  );

  const openGiftBox = useCallback(
    (gift: ReceivedGift) => {
      navigation.navigate('GiftBox', { giftInviteId: gift.giftInviteId });
    },
    [navigation]
  );

  const performConvert = useCallback(
    async (gift: ReceivedGift) => {
      setConvertingId(gift.giftInviteId);
      try {
        const result = await convertReceivedGiftToCredit(gift.giftInviteId);
        await Promise.all([refresh(), refreshSession({ silent: true })]);
        const msg = `${formatDollars(result.creditCentsAdded)} was added to your gift credit balance.`;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`Converted to credit\n\n${msg}`);
        } else {
          Alert.alert('Converted to credit', msg);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Try again or contact support.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`Could not convert\n\n${msg}`);
        } else {
          Alert.alert('Could not convert', msg);
        }
      } finally {
        setConvertingId(null);
      }
    },
    [refresh, refreshSession]
  );

  const confirmConvert = (gift: ReceivedGift) => {
    const title = 'Convert this gift box to credit?';
    const body = `You'll receive ${formatDollars(gift.creditCents)} in gift credit. ${GIFT_CREDIT_SPEND_HINT} This curated gift box won't ship as picked.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) void performConvert(gift);
      return;
    }
    Alert.alert(title, body, [
      { text: 'Keep gift box', style: 'cancel' },
      { text: 'Convert to credit', onPress: () => void performConvert(gift) },
    ]);
  };

  const performReopen = useCallback(
    async (gift: ReceivedGift) => {
      setReopeningId(gift.giftInviteId);
      try {
        await reopenReceivedGiftBox(gift.giftInviteId);
        await refresh();
        navigation.navigate('GiftBox', { giftInviteId: gift.giftInviteId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Try again or contact support.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`Could not reopen\n\n${msg}`);
        } else {
          Alert.alert('Could not reopen', msg);
        }
      } finally {
        setReopeningId(null);
      }
    },
    [navigation, refresh]
  );

  if (!isAuthenticated) {
    return (
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <GuestAuthPrompt returnTo="MyGifts" />
      </WebContentPanel>
    );
  }

  if (sessionLoading || loading) {
    return (
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
        </View>
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <AccountHubHeader page="gifts" />

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Received gifts</Text>
        {gifts.length === 0 ? (
          <Text style={styles.empty}>
            No gifts yet. When someone sends you a gift, it will appear here after you claim it.
          </Text>
        ) : (
          gifts.map((gift) => (
            <GiftCard
              key={gift.id}
              gift={gift}
              styles={styles}
              onView={() => openGift(gift)}
              onEdit={() => openGiftBox(gift)}
              onConvert={() => confirmConvert(gift)}
              onReopen={() => void performReopen(gift)}
              converting={convertingId === gift.giftInviteId}
              reopening={reopeningId === gift.giftInviteId}
            />
          ))
        )}

        <View style={styles.creditBanner}>
          <Text style={styles.creditLabel}>Gift credit on hand</Text>
          <Text style={styles.creditValue}>{formatDollars(giftCreditCents)}</Text>
          {platformCreditCents > 0 ? (
            <Text style={styles.creditSub}>
              + {formatDollars(platformCreditCents)} platform credit
            </Text>
          ) : null}
          <Text style={styles.creditBody}>
            Gifts you&apos;ve received stay separate from your family&apos;s own box.{' '}
            {GIFT_CREDIT_SPEND_HINT} Curated gift boxes are managed here.
          </Text>
        </View>

        {multiBoxHint ? (
          <Text style={styles.multiHint}>
            You have {availableBoxGifts.length} curated gift boxes. Keep the one you want; convert
            extras to gift credit to spend in the store or on a Hanukkah box.
          </Text>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void refresh()}>
              <Text style={styles.errorRetry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.sectionDividerGive} />
        <Text style={styles.section}>Give a gift</Text>
        <Text style={styles.sectionHint}>
          Send gift credit they can spend, or pick items for a curated gift box.
        </Text>
        <GrapejuiceButton
          label="Send gift credit"
          variant="filled"
          onPress={() => navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' })}
          style={styles.giveBtn}
          textStyle={styles.giveBtnText}
        />
        <GrapejuiceButton
          label="Pick items for them"
          variant="pillOutline"
          onPress={() => navigation.navigate('GiftGive', { initialGiftPath: 'customize' })}
          style={styles.giveBtnSecondary}
          textStyle={styles.giveBtnSecondaryText}
        />
      </ScrollView>
    </WebContentPanel>
  );
}

export function MyGiftsScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <MyGiftsBody />
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xxl + spacing.md,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
    sectionDivider: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    sectionDividerGive: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    section: {
      ...typeface('medium'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.logoDark,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    sectionHint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      textAlign: 'center',
      letterSpacing: -0.22,
      lineHeight: 18,
      marginBottom: spacing.md,
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    giveBtn: {
      marginTop: spacing.sm,
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: borderRadius.xl,
    },
    giveBtnText: {
      ...typeface('regular'),
      color: colors.logoDark,
    },
    giveBtnSecondary: {
      marginTop: spacing.sm,
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: borderRadius.xl,
    },
    giveBtnSecondaryText: {
      ...typeface('regular'),
      color: colors.logoDark,
    },
    creditBanner: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accentCream,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
    },
    creditLabel: {
      ...typeface('medium'),
      fontSize: typography.sm,
      letterSpacing: -0.22,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    creditValue: {
      ...typeface('medium'),
      marginTop: 4,
      fontSize: 28,
      color: colors.textPrimary,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    creditSub: {
      ...typeface('regular'),
      marginTop: 4,
      fontSize: typography.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    creditBody: {
      ...typeface('regular'),
      marginTop: spacing.md,
      fontSize: typography.md,
      color: colors.textSecondary,
      textAlign: 'center',
      letterSpacing: -0.22,
      lineHeight: 18,
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    multiHint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    empty: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      textAlign: 'center',
      lineHeight: 20,
      letterSpacing: -0.22,
    },
    errorBanner: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.accentCream,
    },
    errorText: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    errorRetry: {
      ...typeface('medium'),
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: colors.brand,
    },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.bgPrimary,
    },
    cardKind: {
      ...typeface('medium'),
      fontSize: typography.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textTertiary,
    },
    cardTitle: {
      ...typeface('medium'),
      fontSize: typography.lg,
      color: colors.textPrimary,
      marginTop: 2,
      letterSpacing: -0.22,
    },
    cardMeta: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textTertiary,
      marginTop: spacing.xs,
    },
    message: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: spacing.sm,
    },
    preview: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 18,
    },
    body: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    primaryBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      backgroundColor: colors.brand,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.pill,
    },
    primaryBtnText: {
      ...typeface('medium'),
      color: colors.textInverse,
      fontSize: typography.md,
    },
    editBtn: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    editBtnText: {
      ...typeface('medium'),
      color: colors.brand,
      fontSize: typography.md,
    },
    secondaryBtn: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    secondaryBtnDisabled: { opacity: 0.55 },
    secondaryBtnText: {
      ...typeface('medium'),
      color: colors.brand,
      fontSize: typography.sm,
    },
  });
}
