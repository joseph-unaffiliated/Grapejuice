import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { giftBoxPriceLine } from '../../constants/giftCopy';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { useBoxLockDay } from '../../hooks/useBoxLockDay';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import type { ShippingAddressFieldErrors } from '../../utils/formValidation';
import type { SuggestedAddress } from '../../services/checkout/validateAddressRemote';
import { GiftGiverChildrenFields } from './GiftGiverChildrenFields';
import {
  hasGiverAddress,
  MAX_GIFT_CREDIT_KIDS,
  type GiftChildDraft,
  type GiftGiveFormValues,
  type GiftPath,
} from './giftGiveTypes';

type Props = {
  values: GiftGiveFormValues;
  childDrafts: GiftChildDraft[];
  onChange: (patch: Partial<GiftGiveFormValues>) => void;
  onChildDraftsChange: (next: GiftChildDraft[]) => void;
  onBack?: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel?: string;
  /** Inline validation (Alert is unreliable on web). */
  error?: string | null;
  /** When marketplace chrome provides nav, hide the local ← Back link. */
  hideBack?: boolean;
  /** Small "Cancel gift" link under the submit button — wipes the incomplete gift. */
  onCancelGift?: () => void;
  /** Optional recipient address (curated box only), shown after a failed submit. */
  addressError?: string | null;
  addressFieldErrors?: ShippingAddressFieldErrors;
  addressSuggestion?: SuggestedAddress | null;
  onUseAddressSuggestion?: () => void;
  /** Past box lock: the curated box can't be picked, only credit. */
  boxesClosed?: boolean;
  children?: React.ReactNode;
};

export function GiftGiveForm({
  values,
  childDrafts,
  onChange,
  onChildDraftsChange,
  onBack,
  onSubmit,
  submitting,
  submitLabel,
  error,
  hideBack = false,
  onCancelGift,
  addressError,
  addressFieldErrors,
  addressSuggestion,
  onUseAddressSuggestion,
  boxesClosed = false,
  children,
}: Props) {
  const lockDay = useBoxLockDay();
  const creditOnly = values.giftPath === 'credit_only';
  const customize = values.giftPath === 'customize';
  const pathChosen = values.giftPath != null;
  const [showAddress, setShowAddress] = React.useState(() => hasGiverAddress(values.shippingAddress));
  const creditKids = values.creditKids ?? 1;
  const creditCents = listBoxCentsForKids(creditKids);

  const defaultSubmit = !pathChosen
    ? 'Choose how this gift works'
    : creditOnly
      ? 'Continue to payment'
      : 'Curate what goes in their box';

  const setPath = (giftPath: GiftPath) => onChange({ giftPath });
  const setCreditKids = (n: number) =>
    onChange({ creditKids: Math.max(1, Math.min(MAX_GIFT_CREDIT_KIDS, n)) });

  const lead = !pathChosen
    ? 'Two ways to give. Pick one below.'
    : creditOnly
      ? boxesClosed
        ? 'Send gift credit they can spend in the Grapejuice store.'
        : 'Send gift credit worth a Hanukkah box for their family. Their parents build their own box or shop the store.'
      : `Pick what goes in their box, then pay: ${giftBoxPriceLine()}. They confirm where to send it by ${lockDay}.`;

  return (
    <View>
      {!hideBack && onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={checkoutUi.title}>Send a Gift</Text>
      <Text style={checkoutUi.lead}>{lead}</Text>

      <View style={checkoutUi.divider} />

      <Text style={checkoutUi.sectionHeading}>Gift Type</Text>
      <TouchableOpacity
        style={[styles.pathCard, customize && styles.pathCardOn, boxesClosed && styles.pathCardClosed]}
        onPress={() => setPath('customize')}
        disabled={submitting || boxesClosed}
        accessibilityRole="button"
        accessibilityState={{ selected: customize, disabled: boxesClosed }}
      >
        <Text style={[styles.pathTitle, customize && styles.pathTitleOn]}>Pick it for them</Text>
        <Text style={[styles.pathBody, customize && styles.pathBodyOn]}>
          {boxesClosed
            ? `Gift boxes for this Hanukkah closed on ${lockDay}. You can still send gift credit.`
            : `A curated Hanukkah box, chosen by you. ${giftBoxPriceLine()}.`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pathCard, creditOnly && styles.pathCardOn]}
        onPress={() => setPath('credit_only')}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityState={{ selected: creditOnly }}
      >
        <Text style={[styles.pathTitle, creditOnly && styles.pathTitleOn]}>Let them choose</Text>
        <Text style={[styles.pathBody, creditOnly && styles.pathBodyOn]}>
          {boxesClosed
            ? 'Gift credit for the Grapejuice store.'
            : 'Gift credit worth a box for their family. Their parents build their own box or shop the store.'}
        </Text>
      </TouchableOpacity>

      {creditOnly ? (
        <>
          <View style={checkoutUi.divider} />
          <Text style={checkoutUi.sectionHeading}>Gift Amount</Text>
          <View style={styles.kidsRow}>
            <Text style={styles.kidsLabel}>How many kids in their family?</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => setCreditKids(creditKids - 1)}
                style={styles.stepBtn}
                disabled={submitting || creditKids <= 1}
                accessibilityRole="button"
                accessibilityLabel="Fewer kids"
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepCount}>{creditKids}</Text>
              <TouchableOpacity
                onPress={() => setCreditKids(creditKids + 1)}
                style={styles.stepBtn}
                disabled={submitting || creditKids >= MAX_GIFT_CREDIT_KIDS}
                accessibilityRole="button"
                accessibilityLabel="More kids"
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={checkoutUi.hint}>
            {formatCatalogDollars(creditCents)} gift credit
            {boxesClosed ? '' : `, enough for a Hanukkah box for ${creditKids === 1 ? 'one kid' : `${creditKids} kids`}`}.
          </Text>
        </>
      ) : null}

      {pathChosen ? (
        <>
          <View style={checkoutUi.divider} />

          <Text style={checkoutUi.sectionHeading}>Gift Details</Text>
          <Text style={[checkoutUi.hint, styles.requiredHint]}>Fields marked * are required</Text>

          <Text style={checkoutUi.label}>
            Recipient email
            <Text style={styles.requiredMark}> *</Text>
          </Text>
          <TextInput
            style={[checkoutUi.input, error ? checkoutUi.inputError : null]}
            value={values.recipientEmail}
            onChangeText={(recipientEmail) => onChange({ recipientEmail })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="parent@example.com"
            placeholderTextColor={semanticColors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Recipient email, required"
          />
          {error ? <Text style={checkoutUi.fieldError}>{error}</Text> : null}

          <Text style={checkoutUi.label}>Your name (on the gift)</Text>
          <TextInput
            style={checkoutUi.input}
            value={values.giverName}
            onChangeText={(giverName) => onChange({ giverName })}
            placeholder="Grandma"
            placeholderTextColor={semanticColors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Your name on the gift"
          />

          <Text style={checkoutUi.label}>Short message (optional)</Text>
          <TextInput
            style={[checkoutUi.input, styles.textArea]}
            value={values.message}
            onChangeText={(message) => onChange({ message })}
            multiline
            placeholder="Happy Hanukkah!"
            placeholderTextColor={semanticColors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Gift message"
          />

          {customize ? (
            <>
              <View style={checkoutUi.divider} />
              <GiftGiverChildrenFields
                children={childDrafts}
                onChange={onChildDraftsChange}
                disabled={submitting}
              />
              <View style={checkoutUi.divider} />
              {showAddress ? (
                <>
                  <CheckoutAddressFields
                    address={values.shippingAddress ?? emptyShippingAddress}
                    onChange={(patch) =>
                      onChange({ shippingAddress: { ...(values.shippingAddress ?? emptyShippingAddress), ...patch } })
                    }
                    fieldErrors={addressFieldErrors}
                    suggestion={addressSuggestion}
                    onUseSuggestion={onUseAddressSuggestion}
                    heading="Their Shipping Address (optional)"
                    hint="Add it and they can keep the box a surprise: it ships without them seeing what's inside. They can still correct it."
                  />
                  {addressError ? <Text style={checkoutUi.fieldError}>{addressError}</Text> : null}
                  <TouchableOpacity
                    onPress={() => {
                      setShowAddress(false);
                      onChange({ shippingAddress: undefined });
                    }}
                    disabled={submitting}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.addressToggle}
                  >
                    <Text style={styles.addressToggleText}>Remove address</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowAddress(true)}
                  disabled={submitting}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.addressToggle}
                >
                  <Text style={styles.addressToggleText}>Know their address? Add it (optional)</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          <GrapejuiceButton
            label={submitLabel ?? defaultSubmit}
            onPress={onSubmit}
            variant="filled"
            loading={submitting}
            disabled={submitting}
            style={[checkoutUi.button, styles.ctaSpacing]}
            textStyle={checkoutUi.buttonText}
          />

          {onCancelGift ? (
            <TouchableOpacity
              onPress={onCancelGift}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel gift"
              hitSlop={8}
              style={styles.cancelGift}
            >
              <Text style={styles.cancelGiftText}>Cancel gift</Text>
            </TouchableOpacity>
          ) : null}

          {children}
        </>
      ) : (
        <Text style={[checkoutUi.hint, styles.pathHint]}>Select a gift type to continue.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: spacing.lg, alignSelf: 'flex-start' },
  backText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
  },
  requiredHint: { marginBottom: spacing.xs },
  requiredMark: {
    color: semanticColors.error,
    ...typeface('regular'),
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  pathHint: { marginTop: spacing.md },
  pathCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: semanticColors.bgPrimary,
  },
  pathCardOn: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  pathCardClosed: { opacity: 0.55 },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  kidsLabel: {
    ...typeface('regular'),
    flexShrink: 1,
    fontSize: typography.md,
    letterSpacing: -0.22,
    color: semanticColors.textPrimary,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
  },
  stepCount: {
    ...typeface('medium'),
    fontSize: typography.xl,
    color: semanticColors.textPrimary,
    minWidth: 24,
    textAlign: 'center',
  },
  pathTitle: {
    ...typeface('medium'),
    fontSize: typography.lg,
    letterSpacing: -0.26,
    color: semanticColors.textPrimary,
    marginBottom: spacing.xs,
  },
  pathTitleOn: {
    color: semanticColors.textInverse,
  },
  pathBody: {
    ...typeface('regular'),
    fontSize: typography.md,
    letterSpacing: -0.22,
    lineHeight: 18,
    color: semanticColors.textSecondary,
  },
  pathBodyOn: {
    color: 'rgba(255,255,255,0.78)',
  },
  ctaSpacing: { marginTop: spacing.xl },
  addressToggle: { alignSelf: 'flex-start', marginTop: spacing.xs },
  addressToggleText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.brand,
  },
  cancelGift: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  cancelGiftText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textDecorationLine: 'underline',
  },
});
