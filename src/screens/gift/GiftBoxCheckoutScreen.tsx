import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Constants from 'expo-constants';
import { useStripe } from '@stripe/stripe-react-native';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { CheckoutOrderSummary } from '../main/checkout/CheckoutOrderSummary';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { useCatalog } from '../../hooks/useCatalog';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { createReceivedGiftCheckout } from '../../services/gift/giftFlow';
import { formatDollars, chargeableLineTotal } from '../../services/box/buildDefaultBox';
import { SHIPPING_FLAT_CENTS } from '../../services/box/pricing';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import type { MainStackParamList } from '../../navigation/types';
import type { ShippingAddress } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Route = RouteProp<MainStackParamList, 'GiftBoxCheckout'>;

export function GiftBoxCheckoutScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { giftInviteId } = route.params;
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { household, refresh: refreshSession } = useSession();
  const { gifts, loading: giftsLoading, refresh } = useReceivedGifts();
  const { items: catalog } = useCatalog();
  const skipShipStation = useMockFlowStore((s) => s.active);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const gift = gifts.find((g) => g.giftInviteId === giftInviteId);
  const lineItems = gift?.lineItems ?? [];
  const [address, setAddress] = useState<ShippingAddress>(emptyShippingAddress);
  const [preparing, setPreparing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const stripeKey = extra?.stripePublishableKey ?? '';

  const subtotal = chargeableLineTotal(lineItems);
  const shippingCents = SHIPPING_FLAT_CENTS;
  const taxCents = Math.round((subtotal + shippingCents) * 0.075);
  const preCredit = subtotal + shippingCents + taxCents;
  const giftCreditApplied = Math.min(household?.giftCreditCents ?? 0, preCredit);
  const platformCreditApplied = Math.min(
    household?.platformCreditCents ?? 0,
    preCredit - giftCreditApplied
  );
  const total = preCredit - giftCreditApplied - platformCreditApplied;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const finish = useCallback(
    async (orderId: string) => {
      await refresh();
      await refreshSession({ silent: true });
      navigation.replace('OrderConfirmation', { orderId });
    },
    [navigation, refresh, refreshSession]
  );

  const startCheckout = async () => {
    setFormError(null);
    if (!address.name.trim() || !address.line1.trim() || !address.city.trim()) {
      setFormError('Please enter name, street address, and city.');
      return;
    }
    if (!address.stateProvince.trim() || !address.postalCode.trim()) {
      setFormError('Please enter state/province and postal code.');
      return;
    }
    if (!gift || gift.status !== 'available') {
      setFormError('This gift is no longer available for checkout.');
      return;
    }

    setPreparing(true);
    try {
      const result = await createReceivedGiftCheckout(
        giftInviteId,
        {
          ...address,
          name: address.name.trim(),
          line1: address.line1.trim(),
          line2: address.line2?.trim() || undefined,
          city: address.city.trim(),
          stateProvince: address.stateProvince.trim(),
          postalCode: address.postalCode.trim(),
        },
        lineItems,
        { skipShipStation }
      );

      if (result.status === 'confirmed' || result.totalCents === 0) {
        await finish(result.orderId);
        return;
      }
      if (!result.clientSecret || !stripeKey) {
        setFormError('Payment could not be started.');
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: result.clientSecret,
        merchantDisplayName: 'Grapejuice',
      });
      if (initError) throw new Error(initError.message);
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') throw new Error(presentError.message);
        return;
      }
      await finish(result.orderId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed.';
      setFormError(msg);
      Alert.alert('Could not start payment', msg);
    } finally {
      setPreparing(false);
    }
  };

  if (giftsLoading || !gift) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => navigation.navigate('GiftBox', { giftInviteId })}
          style={styles.backRow}
        >
          <Text style={styles.backLink}>← Back to gift box</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Gift box checkout</Text>
        <CheckoutOrderSummary
          lineItems={lineItems}
          total={total}
          subtotal={subtotal}
          shippingCents={shippingCents}
          taxCents={taxCents}
          boxPriceCents={0}
          catalog={catalog}
          giftCreditApplied={giftCreditApplied}
          platformCreditApplied={platformCreditApplied}
          marketplaceOnly
        />
        <CheckoutAddressFields
          address={address}
          onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <TouchableOpacity
          style={[styles.cta, preparing && styles.ctaDisabled]}
          onPress={() => void startCheckout()}
          disabled={preparing}
        >
          {preparing ? (
            <BrandLoadingMark large={false} color={colors.goldMuted} />
          ) : (
            <Text style={styles.ctaText}>
              {total > 0 ? `Place order · ${formatDollars(total)}` : 'Confirm gift box'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: spacing.lg, paddingBottom: 120 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    backRow: { marginBottom: spacing.md },
    backLink: { color: colors.brand, fontWeight: '600', fontSize: typography.md },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      ...typeface('regular'),
      marginBottom: spacing.lg,
    },
    formError: { marginTop: spacing.md, color: '#B91C1C', fontSize: typography.md },
    cta: {
      marginTop: spacing.lg,
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: colors.goldMuted, fontWeight: '700' },
  });
}
