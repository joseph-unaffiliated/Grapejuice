import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Alert,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import {
  SystemChip,
  SystemPage,
  SystemTextAction,
  systemPageStyles as page,
} from '../../components/layout/SystemPage';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { useAuthStore } from '../../stores/authStore';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { convertReceivedGiftToCredit, reopenReceivedGiftBox } from '../../services/gift/giftFlow';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { useCatalog } from '../../hooks/useCatalog';
import { OrderBoxCollage, OrderItemNameGrid } from '../../components/orders/OrderPurchaseMedia';
import {
  CURATED_GIFT_BOX_LABEL,
  GIFT_CREDIT_LABEL,
  GIFT_CREDIT_SPEND_HINT,
} from '../../constants/giftCopy';
import type { MainStackParamList } from '../../navigation/types';
import type { CatalogItem, ReceivedGift } from '../../types/pilot';
import { usePreviewedHasStartedBox } from '../../hooks/useUserStatePreview';
import { semanticColors, spacing, borderRadius, typeface, typography } from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

const guestPanel = { flex: 1, width: '100%' as const };

function formatGiftDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusLabel(gift: ReceivedGift): string {
  if (gift.status === 'converted_to_credit') return 'Converted to credit';
  if (gift.status === 'accepted') return `${CURATED_GIFT_BOX_LABEL} accepted`;
  if (gift.kind === 'credit') return 'Credit applied';
  if (gift.viewedAt) return 'Viewed · ready to convert';
  return 'Ready to open';
}

function GiftCard({
  gift,
  catalog,
  styles,
  onView,
  onEdit,
  onConvert,
  onReopen,
  converting,
  reopening,
}: {
  gift: ReceivedGift;
  catalog: CatalogItem[];
  styles: ReturnType<typeof createGiftStyles>;
  onView: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onReopen: () => void;
  converting: boolean;
  reopening: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isBox = gift.kind === 'box';
  const items = isBox ? (gift.lineItems ?? []) : [];
  const available = isBox && gift.status === 'available';
  const accepted = isBox && gift.status === 'accepted';
  const converted = gift.status === 'converted_to_credit';
  const claimed = formatGiftDate(gift.claimedAt);
  const convertedOn = formatGiftDate(gift.convertedAt);
  const facts = [
    claimed ? { label: 'Claimed', value: claimed } : null,
    { label: 'From', value: gift.giverName?.trim() || 'someone special' },
  ].filter((fact): fact is { label: string; value: string } => fact != null);

  const note = gift.kind === 'credit'
    ? `${formatDollars(gift.creditCents)} was added to your gift credit balance. ${GIFT_CREDIT_SPEND_HINT}`
    : available
      ? 'Open this box to adjust items, or convert it to gift credit.'
      : converted
        ? `Converted to ${formatDollars(gift.creditCents)} in gift credit${convertedOn ? ` on ${convertedOn}` : ''}.`
        : accepted
          ? 'Reopen it to edit or convert to credit, unless you already finished checkout.'
          : null;

  return (
    <View style={styles.card}>
      <View style={styles.bar}>
        {facts.map((fact, index) => (
          <View key={fact.label} style={styles.barFact}>
            {index > 0 ? <View style={styles.barRule} /> : null}
            <Text style={styles.barLabel}>{fact.label}</Text>
            <Text style={styles.barValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.body}>
        <View style={styles.main}>
          <View style={styles.row}>
            {items.length > 0 ? <OrderBoxCollage items={items} catalog={catalog} /> : null}
            <View style={styles.titleBlock}>
              <Text style={styles.productName}>
                {isBox ? CURATED_GIFT_BOX_LABEL : GIFT_CREDIT_LABEL}
              </Text>
              <Text style={styles.productPrice}>{formatDollars(gift.creditCents)}</Text>
              {gift.message ? (
                <Text style={styles.message}>&ldquo;{gift.message}&rdquo;</Text>
              ) : null}
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {items.length > 0 ? (
                <TouchableOpacity
                  style={styles.itemsToggle}
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <Text style={page.link}>{expanded ? 'Hide items' : 'Show all items'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Text style={styles.status}>{statusLabel(gift)}</Text>
          {available ? (
            <>
              <SystemChip label="Open gift box" onPress={onEdit} style={styles.actionControl} />
              <SystemTextAction
                label="View reveal"
                tone="brand"
                onPress={onView}
                style={styles.actionControl}
              />
              <SystemTextAction
                label={
                  converting
                    ? 'Converting…'
                    : `Convert to ${formatDollars(gift.creditCents)} credit`
                }
                onPress={onConvert}
                disabled={converting}
                style={styles.actionControl}
              />
            </>
          ) : null}
          {accepted ? (
            <>
              <SystemChip
                label={reopening ? 'Reopening…' : 'Reopen to manage'}
                onPress={onReopen}
                disabled={reopening}
                style={styles.actionControl}
              />
              <SystemTextAction
                label="View reveal"
                tone="brand"
                onPress={onView}
                style={styles.actionControl}
              />
            </>
          ) : null}
        </View>
      </View>

      {expanded && items.length > 0 ? (
        <OrderItemNameGrid items={items} catalog={catalog} />
      ) : null}
    </View>
  );
}

function MyGiftsBody() {
  const navigation = useNavigation<Nav>();
  const styles = useMemo(() => createGiftStyles(), []);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, loading: sessionLoading, refresh: refreshSession } = useSession();
  const { gifts, loading, error, refresh } = useReceivedGifts();
  const { items: catalog } = useCatalog();
  const hasStartedBox = usePreviewedHasStartedBox();
  const { goCategory, startBox } = useStorefrontActions();
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
      <WebContentPanel flush centerDesktop omitDesktopTopPadding style={guestPanel}>
        <GuestAuthPrompt returnTo="MyGifts" />
      </WebContentPanel>
    );
  }

  if (sessionLoading || loading) {
    return (
      <SystemPage hub="gifts" loading />
    );
  }

  return (
    <SystemPage hub="gifts">
        {error ? (
          <View style={page.section}>
            <Text style={page.emptyText}>{error}</Text>
            <SystemChip label="Try again" onPress={() => void refresh()} />
          </View>
        ) : null}

        <View style={page.section}>
          <Text style={page.sectionHeading}>Give a gift</Text>
          <Text style={page.sectionLead}>
            Send gift credit they can spend, or pick items for a curated gift box.
          </Text>
          <SystemChip
            label="Send gift credit"
            onPress={() => navigation.navigate('GiftGive', { initialGiftPath: 'credit_only' })}
          />
          <SystemChip
            label="Pick items for them"
            onPress={() => navigation.navigate('GiftGive', { initialGiftPath: 'customize' })}
          />
        </View>

        {gifts.length === 0 ? (
          <Text style={page.emptyText}>
            No gifts yet. When someone sends you a gift, it will appear here after you claim it.
          </Text>
        ) : (
          gifts.map((gift) => (
            <GiftCard
              key={gift.id}
              gift={gift}
              catalog={catalog}
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
          <View style={styles.creditActions}>
            <TouchableOpacity
              style={[styles.creditCta, styles.creditCtaPrimary]}
              onPress={() => goCategory('collection')}
              accessibilityRole="button"
              accessibilityLabel={hasStartedBox ? 'Add to your box' : 'Shop the collection'}
            >
              <Text style={styles.creditCtaPrimaryText}>
                {hasStartedBox ? 'Add to your box' : 'Shop the collection'}
              </Text>
            </TouchableOpacity>
            {hasStartedBox ? null : (
              <TouchableOpacity
                style={[styles.creditCta, styles.creditCtaSecondary]}
                onPress={() => startBox()}
                accessibilityRole="button"
                accessibilityLabel="Build your box"
              >
                <Text style={styles.creditCtaSecondaryText}>Build your box</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {multiBoxHint ? (
          <Text style={styles.multiHint}>
            You have {availableBoxGifts.length} curated gift boxes. Keep the one you want; convert
            extras to gift credit to spend in the store or on a Hanukkah box.
          </Text>
        ) : null}
    </SystemPage>
  );
}

export function MyGiftsScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <MyGiftsBody />
    </StorefrontChrome>
  );
}

function createGiftStyles() {
  return StyleSheet.create({
    creditBanner: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: semanticColors.accentCream,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.border,
      alignItems: 'center',
    },
    creditLabel: {
      ...typeface('medium'),
      fontSize: typography.sm,
      letterSpacing: -0.22,
      color: semanticColors.textTertiary,
      textAlign: 'center',
    },
    creditValue: {
      ...typeface('medium'),
      marginTop: 4,
      fontSize: 28,
      color: semanticColors.textPrimary,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    creditSub: {
      ...typeface('regular'),
      marginTop: 4,
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      textAlign: 'center',
    },
    creditBody: {
      ...typeface('regular'),
      marginTop: spacing.md,
      fontSize: typography.md,
      color: semanticColors.textSecondary,
      textAlign: 'center',
      letterSpacing: -0.22,
      lineHeight: 18,
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    creditActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    creditCta: {
      minHeight: 40,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
    },
    creditCtaPrimary: {
      backgroundColor: semanticColors.brand,
    },
    creditCtaPrimaryText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.logoDark,
      letterSpacing: -0.2,
      textAlign: 'center',
    },
    creditCtaSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: semanticColors.logoDark,
    },
    creditCtaSecondaryText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.logoDark,
      textAlign: 'center',
    },
    multiHint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    card: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semanticColors.border,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    bar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: semanticColors.logoDark,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    barFact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    barRule: {
      width: StyleSheet.hairlineWidth,
      height: 14,
      backgroundColor: 'rgba(255,255,255,0.45)',
      marginRight: spacing.xs,
    },
    barLabel: {
      ...typeface('medium'),
      fontSize: typography.lg,
      color: semanticColors.textInverse,
    },
    barValue: {
      ...typeface('regular'),
      fontSize: typography.lg,
      color: semanticColors.textInverse,
    },
    body: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: spacing.lg,
    },
    main: { flex: 1, minWidth: 180, gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    titleBlock: { flex: 1, gap: spacing.xs },
    actions: {
      marginLeft: 'auto',
      alignItems: 'flex-end',
      gap: spacing.xs,
      maxWidth: 220,
      flexShrink: 0,
    },
    actionControl: {
      marginTop: 0,
      alignSelf: 'flex-end',
      paddingHorizontal: spacing.sm,
    },
    productName: {
      ...typeface('medium'),
      fontSize: 18,
      lineHeight: 24,
      color: semanticColors.textPrimary,
    },
    productPrice: {
      ...typeface('medium'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
    },
    message: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      fontStyle: 'italic',
      lineHeight: 18,
    },
    note: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: semanticColors.textSecondary,
      lineHeight: 18,
    },
    itemsToggle: { alignSelf: 'flex-start' },
    status: {
      ...typeface('medium'),
      fontSize: typography.lg,
      color: semanticColors.textPrimary,
      textAlign: 'right',
    },
  });
}

