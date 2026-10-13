import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Pressable,
  ImageBackground,
} from 'react-native';
import { SearchPill } from '../ui/SearchPill';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { RAV_TYPEWRITER_PROMPTS } from '../../constants/ravStarterPrompts';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../mobile/mobileTheme';

/** Unventures.co cold-press watercolor paper (site atmosphere texture). */
const PAPER_BG = require('../../../assets/storefront/cold-press-toothy.jpg');

export const ASK_RAV_DEFAULT_EYEBROW = '';
export const ASK_RAV_DEFAULT_HEADLINE = 'Need some guidance? Just ask Rav.';
export const ASK_RAV_DEFAULT_BODY =
  'Overwhelmed by options? Want help planning? Rav is your knowledgeable (and non-judgemental) friend next door, here to help you plan for the holidays and figure out what you need.';
export const ASK_RAV_DEFAULT_PLACEHOLDER = 'Ask a question';

type Props = {
  /** Called with the typed question when the user submits, or empty string when opening the panel from the card. */
  onSubmit: (message: string) => void;
  eyebrow?: string;
  headline?: string;
  body?: string;
  placeholder?: string;
  /**
   * Rotating SearchPill demo prompts.
   * - omit / undefined → default Hanukkah prompts
   * - [] → no autoplay (static placeholder only)
   * - string[] → custom rotating prompts
   */
  prompts?: readonly string[];
  /** Phone design kit: beige card with left-aligned type instead of the paper texture. */
  mobileKit?: boolean;
};

const ASK_GO_SIZE = 28;
const ASK_TRAILING_WIDTH = ASK_GO_SIZE + 4;

export function StorefrontAskRavStrip({
  onSubmit,
  eyebrow = ASK_RAV_DEFAULT_EYEBROW,
  headline = ASK_RAV_DEFAULT_HEADLINE,
  body = ASK_RAV_DEFAULT_BODY,
  placeholder = ASK_RAV_DEFAULT_PLACEHOLDER,
  prompts,
  mobileKit = false,
}: Props) {
  const { isCompact: compact } = useLayoutBreakpoint();
  const [query, setQuery] = useState('');
  const hasText = query.trim().length > 0;
  const cleanedPrompts =
    prompts === undefined
      ? undefined
      : prompts.map((p) => p.trim()).filter(Boolean);
  const animatePlaceholder = cleanedPrompts === undefined || cleanedPrompts.length > 0;
  const promptList =
    cleanedPrompts === undefined
      ? RAV_TYPEWRITER_PROMPTS
      : cleanedPrompts.length > 0
        ? cleanedPrompts
        : RAV_TYPEWRITER_PROMPTS;

  const submit = () => {
    const msg = query.trim();
    if (!msg) return;
    onSubmit(msg);
    setQuery('');
  };

  const openPanel = () => {
    onSubmit(query.trim());
  };

  const askGo = (
    <TouchableOpacity
      style={[styles.askGo, !hasText && styles.askGoHidden]}
      onPress={submit}
      disabled={!hasText}
      accessibilityRole="button"
      accessibilityLabel="Ask Rav"
      hitSlop={8}
    >
      <Icon icon={icons.arrowUp} size={16} color={semanticColors.brand} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.outer, mobileKit && kitStyles.outer]}>
      <Pressable
        onPress={openPanel}
        accessibilityRole="button"
        accessibilityLabel="Open Ask Rav"
        style={({ pressed }) => [pressed && styles.cardPressed]}
      >
        <ImageBackground
          source={mobileKit ? undefined : PAPER_BG}
          style={[styles.root, compact && styles.rootMobile, mobileKit && kitStyles.root]}
          imageStyle={styles.bgImage}
          resizeMode="cover"
        >
          {/* Soft wash so type stays readable over the toothy paper grain. */}
          {mobileKit ? null : <View style={styles.wash} pointerEvents="none" />}
          <View style={[styles.inner, mobileKit && kitStyles.inner]} pointerEvents="box-none">
            <View
              style={[styles.ravMark, mobileKit && kitStyles.ravMark]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Icon icon={icons.childReaching} size={18} color={semanticColors.logoDark} />
            </View>
            {eyebrow ? <Text style={mobileKit ? mType.eyebrow : styles.eyebrow}>{eyebrow}</Text> : null}
            {headline ? (
              <Text style={mobileKit ? kitStyles.headline : styles.headline} {...(mobileKit ? balanceProps : null)}>
                {headline}
              </Text>
            ) : null}
            {body ? <Text style={mobileKit ? kitStyles.body : styles.body}>{body}</Text> : null}
            <View
              style={styles.pillWrap}
              // Capture presses so the card open handler does not fire while using the field.
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              {...(Platform.OS === 'web'
                ? ({
                    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
                  } as object)
                : null)}
            >
              <SearchPill
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                placeholder={placeholder}
                accessibilityLabel={placeholder}
                animatePlaceholder={animatePlaceholder}
                prompts={promptList}
                trailing={askGo}
                trailingWidth={hasText ? ASK_TRAILING_WIDTH : 0}
              />
            </View>
          </View>
        </ImageBackground>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    maxWidth: 1024,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    marginVertical: spacing.md,
  },
  cardPressed: {
    opacity: 0.96,
  },
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    // Fallback while the texture loads / if image fails.
    backgroundColor: '#F7F6F2',
  },
  rootMobile: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  bgImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
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
  ravMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
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
    // RN lineHeight is px only — 115% of fontSize (unitless % is not supported).
    lineHeight: 28 * 1.15,
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
    pointerEvents: 'none',
  },
});

const kitStyles = StyleSheet.create({
  outer: { paddingHorizontal: mGutter },
  root: { backgroundColor: m.beige, borderRadius: mRadius.lg, paddingHorizontal: 22, paddingTop: 36, paddingBottom: 32 },
  inner: { alignItems: 'center', gap: 16 },
  ravMark: { backgroundColor: m.gold, marginBottom: 4 },
  headline: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6, color: m.ink, ...mFont(400), textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300), textAlign: 'center' },
});
