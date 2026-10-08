import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import type { MainStackParamList } from '../../navigation/types';
import { requestLoginLink } from '../../services/auth/loginLinks';

export type AccountConvertNav = StackNavigationProp<MainStackParamList>;

export function useAccountConvertStyles() {
  const { colors } = useThemeMode();
  return { colors, styles: useMemo(() => createStyles(colors), [colors]) };
}

/** Page frame shared by Set a password / Connect Google. */
export function AccountConvertPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  const navigation = useNavigation<AccountConvertNav>();
  const { styles } = useAccountConvertStyles();
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <View style={styles.content}>
        <View style={styles.column}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'Account' })}
            style={styles.backRow}
            accessibilityRole="link"
          >
            <Text style={styles.backLink}>← Account</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.lead}>{lead}</Text>
          {children}
        </View>
      </View>
    </StorefrontChrome>
  );
}

/**
 * Accounts made at the email gate haven't proven they own the address yet. Confirm by
 * login link before adding another way in, so nobody can claim someone else's email.
 */
export function ConfirmEmailFirst({ email, next }: { email: string; next: string }) {
  const { styles } = useAccountConvertStyles();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestLoginLink({ email, next });
      setSent(true);
    } catch {
      setError('We couldn’t send the link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Text style={styles.success}>
        Check {email} for a link from Grapejuice. It brings you right back here.
      </Text>
    );
  }
  return (
    <>
      <Text style={styles.hint}>
        First, confirm this is your email. We’ll send a link to {email} that brings you back here.
      </Text>
      <GrapejuiceButton
        label="Continue"
        variant="filled"
        onPress={() => void send()}
        disabled={busy}
        loading={busy}
        style={styles.btn}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    content: {
      flex: 1,
      padding: spacing.lg,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
    },
    column: { width: '100%', maxWidth: 440 },
    backRow: { marginBottom: spacing.md },
    backLink: { ...typeface('medium'), color: colors.brand, fontSize: typography.md },
    title: { ...typeface('medium'), fontSize: 28, color: colors.textPrimary },
    lead: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      lineHeight: 22,
    },
    input: {
      ...typeface('regular'),
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: spacing.sm,
      fontSize: 15,
      lineHeight: 20,
      color: colors.textPrimary,
      backgroundColor: colors.bgPrimary,
    },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    btn: { alignSelf: 'stretch', marginTop: spacing.xs },
    error: {
      ...typeface('regular'),
      marginTop: spacing.md,
      fontSize: typography.md,
      color: colors.error,
      lineHeight: 22,
    },
    success: {
      ...typeface('regular'),
      marginTop: spacing.md,
      fontSize: typography.md,
      color: colors.textPrimary,
      lineHeight: 22,
    },
  });
}
