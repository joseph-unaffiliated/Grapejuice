import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  AppState,
  type AppStateStatus,
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

function readPageVisible(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.visibilityState === 'visible';
  }
  return AppState.currentState === 'active';
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
  /** Browser tab / app foreground — background timers burst on resume and scramble the loop. */
  const [pageVisible, setPageVisible] = useState(readPageVisible);
  const lastPromptRef = useRef('');
  /** Monotonic run id — stale async loops bailed even if a newer run already started. */
  const runIdRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVis = () => setPageVisible(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVis);
      return () => document.removeEventListener('visibilitychange', onVis);
    }
    const onApp = (state: AppStateStatus) => setPageVisible(state === 'active');
    const sub = AppState.addEventListener('change', onApp);
    return () => sub.remove();
  }, []);

  const runTypewriter = useCallback(
    async (isCurrent: () => boolean) => {
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const started = Date.now();
          const tick = () => {
            if (!isCurrent()) {
              resolve();
              return;
            }
            // Wall-clock sleep: after tab throttle, don't fire a backlog of short sleeps at once.
            if (Date.now() - started >= ms) {
              resolve();
              return;
            }
            setTimeout(tick, Math.min(50, ms));
          };
          setTimeout(tick, Math.min(ms, 50));
        });

      const setText = (next: string) => {
        if (isCurrent()) setFauxText(next);
      };
      const setDemo = (next: boolean) => {
        if (isCurrent()) setIsDemo(next);
      };

      const backspace = async (from: string) => {
        for (let i = from.length; i >= 0; i -= 1) {
          if (!isCurrent()) return;
          setText(from.slice(0, i));
          await sleep(DELETE_MS);
        }
      };

      const typeOut = async (to: string) => {
        for (let i = 1; i <= to.length; i += 1) {
          if (!isCurrent()) return;
          setText(to.slice(0, i));
          await sleep(TYPE_MS);
        }
      };

      setDemo(false);
      setText(placeholder);

      while (isCurrent()) {
        await sleep(HOLD_DEFAULT_MS);
        if (!isCurrent()) break;

        await backspace(placeholder);
        if (!isCurrent()) break;
        await sleep(GAP_MS);
        if (!isCurrent()) break;

        const batch = pickPromptBatch(lastPromptRef.current, DEMO_QUESTIONS_PER_ROUND);
        lastPromptRef.current = batch[batch.length - 1] ?? lastPromptRef.current;

        for (let q = 0; q < batch.length; q += 1) {
          const prompt = batch[q]!;
          setDemo(true);
          await typeOut(prompt);
          if (!isCurrent()) break;

          await sleep(HOLD_DEMO_MS);
          if (!isCurrent()) break;

          await backspace(prompt);
          if (!isCurrent()) break;

          if (q < batch.length - 1) {
            await sleep(GAP_MS);
            if (!isCurrent()) break;
          }
        }
        if (!isCurrent()) break;

        setDemo(false);
        await sleep(GAP_MS);
        if (!isCurrent()) break;
        await typeOut(placeholder);
      }
    },
    [placeholder],
  );

  useEffect(() => {
    const shouldRun = animatePlaceholder && !hasText && !focused && pageVisible;

    if (!shouldRun) {
      runIdRef.current += 1;
      setFauxText(placeholder);
      setIsDemo(false);
      return;
    }

    const runId = ++runIdRef.current;
    void runTypewriter(() => runIdRef.current === runId);
    return () => {
      runIdRef.current += 1;
    };
  }, [animatePlaceholder, hasText, focused, pageVisible, placeholder, runTypewriter]);

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
            { color: isDemo ? colors.textTertiary : colors.textPrimary },
          ]}
          numberOfLines={1}
          pointerEvents="none"
        >
          {fauxText}
          {isDemo ? (
            <Text style={[styles.caret, { color: colors.textTertiary }]}>|</Text>
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
