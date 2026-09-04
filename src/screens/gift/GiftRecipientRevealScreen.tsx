/** Figma rGzXYb1rNVxqGHz81835Jn — frame 17: recipient reveal after claim. */
import React, { useMemo, useState } from 'react';
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
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { SemanticColors } from '../../constants/themeMode';
import { acceptReceivedGiftBox, markReceivedGiftViewed } from '../../services/gift/giftFlow';
import { noteReceivedGiftViewedThisSession } from './receivedGiftViewedSession';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { CURATED_GIFT_BOX_LABEL, GIFT_CREDIT_SPEND_HINT } from '../../constants/giftCopy';

type Route = RouteProp<MainStackParamList, 'GiftRecipientReveal'>;

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
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const chooseCustomize = () => {
    noteReceivedGiftViewedThisSession(giftInviteId);
    void markReceivedGiftViewed(giftInviteId).catch(() => undefined);
    // Editable gift box (swaps live here). Avoid the read-only peek → /store race.
    navigation.replace('GiftBox', { giftInviteId });
  };

  const chooseSurprise = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setLoadError(null);
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

  if (!hasGiverDraft) {
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

  return (
    <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <Text style={styles.kicker}>A gift from {giverName}</Text>
          <Text style={styles.title}>How do you want to receive it?</Text>
          {message ? <Text style={styles.message}>&ldquo;{message}&rdquo;</Text> : null}
          <Text style={styles.body}>
            {giverName} picked a {CURATED_GIFT_BOX_LABEL.toLowerCase()} for your family. This gift
            stays separate from your own box — open and adjust here, or keep presents sealed until
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
            Open the box to swap or add items. You only pay if you upgrade beyond what they already
            covered.
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
      justifyContent: 'center',
      paddingVertical: spacing.xl,
      ...(isDesktop ? { alignItems: 'center' as const } : {}),
    },
    shell: {
      width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      alignItems: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
    },
    kicker: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      ...typeface('medium'),
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      ...typeface('medium'),
      letterSpacing: -0.4,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    message: {
      fontSize: typography.lg,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginBottom: spacing.md,
      lineHeight: typography.lg * 1.4,
      ...typeface('regular'),
    },
    body: {
      fontSize: typography.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: typography.md * 1.45,
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    optionHint: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: typography.sm * 1.4,
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.md,
      ...typeface('regular'),
    },
    errorText: {
      color: colors.error ?? '#B91C1C',
      marginBottom: spacing.md,
      textAlign: 'center',
      ...typeface('regular'),
    },
    cta: {
      alignSelf: 'stretch',
      backgroundColor: colors.textPrimary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      ...(Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null),
    },
    ctaText: {
      color: colors.goldMuted,
      fontSize: typography.md,
      ...typeface('bold'),
    },
    secondaryCta: {
      alignSelf: 'stretch',
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      backgroundColor: colors.bgPrimary,
    },
    secondaryCtaText: {
      color: colors.textPrimary,
      fontSize: typography.md,
      ...typeface('bold'),
    },
    linkCta: { marginTop: spacing.sm, padding: spacing.sm },
    linkCtaText: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
      textAlign: 'center',
    },
  });
}
