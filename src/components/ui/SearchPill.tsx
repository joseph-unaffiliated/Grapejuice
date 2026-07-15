import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  borderRadius,
  MOBILE_GUTTER,
  shadows,
  shadowsWeb,
  typography,
  typeface,
} from '../../constants/theme';
import { RAV_TYPEWRITER_PROMPTS } from '../../constants/ravStarterPrompts';
import { useThemeMode } from '../../context/ThemeContext';

const LINE = typography.lg;
/** Figma 366:1762 — 37px pill height */
export const SEARCH_PILL_HEIGHT = 37;

const DEFAULT_PLACEHOLDER = 'Search or ask a question';
const TYPE_MS = 38;
const DELETE_MS = 22;
/** Resting hold on the real placeholder between demo rounds. */
const HOLD_DEFAULT_MS = 4500;
/** Hold on each typed Rav question before the next one. */
const HOLD_DEMO_MS = 1800;
const GAP_MS = 280;
const DEMO_QUESTIONS_PER_ROUND = 3;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  returnKeyType?: 'search' | 'done' | 'default';
  /** Cycle Rav-style prompt typewriter when empty. Default true. */
  animatePlaceholder?: boolean;
};

function pickPromptBatch(previous: string, count: number): string[] {
  const batch: string[] = [];
  let last = previous;
  for (let i = 0; i < count; i += 1) {
    const pool = RAV_TYPEWRITER_PROMPTS.filter((p) => p !== last && !batch.includes(p));
    const list = pool.length > 0 ? pool : RAV_TYPEWRITER_PROMPTS.filter((p) => !batch.includes(p));
    const fallback = RAV_TYPEWRITER_PROMPTS.filter((p) => p !== last);
    const choices = list.length > 0 ? list : fallback.length > 0 ? fallback : RAV_TYPEWRITER_PROMPTS;
    const next = choices[Math.floor(Math.random() * choices.length)] ?? DEFAULT_PLACEHOLDER;
    batch.push(next);
    last = next;
  }
  return batch;
}

export function SearchPill({
  value,
  onChangeText,
  onSubmitEditing,
  placeholder = DEFAULT_PLACEHOLDER,
  returnKeyType = 'search',
  animatePlaceholder = true,
}: Props) {
  const { colors } = useThemeMode();
  const hasText = value.trim().length > 0;
  const [focused, setFocused] = useState(false);
  const [fauxText, setFauxText] = useState(placeholder);
  /** Italic muted type only while typing/holding demo questions — not while clearing or restoring default. */
  const [isDemo, setIsDemo] = useState(false);
  const cancelledRef = useRef(false);
  const lastPromptRef = useRef('');

  const runTypewriter = useCallback(async () => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    const setText = (next: string) => {
      if (!cancelledRef.current) setFauxText(next);
    };
    const setDemo = (next: boolean) => {
      if (!cancelledRef.current) setIsDemo(next);
    };

    const backspace = async (from: string) => {
      for (let i = from.length; i >= 0; i -= 1) {
        if (cancelledRef.current) return;
        setText(from.slice(0, i));
        await sleep(DELETE_MS);
      }
    };

    const typeOut = async (to: string) => {
      for (let i = 1; i <= to.length; i += 1) {
        if (cancelledRef.current) return;
        setText(to.slice(0, i));
        await sleep(TYPE_MS);
      }
    };

    setDemo(false);
    setText(placeholder);

    while (!cancelledRef.current) {
      // Idle: normal placeholder, held for a few seconds.
      await sleep(HOLD_DEFAULT_MS);
      if (cancelledRef.current) break;

      // Clear default in normal type — don't switch to italic yet.
      await backspace(placeholder);
      if (cancelledRef.current) break;
      await sleep(GAP_MS);
      if (cancelledRef.current) break;

      const batch = pickPromptBatch(lastPromptRef.current, DEMO_QUESTIONS_PER_ROUND);
      lastPromptRef.current = batch[batch.length - 1] ?? lastPromptRef.current;

      for (let q = 0; q < batch.length; q += 1) {
        const prompt = batch[q]!;
        setDemo(true);
        await typeOut(prompt);
        if (cancelledRef.current) break;

        await sleep(HOLD_DEMO_MS);
        if (cancelledRef.current) break;

        await backspace(prompt);
        if (cancelledRef.current) break;

        // Stay in demo style only if another question follows.
        if (q < batch.length - 1) {
          await sleep(GAP_MS);
          if (cancelledRef.current) break;
        }
      }
      if (cancelledRef.current) break;

      // Switch back to normal, then retype the resting placeholder.
      setDemo(false);
      await sleep(GAP_MS);
      if (cancelledRef.current) break;
      await typeOut(placeholder);
    }
  }, [placeholder]);

  useEffect(() => {
    if (!animatePlaceholder || hasText || focused) {
      cancelledRef.current = true;
      if (hasText || focused) {
        setFauxText(placeholder);
        setIsDemo(false);
      }
      return;
    }

    cancelledRef.current = false;
    void runTypewriter();
    return () => {
      cancelledRef.current = true;
    };
  }, [animatePlaceholder, hasText, focused, placeholder, runTypewriter]);

  const showFaux = animatePlaceholder && !hasText && !focused;
  const alignLeft = hasText || focused;
  const pillStyle = [
    styles.pill,
    { backgroundColor: colors.bgPrimary },
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm } : shadows.goldGlow,
  ];

  return (
    <View style={pillStyle}>
      {showFaux ? (
        <Text
          style={[
            styles.fauxBase,
            isDemo ? styles.fauxDemo : styles.fauxIdle,
            { color: isDemo ? colors.goldMuted : colors.textPrimary },
          ]}
          numberOfLines={1}
          pointerEvents="none"
        >
          {fauxText}
          {isDemo ? (
            <Text style={[styles.caret, { color: colors.goldMuted }]}>|</Text>
          ) : null}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          { color: colors.textPrimary },
          alignLeft ? styles.inputActive : styles.inputCentered,
          showFaux && styles.inputOverFaux,
        ]}
        placeholder={!animatePlaceholder && !focused && !hasText ? placeholder : ''}
        placeholderTextColor={colors.textPrimary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={returnKeyType}
        multiline={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: '100%',
    height: SEARCH_PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.pill,
    paddingHorizontal: MOBILE_GUTTER,
    position: 'relative',
  },
  fauxBase: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: LINE,
    lineHeight: SEARCH_PILL_HEIGHT,
    letterSpacing: -0.26,
    paddingHorizontal: MOBILE_GUTTER,
    ...(Platform.OS === 'web'
      ? ({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        } as object)
      : { includeFontPadding: false }),
  },
  fauxIdle: {
    fontStyle: 'normal',
    ...typeface('regular'),
  },
  fauxDemo: {
    fontStyle: 'italic',
    ...typeface('light'),
  },
  caret: {
    fontStyle: 'normal',
    ...typeface('light'),
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: LINE,
    lineHeight: LINE,
    height: LINE,
    padding: 0,
    margin: 0,
    letterSpacing: -0.26,
    ...typeface('regular'),
    zIndex: 2,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', border: 'none', backgroundColor: 'transparent' } as object)
      : { includeFontPadding: false, textAlignVertical: 'center' }),
  },
  inputOverFaux: {
    color: 'transparent',
    ...(Platform.OS === 'web' ? ({ caretColor: 'transparent' } as object) : null),
  },
  inputCentered: { textAlign: 'center' },
  inputActive: { textAlign: 'left' },
});
