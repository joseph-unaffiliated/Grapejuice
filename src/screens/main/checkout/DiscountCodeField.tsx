import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { checkoutUi } from './checkoutUi';
import { borderRadius, semanticColors, spacing, typeface, typography } from '../../../constants/theme';
import type { PromoState } from '../../../services/promo/usePromo';

/** "Discount code" entry for every checkout. The server re-validates when the order is placed. */
export function DiscountCodeField({ promo, disabled = false }: { promo: PromoState; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const apply = async () => {
    if (await promo.applyCode(text)) {
      setText('');
      setOpen(false);
    }
  };

  const influencerNote =
    promo.influencer && promo.influencer.label
      ? `${promo.influencer.name}’s offer: ${promo.influencer.label}${
          promo.code ? ' (we’ll use whichever saves you more)' : ''
        }`
      : null;

  return (
    <View style={styles.root}>
      {influencerNote ? <Text style={checkoutUi.hint}>{influencerNote}</Text> : null}
      {promo.code ? (
        <View style={styles.appliedRow}>
          <Text style={styles.applied}>
            {promo.code.code} · {promo.code.label}
          </Text>
          <TouchableOpacity
            onPress={promo.removeCode}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Remove code ${promo.code.code}`}
          >
            <Text style={styles.link}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : open ? (
        <>
          <Text style={checkoutUi.label}>Discount code</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void apply()}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              editable={!disabled && !promo.checking}
              placeholder="Enter code"
              placeholderTextColor={semanticColors.textSecondary}
              accessibilityLabel="Discount code"
              style={[checkoutUi.input, styles.input, promo.codeError ? checkoutUi.inputError : null]}
            />
            <TouchableOpacity
              onPress={() => void apply()}
              disabled={disabled || promo.checking || !text.trim()}
              accessibilityRole="button"
              style={[styles.applyBtn, (disabled || promo.checking || !text.trim()) && styles.applyBtnDisabled]}
            >
              <Text style={styles.applyText}>{promo.checking ? 'Checking…' : 'Apply'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button">
          <Text style={styles.link}>Have a discount code?</Text>
        </TouchableOpacity>
      )}
      {promo.codeError ? <Text style={checkoutUi.fieldError}>{promo.codeError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  applied: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.textPrimary,
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
  applyBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnDisabled: {
    opacity: 0.5,
  },
  applyText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
