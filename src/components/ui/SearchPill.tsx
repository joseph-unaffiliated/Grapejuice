import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  AppState,
  Pressable,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import {
  borderRadius,
  LAYOUT,
  MOBILE_GUTTER,
  shadows,
  shadowsWeb,
  typography,
  typeface,
} from '../../constants/theme';
import { RAV_TYPEWRITER_PROMPTS } from '../../constants/ravStarterPrompts';
import { useThemeMode } from '../../context/ThemeContext';

const LINE_DESKTOP = typography.lg;
/** iOS Safari zooms inputs under 16px — typed input stays at 16 on mobile. */
const INPUT_MOBILE = 16;
/** Rotating prompt / demo suggestions can read smaller than the input. */
const FAUX_MOBILE = typography.lg; // 13
/** Multiline input line-height ≈ 1.4× font (13→18, 16→22). */
const INPUT_LINE_HEIGHT_RATIO = 1.4;
/** Web class for thin gold scrollbar on the multiline textarea. */
const SEARCH_PILL_INPUT_CLASS = 'gj-search-pill-input';
/** Figma 366:1762 — 37px pill height */
export const SEARCH_PILL_HEIGHT = 37;
/** ~3–4 lines; input scrolls inside once content exceeds this. */
const SEARCH_PILL_MAX_HEIGHT = 120;

const DEFAULT_PLACEHOLDER = 'Search or ask a question';
const TYPE_MS = 48;
const DELETE_MS = 28;
/** Resting hold on the real placeholder between demo rounds. */
const HOLD_DEFAULT_MS = 5500;
/** Hold on each typed example question before the next one. */
const HOLD_DEMO_MS = 4200;
const GAP_MS = 400;
const DEMO_QUESTIONS_PER_ROUND = 3;
/** Demo example opacity vs the default prompt. */
const DEMO_OPACITY = 0.3;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyPress?: (e: {
    nativeEvent?: { key?: string };
    key?: string;
    shiftKey?: boolean;
    preventDefault?: () => void;
  }) => void;
  placeholder?: string;
  returnKeyType?: 'search' | 'done' | 'default';
  /** Cycle Rav-style prompt typewriter when empty. Default true. */
  animatePlaceholder?: boolean;
  /** Override the rotating demo prompts (defaults to Hanukkah Rav prompts). */
  prompts?: readonly string[];
  /** Optional accessibility label for the input. */
  accessibilityLabel?: string;
  /** Force text alignment (default: centered idle, left when typing). */
  textAlign?: 'left' | 'center';
  /** Optional control on the left (e.g. search icon). */
  leading?: ReactNode;
  /** Extra left inset when `leading` is set. Default 28. */
  leadingWidth?: number;
  /** Optional control on the right (e.g. Rav send). Reserves padding so text doesn’t collide. */
  trailing?: ReactNode;
  /** Extra right inset when `trailing` is set. Default 40. */
  trailingWidth?: number;
  /**
   * Right padding for an external control (send overlay outside this component).
   * Prefer this over mounting/unmounting `trailing` on focus — remounts can steal web focus.
   */
  contentInsetRight?: number;
};

function pickPromptBatch(
  previous: string,
  count: number,
  prompts: readonly string[]
): string[] {
  const source = prompts.length > 0 ? prompts : RAV_TYPEWRITER_PROMPTS;
  const batch: string[] = [];
  let last = previous;
  for (let i = 0; i < count; i += 1) {
    const pool = source.filter((p) => p !== last && !batch.includes(p));
    const list = pool.length > 0 ? pool : source.filter((p) => !batch.includes(p));
    const fallback = source.filter((p) => p !== last);
    const choices = list.length > 0 ? list : fallback.length > 0 ? fallback : source;
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
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  onKeyPress: onKeyPressProp,
  placeholder = DEFAULT_PLACEHOLDER,
  returnKeyType = 'search',
  animatePlaceholder = true,
  prompts = RAV_TYPEWRITER_PROMPTS,
  accessibilityLabel = 'Search',
  textAlign,
  leading = null,
  leadingWidth = 28,
  trailing = null,
  trailingWidth = 40,
  contentInsetRight = 0,
}: Props) {
  const { colors } = useThemeMode();
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;
  const inputSize = compact ? INPUT_MOBILE : LINE_DESKTOP;
  const fauxSize = compact ? FAUX_MOBILE : LINE_DESKTOP;
  /** Readable multiline leading; collapsed single-line keeps inputSize for the 37px pill. */
  const textLineHeight = Math.round(inputSize * INPUT_LINE_HEIGHT_RATIO);
  const hasText = value.trim().length > 0;
  /** Grow when there is typed content; empty / faux typewriter stays single-line. */
  const expanded = hasText;
  /**
   * Always multiline so the underlying node never swaps (input ↔ textarea).
   * Flipping `multiline` remounts on RN Web and steals focus after the first character.
   */
  const multiline = true;
  const [focused, setFocused] = useState(false);
  const [fauxText, setFauxText] = useState(placeholder);
  /** True while showing a rotating example (not the default prompt). */
  const [isDemo, setIsDemo] = useState(false);
  /** Browser tab / app foreground — background timers burst on resume and scramble the loop. */
  const [pageVisible, setPageVisible] = useState(readPageVisible);
  const [inputHeight, setInputHeight] = useState(textLineHeight);
  const lastPromptRef = useRef('');
  /** Full current example prompt (for click-to-prefill). */
  const currentDemoRef = useRef<string | null>(null);
  const isDemoRef = useRef(false);
  /** Monotonic run id — stale async loops bailed even if a newer run already started. */
  const runIdRef = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const promptList = prompts.length > 0 ? prompts : RAV_TYPEWRITER_PROMPTS;
  const verticalPad = Math.max(0, (SEARCH_PILL_HEIGHT - textLineHeight) / 2);
  const inputMaxHeight = SEARCH_PILL_MAX_HEIGHT - verticalPad * 2;
  const showLeading = leading != null;
  const showTrailing = trailing != null;
  const leftInset = showLeading ? leadingWidth : 0;
  const rightInset = showTrailing ? trailingWidth : contentInsetRight;
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

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
      const setDemo = (next: boolean, fullPrompt: string | null = null) => {
        if (!isCurrent()) return;
        isDemoRef.current = next;
        currentDemoRef.current = next ? fullPrompt : null;
        setIsDemo(next);
      };

      setDemo(false);
      setText(placeholder);

      while (isCurrent()) {
        await sleep(HOLD_DEFAULT_MS);
        if (!isCurrent()) break;

        await backspace(placeholder, setText, sleep, isCurrent);
        if (!isCurrent()) break;
        await sleep(GAP_MS);
        if (!isCurrent()) break;

        const batch = pickPromptBatch(
          lastPromptRef.current,
          DEMO_QUESTIONS_PER_ROUND,
          promptList
        );
        lastPromptRef.current = batch[batch.length - 1] ?? lastPromptRef.current;

        for (let q = 0; q < batch.length; q += 1) {
          const prompt = batch[q]!;
          setDemo(true, prompt);
          await typeOut(prompt, setText, sleep, isCurrent);
          if (!isCurrent()) break;

          await sleep(HOLD_DEMO_MS);
          if (!isCurrent()) break;

          await backspace(prompt, setText, sleep, isCurrent);
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
        await typeOut(placeholder, setText, sleep, isCurrent);
      }
    },
    [placeholder, promptList],
  );

  useEffect(() => {
    const shouldRun = animatePlaceholder && !hasText && !focused && pageVisible;

    if (!shouldRun) {
      runIdRef.current += 1;
      setFauxText(placeholder);
      isDemoRef.current = false;
      currentDemoRef.current = null;
      setIsDemo(false);
      return;
    }

    currentDemoRef.current = null;
    const runId = ++runIdRef.current;
    void runTypewriter(() => runIdRef.current === runId);
    return () => {
      runIdRef.current += 1;
    };
  }, [animatePlaceholder, hasText, focused, pageVisible, placeholder, runTypewriter]);

  useEffect(() => {
    if (!expanded) setInputHeight(textLineHeight);
  }, [expanded, textLineHeight]);

  const onFocus = () => {
    setFocused(true);
    currentDemoRef.current = null;
    isDemoRef.current = false;
    onFocusProp?.();
  };

  /** Web: Enter submits, Shift+Enter inserts a newline.
   * RN Web only submits Enter when `!multiline || blurOnSubmit`; use onKeyPress + preventDefault. */
  const handleKeyPress = useCallback(
    (e: {
      nativeEvent?: { key?: string };
      key?: string;
      shiftKey?: boolean;
      preventDefault?: () => void;
    }) => {
      onKeyPressProp?.(e);
      if (Platform.OS !== 'web') return;
      const key = e.key ?? e.nativeEvent?.key;
      if (key !== 'Enter' || e.shiftKey) return;
      e.preventDefault?.();
      onSubmitEditing?.();
    },
    [onKeyPressProp, onSubmitEditing],
  );

  const onContentSizeChange = useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      if (!expanded) return;
      const next = e.nativeEvent.contentSize.height;
      setInputHeight(Math.min(Math.max(next, textLineHeight), inputMaxHeight));
    },
    [expanded, textLineHeight, inputMaxHeight],
  );

  const showFaux = animatePlaceholder && !hasText && !focused;
  // Idle placeholder centered unless caller forces left (catalog search).
  const alignLeft = textAlign === 'left' || (textAlign !== 'center' && (hasText || focused));
  const pillStyle = [
    styles.pill,
    expanded ? styles.pillExpanded : styles.pillCollapsed,
    expanded ? { paddingVertical: verticalPad } : null,
    { backgroundColor: colors.bgPrimary },
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm, cursor: 'text' } : shadows.goldGlow,
  ];

  return (
    <Pressable
      accessibilityRole="search"
      onPress={focusInput}
      style={pillStyle}
    >
      {showLeading ? (
        <View style={[styles.leading, { width: leadingWidth }]} pointerEvents="none">
          {leading}
        </View>
      ) : null}
      {showFaux ? (
        <Text
          style={[
            styles.fauxBase,
            styles.fauxType,
            {
              fontSize: fauxSize,
              lineHeight: SEARCH_PILL_HEIGHT,
              color: colors.textPrimary,
              opacity: isDemo ? DEMO_OPACITY : 1,
            },
            alignLeft ? styles.fauxLeft : null,
            leftInset > 0 ? { paddingLeft: MOBILE_GUTTER + leftInset } : null,
            rightInset > 0 ? { paddingRight: MOBILE_GUTTER + rightInset } : null,
          ]}
          numberOfLines={1}
          pointerEvents="none"
        >
          {fauxText}
          {isDemo ? (
            <Text
              style={[
                styles.caret,
                { fontSize: fauxSize, color: colors.textPrimary, opacity: 1 },
              ]}
            >
              |
            </Text>
          ) : null}
        </Text>
      ) : null}
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            fontSize: inputSize,
            lineHeight: expanded ? textLineHeight : inputSize,
            height: expanded ? inputHeight : inputSize,
            maxHeight: inputMaxHeight,
          },
          alignLeft ? styles.inputActive : styles.inputCentered,
          leftInset > 0 ? { paddingLeft: leftInset } : null,
          rightInset > 0 ? { paddingRight: rightInset } : null,
          showFaux && styles.inputOverFaux,
          expanded && Platform.OS !== 'web' ? styles.inputMultilineNative : null,
        ]}
        placeholder={!animatePlaceholder && !focused && !hasText ? placeholder : ''}
        placeholderTextColor={colors.textPrimary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={() => {
          currentDemoRef.current = null;
          setFocused(false);
          onBlurProp?.();
        }}
        onContentSizeChange={onContentSizeChange}
        onKeyPress={handleKeyPress}
        returnKeyType={returnKeyType}
        multiline={multiline}
        // Native: Enter submits. Web: handled in onKeyPress (Shift+Enter = newline).
        blurOnSubmit={Platform.OS !== 'web'}
        scrollEnabled={expanded}
        accessibilityLabel={accessibilityLabel}
        {...(Platform.OS === 'web'
          ? ({
              className: SEARCH_PILL_INPUT_CLASS,
              rows: 1,
            } as object)
          : null)}
      />
      {showTrailing ? (
        <View style={styles.trailing} pointerEvents="box-none">
          {trailing}
        </View>
      ) : null}
    </Pressable>
  );
}

async function backspace(
  from: string,
  setText: (next: string) => void,
  sleep: (ms: number) => Promise<void>,
  isCurrent: () => boolean
) {
  for (let i = from.length; i >= 0; i -= 1) {
    if (!isCurrent()) return;
    setText(from.slice(0, i));
    await sleep(DELETE_MS);
  }
}

async function typeOut(
  to: string,
  setText: (next: string) => void,
  sleep: (ms: number) => Promise<void>,
  isCurrent: () => boolean
) {
  for (let i = 1; i <= to.length; i += 1) {
    if (!isCurrent()) return;
    setText(to.slice(0, i));
    await sleep(TYPE_MS);
  }
}

const styles = StyleSheet.create({
  pill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.pill,
    paddingHorizontal: MOBILE_GUTTER,
    position: 'relative',
  },
  pillCollapsed: {
    height: SEARCH_PILL_HEIGHT,
  },
  pillExpanded: {
    minHeight: SEARCH_PILL_HEIGHT,
    alignItems: 'flex-start',
  },
  fauxBase: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
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
  fauxType: {
    fontStyle: 'normal',
    ...typeface('regular'),
  },
  caret: {
    fontStyle: 'normal',
    ...typeface('regular'),
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    margin: 0,
    letterSpacing: -0.26,
    ...typeface('regular'),
    zIndex: 2,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          border: 'none',
          backgroundColor: 'transparent',
          resize: 'none',
          overflowY: 'auto',
          cursor: 'text',
        } as object)
      : { includeFontPadding: false, textAlignVertical: 'center' }),
  },
  inputMultilineNative: {
    textAlignVertical: 'top',
  },
  inputOverFaux: {
    color: 'transparent',
    ...(Platform.OS === 'web' ? ({ caretColor: 'transparent' } as object) : null),
  },
  inputCentered: { textAlign: 'center' },
  inputActive: { textAlign: 'left' },
  fauxLeft: {
    textAlign: 'left',
    ...(Platform.OS === 'web'
      ? ({
          justifyContent: 'flex-start',
        } as object)
      : null),
  },
  leading: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    zIndex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailing: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    zIndex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
