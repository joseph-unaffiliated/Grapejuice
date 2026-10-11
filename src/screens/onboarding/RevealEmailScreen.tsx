import React, { useMemo, useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useCatalog } from '../../hooks/useCatalog';
import { coalesceLinesByItemId } from '../../components/box/boxLineDisplay';
import { BoxSummary, type BoxThumb } from '../../components/mobile/BoxSummary';
import { primaryPhoto, SAMPLE_BOX_IDS } from '../../components/mobile/catalogPhotos';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import { View, Text, TextInput, StyleSheet, Platform, ScrollView } from 'react-native';
import { OnboardingPrimaryButton } from '../../components/onboarding/OnboardingButtons';
import { MobileButton } from '../../components/mobile/MobileButton';
import { m, mFont, mGutter } from '../../components/mobile/mobileTheme';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useWebLayout } from '../../hooks/useWebLayout';
import { isValidEmail } from '../../utils/formValidation';
import { PRIVACY_PATH, TERMS_PATH } from '../../navigation/contentLink';
import {
  semanticColors,
  spacing,
  typography,
  borderRadius,
  typeface,
  MOBILE_GUTTER,
} from '../../constants/theme';

type Props = {
  initialEmail?: string;
  /** Resolves when the box can be shown; throws with a user-facing message otherwise. */
  onSubmit: (email: string) => Promise<void>;
};

/** Legal pages open in a new tab so the builder (and the box behind this gate) stays put. */
function openLegal(path: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(path, '_blank', 'noopener');
  }
}

export function RevealEmailScreen({ initialEmail = '', onSubmit }: Props) {
  const { tier } = useWebLayout();
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const mobileLayout = useMobileLayout();
  const { lineItems, children } = useBoxDraft();
  const startAuthInPlace = useAuthFlowStore((s) => s.startAuthInPlace);
  const { items: catalog } = useCatalog();
  const revealThumbs = useMemo((): BoxThumb[] => {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const rows = coalesceLinesByItemId(lineItems);
    const ids = rows.length ? rows.map((r) => r.itemId) : SAMPLE_BOX_IDS;
    const shown = ids.slice(0, 6);
    const hidden = Math.max(0, ids.length - 6);
    return shown.map((id, i) => ({ id, imageUrl: primaryPhoto(byId.get(id)), blur: i > 2, label: i === 5 && hidden > 0 ? `+${hidden}` : undefined }));
  }, [lineItems, catalog]);
  const kidCount = Math.max(1, new Set(lineItems.map((l) => l.childId).filter(Boolean)).size);
  const kidNames = children.map((c) => c.name?.trim()).filter((n): n is string => Boolean(n));
  const forKids =
    kidNames.length === 1 ? kidNames[0] : kidNames.length === 2 ? `${kidNames[0]} and ${kidNames[1]}` : 'each kid';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, mobileLayout && styles.contentMobile]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        {mobileLayout ? (
          <>
            <Text style={[styles.title, styles.titleMobile]}>Your box is ready</Text>
            <View style={{ width: '100%', marginTop: 20, marginBottom: 24 }}>
              <BoxSummary
                total={formatCatalogDollars(listBoxCentsForKids(kidCount))}
                items={revealThumbs}
              >
                <Text style={styles.gateLine}>Candles, dreidels, gelt, latke and sufganiyot kits, and a book and a present for {forKids}.</Text>
              </BoxSummary>
            </View>
          </>
        ) : (
          <Text style={[styles.title, isDesktopWeb && styles.titleDesktop]}>
            {'Enter your email\nto reveal your box'}
          </Text>
        )}
        <TextInput
          style={[styles.input, mobileLayout && styles.inputMobile]}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (error) setError(null);
          }}
          placeholder="Email"
          placeholderTextColor={semanticColors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!submitting}
          accessibilityLabel="Email"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {mobileLayout ? (
          <>
            <MobileButton label="Show my box" onPress={() => void submit()} busy={submitting} style={{ alignSelf: 'stretch', marginTop: 12 }} />
            <Text style={[styles.legal, styles.legalMobile]}>We'll email you a link to your box, so you can open it later in any browser. No password needed.</Text>
            <Text style={[styles.legal, styles.legalMobile, { marginTop: 6 }]}>
              By continuing you agree to Grapejuice’s{' '}
              <Text style={styles.legalLink} onPress={() => openLegal(TERMS_PATH)} accessibilityRole="link">Terms</Text> and{' '}
              <Text style={styles.legalLink} onPress={() => openLegal(PRIVACY_PATH)} accessibilityRole="link">Privacy Policy</Text>.
            </Text>
            <Text style={[styles.legal, styles.legalMobile, { marginTop: 12 }]}>
              Already have an account?{' '}
              <Text style={[styles.legalLink, { color: m.goldDark }]} onPress={() => startAuthInPlace('signin', 'SignInEmail')} accessibilityRole="link">Log in</Text>
            </Text>
          </>
        ) : (
          <OnboardingPrimaryButton label="Continue" onPress={() => void submit()} loading={submitting} style={styles.button} />
        )}
        {mobileLayout ? null : <Text style={styles.legal}>
          By clicking “Continue” you are agreeing to Grapejuice’s{' '}
          <Text style={styles.legalLink} onPress={() => openLegal(TERMS_PATH)} accessibilityRole="link">
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => openLegal(PRIVACY_PATH)} accessibilityRole="link">
            Privacy Policy
          </Text>
        </Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0, backgroundColor: semanticColors.bgPrimary },
  contentMobile: { justifyContent: 'flex-start', paddingTop: 28, paddingHorizontal: mGutter },
  inputMobile: { textAlign: 'left', height: 52, borderRadius: 14, borderWidth: 1, borderColor: m.gold, paddingHorizontal: 14 },
  legalMobile: { maxWidth: 320, fontSize: 12.5, lineHeight: 18, color: m.muted, ...mFont(300) },
  titleMobile: { fontSize: 29, lineHeight: 33, letterSpacing: -0.8, textAlign: 'left', alignSelf: 'stretch', marginBottom: 0 },
  gateLine: { fontSize: 14, color: '#374151', lineHeight: 20 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: MOBILE_GUTTER + 8,
    paddingVertical: spacing.xxl,
  },
  column: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  title: {
    ...typeface('regular'),
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.72,
    color: '#000000',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  titleDesktop: {
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.95,
  },
  input: {
    ...typeface('regular'),
    alignSelf: 'stretch',
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    /** Under 16px, iOS Safari zooms the page on focus. */
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: semanticColors.error,
    lineHeight: 18,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 300,
  },
  legal: {
    ...typeface('light'),
    marginTop: spacing.md,
    maxWidth: 300,
    fontSize: typography.sm,
    lineHeight: 17,
    color: semanticColors.textTertiary,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  legalLink: {
    textDecorationLine: 'underline',
    color: semanticColors.textTertiary,
  },
});
