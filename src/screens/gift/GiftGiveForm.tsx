import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { CURATED_GIFT_BOX_LABEL } from '../../constants/giftCopy';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
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
  children,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Send a Hanukkah gift</Text>
      <Text style={styles.lead}>{lead}</Text>

      <Text style={styles.pathHeading}>How should this gift work?</Text>
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
          <Text style={styles.label}>Recipient email</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            value={values.recipientEmail}
            onChangeText={(recipientEmail) => onChange({ recipientEmail })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="parent@example.com"
            placeholderTextColor={colors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Recipient email"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>Your name (on the gift)</Text>
          <TextInput
            style={styles.input}
            value={values.giverName}
            onChangeText={(giverName) => onChange({ giverName })}
            placeholder="Grandma"
            placeholderTextColor={colors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Your name on the gift"
          />

          <Text style={styles.label}>Short message (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={values.message}
            onChangeText={(message) => onChange({ message })}
            multiline
            placeholder="Happy Hanukkah!"
            placeholderTextColor={colors.textTertiary}
            editable={!submitting}
            accessibilityLabel="Gift message"
          />

          {customize ? (
            <GiftGiverChildrenFields
              children={childDrafts}
              onChange={onChildDraftsChange}
              disabled={submitting}
            />
          ) : null}

          <GrapejuiceButton
            label={submitLabel ?? defaultSubmit}
            onPress={onSubmit}
            variant="filled"
            loading={submitting}
            disabled={submitting}
            style={styles.cta}
          />

          {children}
        </>
      ) : (
        <Text style={styles.pathHint}>Select a path above to continue.</Text>
      )}
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    back: {
      color: colors.brand,
      fontSize: typography.md,
      marginBottom: spacing.md,
      ...typeface('medium'),
    },
    title: {
      fontSize: 28,
      letterSpacing: -0.6,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    lead: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      ...typeface('regular'),
    },
    label: {
      fontSize: typography.sm,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      marginTop: spacing.md,
      ...typeface('medium'),
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.lg,
      color: colors.textPrimary,
      backgroundColor: colors.bgPrimary,
      ...typeface('regular'),
    },
    inputError: {
      borderColor: '#B42318',
    },
    textArea: {
      minHeight: 88,
      textAlignVertical: 'top',
      paddingTop: spacing.sm,
    },
    errorText: {
      marginTop: spacing.xs,
      fontSize: typography.sm,
      color: '#B42318',
      ...typeface('medium'),
    },
    pathHeading: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      ...typeface('bold'),
    },
    pathHint: {
      marginTop: spacing.md,
      fontSize: typography.md,
      color: colors.textTertiary,
      ...typeface('regular'),
    },
    pathCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.bgPrimary,
    },
    pathCardOn: {
      backgroundColor: '#000000',
      borderColor: '#000000',
    },
    pathTitle: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
      ...typeface('bold'),
    },
    pathTitleOn: {
      color: '#FFFFFF',
    },
    pathBody: {
      fontSize: typography.md,
      color: colors.textSecondary,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    pathBodyOn: {
      color: 'rgba(255,255,255,0.78)',
    },
    cta: {
      alignSelf: 'stretch',
      width: '100%',
      minWidth: 0,
      marginTop: spacing.xl,
    },
  });
}
