import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { CURATED_GIFT_BOX_LABEL } from '../../constants/giftCopy';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { spacing, typography, borderRadius, typeface, semanticColors } from '../../constants/theme';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { GiftGiverChildrenFields } from './GiftGiverChildrenFields';
import type { GiftChildDraft, GiftGiveFormValues, GiftPath } from './giftGiveTypes';

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
  children,
}: Props) {
  const creditOnly = values.giftPath === 'credit_only';
  const customize = values.giftPath === 'customize';
  const pathChosen = values.giftPath != null;

  const defaultSubmit = !pathChosen
    ? 'Choose how this gift works'
    : creditOnly
      ? 'Continue to payment'
      : 'Pick their box';

  const setPath = (giftPath: GiftPath) => onChange({ giftPath });

  const lead = !pathChosen
    ? `Pay ${formatDollars(DEFAULT_BOX_PRICE_CENTS)}. Two different gifts — pick one below.`
    : creditOnly
      ? `Send ${formatDollars(DEFAULT_BOX_PRICE_CENTS)} as gift credit — spendable in the store or toward a Hanukkah box. You won’t pick items for them; they choose how to spend it after claiming.`
      : `You’ll preview a ${CURATED_GIFT_BOX_LABEL.toLowerCase()}, swap items if you want, then pay ${formatDollars(DEFAULT_BOX_PRICE_CENTS)}. They’ll see what you picked.`;

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
        style={[styles.pathCard, creditOnly && styles.pathCardOn]}
        onPress={() => setPath('credit_only')}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityState={{ selected: creditOnly }}
      >
        <Text style={[styles.pathTitle, creditOnly && styles.pathTitleOn]}>Let them choose</Text>
        <Text style={[styles.pathBody, creditOnly && styles.pathBodyOn]}>
          {formatDollars(DEFAULT_BOX_PRICE_CENTS)} gift credit — no box for you to review. They can
          shop à la carte or put it toward their own Hanukkah box after claiming.
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pathCard, customize && styles.pathCardOn]}
        onPress={() => setPath('customize')}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityState={{ selected: customize }}
      >
        <Text style={[styles.pathTitle, customize && styles.pathTitleOn]}>Pick items for them</Text>
        <Text style={[styles.pathBody, customize && styles.pathBodyOn]}>
          Preview and swap items in a {CURATED_GIFT_BOX_LABEL.toLowerCase()} — “Grandma picked this.”
        </Text>
      </TouchableOpacity>

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
  back: { marginBottom: spacing.md, alignSelf: 'flex-start' },
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
