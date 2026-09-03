/** Post-payment confirmation for gift giver — checkout-adjacent visual language. */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import {
  CURATED_GIFT_BOX_LABEL,
  GIFT_CREDIT_SPEND_HINT,
  giftCreditProductLabel,
} from '../../constants/giftCopy';
import { spacing, typography, borderRadius, typeface, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useWebLayout } from '../../hooks/useWebLayout';

type Route = RouteProp<MainStackParamList, 'GiftSentConfirmation'>;

function GiftSentConfirmationBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { goHome } = useStorefrontActions();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);

  const {
    recipientEmail,
    customize,
    giverName,
    amountCents = DEFAULT_BOX_PRICE_CENTS,
    claimUrl,
  } = route.params;

  const fromLabel =
    giverName?.trim() && !/^you$/i.test(giverName.trim()) ? giverName.trim() : 'You';
  const amountLabel = formatDollars(amountCents);

  const lead = customize
    ? `We emailed ${recipientEmail} a link to claim the ${CURATED_GIFT_BOX_LABEL.toLowerCase()} you picked for them.`
    : `We emailed ${recipientEmail} a link to claim ${giftCreditProductLabel(amountCents)}.`;

  const productLabel = customize ? CURATED_GIFT_BOX_LABEL : giftCreditProductLabel(amountCents);

  return (
    <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.breadcrumb}>
            <Text style={styles.crumbLink} onPress={goHome} accessibilityRole="link">
              Store
            </Text>
            <Text style={styles.crumbSep}> / </Text>
            <Text style={styles.crumbCurrent}>Gift sent</Text>
          </View>

          <Text style={styles.check} accessibilityLabel="Success">
            ✓
          </Text>
          <Text style={styles.title}>Gift sent</Text>
          <Text style={styles.lead}>{lead}</Text>

          <View
            style={[
              styles.summaryCard,
              Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null,
            ]}
          >
            <Text style={styles.summaryHeading}>What they received</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gift</Text>
              <Text style={styles.summaryValue}>{productLabel}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>From</Text>
              <Text style={styles.summaryValue}>{fromLabel}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Claim email</Text>
              <Text style={[styles.summaryValue, styles.summaryEmail]} numberOfLines={2}>
                {recipientEmail}
              </Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.totalLabel}>You paid</Text>
              <Text style={styles.totalValue}>{amountLabel}</Text>
            </View>
          </View>

          <Text style={styles.nextTitle}>What happens next</Text>
          <Text style={styles.nextBody}>
            {customize
              ? 'When they open the link, they’ll see the items you picked and can keep it as a surprise or adjust before ship.'
              : `When they open the link, the credit is added to their account. ${GIFT_CREDIT_SPEND_HINT}`}
          </Text>

          {__DEV__ && claimUrl ? (
            <Text style={styles.devClaim} selectable>
              Dev claim link: {claimUrl}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.cta}
            onPress={goHome}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Back to store</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Orders')}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>View in Orders</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </WebContentPanel>
  );
}

export function GiftSentConfirmationScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftSentConfirmationBody />
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: {
      flex: 1,
      width: '100%',
      minHeight: 0,
      backgroundColor: colors.bgPrimary,
    },
    scroll: {
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      flexGrow: 1,
    },
    scrollDesktop: {
      paddingTop: spacing.xl,
      alignItems: 'center',
    },
    shell: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
    },
    breadcrumb: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    crumbLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbSep: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.goldMuted,
    },
    crumbCurrent: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: colors.logoDark,
    },
    check: {
      fontSize: 40,
      color: colors.brand,
      textAlign: 'center',
      marginBottom: spacing.sm,
      ...typeface('bold'),
    },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      textAlign: 'center',
      marginBottom: spacing.sm,
      ...typeface('regular'),
    },
    lead: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    summaryCard: {
      backgroundColor: isDesktop ? colors.bgElevated : colors.accentCream,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    summaryHeading: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginBottom: spacing.md,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      ...typeface('medium'),
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    summaryLabel: {
      fontSize: typography.md,
      color: colors.textSecondary,
      flexShrink: 0,
      ...typeface('regular'),
    },
    summaryValue: {
      fontSize: typography.md,
      color: colors.textPrimary,
      textAlign: 'right',
      flex: 1,
      ...typeface('medium'),
    },
    summaryEmail: {
      ...typeface('regular'),
    },
    summaryTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    totalLabel: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    totalValue: {
      fontSize: typography.lg,
      color: colors.logoDark,
      ...typeface('bold'),
    },
    nextTitle: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    nextBody: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    devClaim: {
      fontSize: typography.sm,
      color: colors.textTertiary,
      marginBottom: spacing.lg,
      ...typeface('regular'),
    },
    cta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      minHeight: 52,
    },
    ctaText: {
      color: colors.goldMuted,
      fontWeight: '700',
      fontSize: typography.md,
    },
    secondary: {
      marginTop: spacing.md,
      alignItems: 'center',
      padding: spacing.sm,
    },
    secondaryText: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
    },
  });
}
