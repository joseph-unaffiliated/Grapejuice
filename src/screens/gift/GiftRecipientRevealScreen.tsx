/** Figma rGzXYb1rNVxqGHz81835Jn — frame 17: recipient reveal after claim. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { BoxRevealScreen } from '../onboarding/BoxRevealScreen';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { OnboardingUnderStorefrontChromeContext } from '../../components/onboarding/onboardingChromeContext';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';
import type { BoxLineItem } from '../../types/pilot';
import { acceptReceivedGiftBox, listMyReceivedGifts, markReceivedGiftViewed } from '../../services/gift/giftFlow';
import { noteReceivedGiftViewedThisSession } from './receivedGiftViewedSession';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { CURATED_GIFT_BOX_LABEL, GIFT_CREDIT_SPEND_HINT } from '../../constants/giftCopy';

type Route = RouteProp<MainStackParamList, 'GiftRecipientReveal'>;

type Phase = 'loading' | 'fork' | 'reveal' | 'credit';

function GiftRecipientChrome({ children }: { children: React.ReactNode }) {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      {children}
    </StorefrontChrome>
  );
}

function GiftRecipientRevealBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { giftInviteId, giverName, message, giftCreditCents, hasGiverDraft } = route.params;
  const user = useAuthStore((s) => s.user);
  const { refresh, household } = useSession();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const [phase, setPhase] = useState<Phase>(hasGiverDraft ? 'loading' : 'credit');
  const [saving, setSaving] = useState(false);
  const [giftLineItems, setGiftLineItems] = useState<BoxLineItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGift = useCallback(async () => {
    if (!hasGiverDraft) return;
    setPhase('loading');
    setLoadError(null);
    try {
      const gifts = await listMyReceivedGifts();
      const gift = gifts.find((g) => g.giftInviteId === giftInviteId);
      if (!gift || gift.kind !== 'box') {
        setLoadError('This gift box could not be loaded.');
        return;
      }
      setGiftLineItems(gift.lineItems ?? []);
      setPhase('fork');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load gift.');
    }
  }, [giftInviteId, hasGiverDraft]);

  useEffect(() => {
    if (hasGiverDraft) void loadGift();
  }, [hasGiverDraft, loadGift]);

  const chooseCustomize = () => {
    noteReceivedGiftViewedThisSession(giftInviteId);
    void markReceivedGiftViewed(giftInviteId).catch(() => undefined);
    setPhase('reveal');
  };

  const chooseSurprise = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await acceptReceivedGiftBox(giftInviteId);
      await refresh();
      navigation.replace('MyGifts');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not accept gift.');
    } finally {
      setSaving(false);
    }
  };

  const finishCustomizeReveal = async () => {
    noteReceivedGiftViewedThisSession(giftInviteId);
    if (user?.uid) {
      try {
        await markReceivedGiftViewed(giftInviteId);
      } catch {
        // Non-blocking — session mark still unlocks convert on My Gifts.
      }
      await refresh();
    }
    navigation.replace('GiftBox', { giftInviteId });
  };

  if (phase === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      </View>
    );
  }

  if (phase === 'credit' || !hasGiverDraft) {
    return (
      <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.shell}>
            <Text style={styles.kicker}>A gift from {giverName}</Text>
            <Text style={styles.title}>Your gift credit is ready</Text>
            {message ? <Text style={styles.message}>&ldquo;{message}&rdquo;</Text> : null}
            <Text style={styles.body}>
              {formatDollars(giftCreditCents || household?.giftCreditCents || 0)} is on your account
              as gift credit — not a curated gift box. {GIFT_CREDIT_SPEND_HINT}
            </Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => navigation.replace('StorefrontHome')}
            >
              <Text style={styles.ctaText}>Shop with credit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryCta} onPress={() => navigation.replace('MyGifts')}>
              <Text style={styles.secondaryCtaText}>My Gifts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkCta} onPress={() => navigation.replace('StorefrontHome')}>
              <Text style={styles.linkCtaText}>Browse the store</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </WebContentPanel>
    );
  }

  if (phase === 'reveal') {
    return (
      <OnboardingUnderStorefrontChromeContext.Provider value={true}>
        <BoxRevealScreen
          children={[]}
          familiarity="moderate"
          lineItems={giftLineItems}
          onDone={() => void finishCustomizeReveal()}
          doneLabel="Back to My Gifts"
        />
      </OnboardingUnderStorefrontChromeContext.Provider>
    );
  }

  return (
    <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <Text style={styles.kicker}>A gift from {giverName}</Text>
          <Text style={styles.title}>How do you want to receive it?</Text>
          {message ? <Text style={styles.message}>&ldquo;{message}&rdquo;</Text> : null}
          <Text style={styles.body}>
            {giverName} picked a {CURATED_GIFT_BOX_LABEL.toLowerCase()} for your family. This gift
            stays separate from your own box — peek and adjust here, or keep presents sealed until
            Hanukkah.
          </Text>

          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

          <TouchableOpacity
            style={styles.cta}
            onPress={() => void chooseSurprise()}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.ctaText}>Keep it a surprise</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.optionHint}>
            We&apos;ll hold this gift box for your family. You won&apos;t see what&apos;s inside until
            it arrives.
          </Text>

          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={chooseCustomize}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryCtaText}>See what they picked</Text>
          </TouchableOpacity>
          <Text style={styles.optionHint}>
            View the curation first. You can convert to gift credit later from My Gifts.
          </Text>

          <TouchableOpacity style={styles.linkCta} onPress={() => navigation.replace('MyGifts')}>
            <Text style={styles.linkCtaText}>Back to My Gifts</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </WebContentPanel>
  );
}

export function GiftRecipientRevealScreen() {
  return (
    <GiftRecipientChrome>
      <GiftRecipientRevealBody />
    </GiftRecipientChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', minHeight: 0 },
    scroll: {
      flexGrow: 1,
      paddingBottom: spacing.xxl,
      ...(isDesktop ? { alignItems: 'center' as const } : {}),
    },
    shell: {
      width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      paddingTop: isDesktop ? 41 : spacing.lg,
      alignItems: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
      gap: spacing.md,
      padding: spacing.lg,
    },
    errorText: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    kicker: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    title: {
      fontSize: 26,
      ...typeface('bold'),
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      color: colors.textPrimary,
      letterSpacing: -0.4,
    },
    message: {
      fontSize: typography.lg,
      fontStyle: 'italic',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.md,
      lineHeight: 24,
    },
    body: {
      fontSize: typography.lg,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    cta: {
      backgroundColor: colors.brand,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.pill,
      minWidth: 240,
      alignItems: 'center',
      marginBottom: spacing.sm,
      ...(Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : {}),
    },
    ctaText: { color: colors.textInverse, fontWeight: '700', fontSize: typography.lg },
    secondaryCta: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.pill,
      minWidth: 240,
      alignItems: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    secondaryCtaText: { color: colors.brand, fontWeight: '700', fontSize: typography.lg },
    linkCta: { marginTop: spacing.lg, padding: spacing.sm },
    linkCtaText: { color: colors.textSecondary, fontWeight: '600', fontSize: typography.md },
    optionHint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: spacing.xs,
      maxWidth: 360,
      ...typeface('regular'),
    },
  });
}
