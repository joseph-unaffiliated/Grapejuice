import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, ScrollView } from 'react-native';
import { OnboardingPrimaryButton } from '../../components/onboarding/OnboardingButtons';
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <Text style={[styles.title, isDesktopWeb && styles.titleDesktop]}>
          {'Enter your email\nto reveal your box'}
        </Text>
        <TextInput
          style={styles.input}
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
        <OnboardingPrimaryButton
          label="Continue"
          onPress={() => void submit()}
          loading={submitting}
          style={styles.button}
        />
        <Text style={styles.legal}>
          By clicking “Continue” you are agreeing to Grapejuice’s{' '}
          <Text style={styles.legalLink} onPress={() => openLegal(TERMS_PATH)} accessibilityRole="link">
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => openLegal(PRIVACY_PATH)} accessibilityRole="link">
            Privacy Policy
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0, backgroundColor: semanticColors.bgPrimary },
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
