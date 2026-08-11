import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { SearchPill } from '../ui/SearchPill';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  /** Called with the typed question when the user submits. */
  onSubmit: (message: string) => void;
};

const ASK_GO_SIZE = 28;
const ASK_TRAILING_WIDTH = ASK_GO_SIZE + 4;

export function StorefrontAskRavStrip({ onSubmit }: Props) {
  const [query, setQuery] = useState('');
  const hasText = query.trim().length > 0;

  const submit = () => {
    const msg = query.trim();
    if (!msg) return;
    onSubmit(msg);
    setQuery('');
  };

  const askGo = (
    <TouchableOpacity
      style={[styles.askGo, !hasText && styles.askGoHidden]}
      onPress={submit}
      disabled={!hasText}
      pointerEvents={hasText ? 'auto' : 'none'}
      accessibilityRole="button"
      accessibilityLabel="Ask Rav"
      hitSlop={8}
    >
      <Icon icon={icons.arrowUp} size={16} color={semanticColors.brand} />
    </TouchableOpacity>
  );

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
            placeholder="Ask a question"
            accessibilityLabel="Ask a question"
            trailing={askGo}
            trailingWidth={hasText ? ASK_TRAILING_WIDTH : 0}
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
  askGo: {
    width: ASK_GO_SIZE,
    height: ASK_GO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askGoHidden: {
    opacity: 0,
  },
});
