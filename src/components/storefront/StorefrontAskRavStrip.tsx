import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SearchPill } from '../ui/SearchPill';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  /** Called with the typed question (or a default prompt if empty). */
  onSubmit: (message: string) => void;
};

const DEFAULT_ASK =
  'Help me browse the Hanukkah store — what should I look at first?';

export function StorefrontAskRavStrip({ onSubmit }: Props) {
  const [query, setQuery] = useState('');

  const submit = () => {
    const msg = query.trim();
    onSubmit(msg || DEFAULT_ASK);
    setQuery('');
  };

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.eyebrow}>Need a guide?</Text>
        <Text style={styles.headline}>Ask Rav</Text>
        <Text style={styles.body}>
          Overwhelmed by options? Rav helps you navigate the store — what fits your household,
          what to skip, and what belongs in your box.
        </Text>
        <View style={styles.pillWrap}>
          <SearchPill
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder="Search or ask a question"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semanticColors.bgPrimary,
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  inner: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 28,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  body: {
    ...typeface('regular'),
    fontSize: 13,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  pillWrap: {
    width: '100%',
    maxWidth: 520,
    marginTop: spacing.xs,
  },
});
