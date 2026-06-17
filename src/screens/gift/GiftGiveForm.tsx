import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { GiftGiverChildrenFields } from './GiftGiverChildrenFields';
import type { GiftChildDraft, GiftGiveFormValues, GiftPath } from './giftGiveTypes';

type Props = {
  values: GiftGiveFormValues;
  childDrafts: GiftChildDraft[];
  onChange: (patch: Partial<GiftGiveFormValues>) => void;
  onChildDraftsChange: (next: GiftChildDraft[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel?: string;
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
  children,
}: Props) {
  const creditOnly = values.giftPath === 'credit_only';
  const defaultSubmit = creditOnly
    ? `Pay ${formatDollars(DEFAULT_BOX_PRICE_CENTS)} & send`
    : 'Pick their box';

  const setPath = (giftPath: GiftPath) => onChange({ giftPath });

  return (
    <View>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Send a Hanukkah box gift</Text>
      <Text style={styles.lead}>
        Pay {formatDollars(DEFAULT_BOX_PRICE_CENTS)} — the family claims credit and opens their box. No card needed on
        their side if credit covers the box.
      </Text>

      <Text style={styles.label}>Recipient email</Text>
      <TextInput
        style={styles.input}
        value={values.recipientEmail}
        onChangeText={(recipientEmail) => onChange({ recipientEmail })}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="parent@example.com"
        editable={!submitting}
      />

      <Text style={styles.label}>Your name (on the gift)</Text>
      <TextInput
        style={styles.input}
        value={values.giverName}
        onChangeText={(giverName) => onChange({ giverName })}
        placeholder="Grandma"
        editable={!submitting}
      />

      <Text style={styles.label}>Short message (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={values.message}
        onChangeText={(message) => onChange({ message })}
        multiline
        placeholder="Happy Hanukkah!"
        editable={!submitting}
      />

      <Text style={styles.pathHeading}>How should this gift work?</Text>
      <TouchableOpacity
        style={[styles.pathCard, !creditOnly && styles.pathCardOn]}
        onPress={() => setPath('customize')}
        disabled={submitting}
      >
        <Text style={styles.pathTitle}>Pick items for them</Text>
        <Text style={styles.pathBody}>Preview the curated box, swap a few items — &ldquo;Grandma picked this.&rdquo;</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pathCard, creditOnly && styles.pathCardOn]}
        onPress={() => setPath('credit_only')}
        disabled={submitting}
      >
        <Text style={styles.pathTitle}>Let them choose</Text>
        <Text style={styles.pathBody}>Send {formatDollars(DEFAULT_BOX_PRICE_CENTS)} credit only — they customize everything.</Text>
      </TouchableOpacity>

      {!creditOnly ? (
        <GiftGiverChildrenFields children={childDrafts} onChange={onChildDraftsChange} disabled={submitting} />
      ) : null}

      {children}

      <TouchableOpacity style={styles.cta} onPress={onSubmit} disabled={submitting}>
        <Text style={styles.ctaText}>{submitting ? 'Processing…' : (submitLabel ?? defaultSubmit)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: semanticColors.brand, fontWeight: '600', marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.sm },
  lead: { fontSize: typography.md, lineHeight: 20, color: semanticColors.textSecondary, marginBottom: spacing.lg },
  label: { fontSize: typography.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: typography.lg,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pathHeading: { fontSize: typography.lg, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  pathCard: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: semanticColors.bgElevated,
  },
  pathCardOn: { borderColor: semanticColors.brand, backgroundColor: semanticColors.bgPrimary },
  pathTitle: { fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.xs },
  pathBody: { fontSize: typography.md, color: semanticColors.textSecondary, lineHeight: 20 },
  cta: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
});
