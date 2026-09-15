import React, { useEffect, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import {
  completePasswordReset,
  verifyPasswordReset,
} from '../../services/auth/auth';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

function readInputValue(
  e: NativeSyntheticEvent<TextInputChangeEventData> | { nativeEvent?: { text?: string }; target?: { value?: string } },
): string | null {
  const fromNative = e?.nativeEvent?.text;
  if (typeof fromNative === 'string') return fromNative;
  const fromTarget = (e as { target?: { value?: string } })?.target?.value;
  if (typeof fromTarget === 'string') return fromTarget;
  return null;
}

/**
 * Branded handler for Firebase password-reset email links.
 * Replaces the default Google/Firebase action page once Console action URL
 * points at `/auth/action`.
 */
export function ResetPasswordConfirmScreen() {
  const { colors } = useThemeMode();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPasswordConfirm'>>();
  const storeOob = useAuthFlowStore((s) => s.passwordResetOobCode);
  const clearPasswordReset = useAuthFlowStore((s) => s.clearPasswordReset);
  const clearError = useAuthStore((s) => s.clearError);

  const oobCode = route.params?.oobCode ?? storeOob ?? '';
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    clearError();
    let cancelled = false;
    (async () => {
      if (!oobCode) {
        setLinkError('This reset link is missing or incomplete. Request a new one from sign in.');
        setChecking(false);
        return;
      }
      try {
        const accountEmail = await verifyPasswordReset(oobCode);
        if (!cancelled) setEmail(accountEmail);
      } catch {
        if (!cancelled) {
          setLinkError('This reset link is invalid or has expired. Request a new one from sign in.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oobCode, clearError]);

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
  ];

  const onSubmit = async () => {
    setLocalError(null);
    if (password.length < 6) {
      setLocalError('Use a password with at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await completePasswordReset(oobCode, password);
      setDone(true);
      clearPasswordReset();
    } catch {
      setLocalError('Couldn’t update your password. Try requesting a new reset link.');
    } finally {
      setSaving(false);
    }
  };

  const goSignIn = () => {
    clearPasswordReset();
    navigation.navigate('SignInEmail', { email: email ?? undefined });
  };

  return (
    <AuthHeroShell modal={false}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {done ? 'Password updated' : 'Choose a new password'}
      </Text>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        {done
          ? 'You’re all set. Log in with your new password.'
          : checking
            ? 'Checking your reset link…'
            : linkError
              ? linkError
              : email
                ? `Create a new password for ${email}.`
                : 'Create a new password for your Grapejuice account.'}
      </Text>

      {!checking && !linkError && !done ? (
        <>
          <TextInput
            style={inputStyle}
            placeholder="New password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            onChange={(e) => {
              const v = readInputValue(e);
              if (v != null) setPassword(v);
            }}
          />
          <TextInput
            style={inputStyle}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            value={confirm}
            onChangeText={setConfirm}
            onChange={(e) => {
              const v = readInputValue(e);
              if (v != null) setConfirm(v);
            }}
            onSubmitEditing={() => void onSubmit()}
          />
          <GrapejuiceButton
            label="Save new password"
            variant="filled"
            onPress={() => void onSubmit()}
            disabled={saving}
            loading={saving}
            style={styles.btn}
          />
        </>
      ) : null}

      {(done || linkError) && !checking ? (
        <GrapejuiceButton
          label={done ? 'Log in' : 'Back to log in'}
          variant="filled"
          onPress={goSignIn}
          style={styles.btn}
        />
      ) : null}

      {localError ? (
        <Text style={[styles.error, { color: colors.error }]}>{localError}</Text>
      ) : null}
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typeface('medium'),
    fontSize: typography.xxl,
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  lead: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.sm,
    fontSize: 15,
    lineHeight: 20,
    ...typeface('regular'),
  },
  btn: { alignSelf: 'stretch', marginTop: spacing.xs },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
