import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
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

/** Unventures.co cold-press watercolor paper (site atmosphere texture). */
const PAPER_BG = require('../../../assets/storefront/cold-press-toothy.jpg');

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
    <ImageBackground
      source={PAPER_BG}
      style={styles.root}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      {/* Soft wash so type stays readable over the toothy paper grain. */}
      <View style={styles.wash} pointerEvents="none" />
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    overflow: 'hidden',
    // Fallback while the texture loads / if image fails.
    backgroundColor: '#F7F6F2',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251, 248, 239, 0.42)',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, rgba(216, 201, 144, 0.18) 0%, rgba(255, 255, 255, 0.55) 42%, rgba(255, 255, 255, 0.62) 50%, rgba(255, 255, 255, 0.55) 58%, rgba(216, 201, 144, 0.18) 100%)',
        } as object)
      : null),
  },
  inner: {
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
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
