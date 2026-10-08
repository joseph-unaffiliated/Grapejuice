import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { setPasswordForCurrentUser } from '../../services/auth/auth';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { SET_PASSWORD_PATH } from '../../navigation/loginLink';
import {
  AccountConvertPage,
  ConfirmEmailFirst,
  useAccountConvertStyles,
  type AccountConvertNav,
} from './accountConvertShared';

function errorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** `/account/set-password` — add an email password to a login-link (or Google-only) account. */
export function SetPasswordScreen() {
  const navigation = useNavigation<AccountConvertNav>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { colors, styles } = useAccountConvertStyles();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [needsFreshLink, setNeedsFreshLink] = useState(false);

  const replacing = !!user?.hasPasswordProvider;
  const title = replacing ? 'Change your password' : 'Set a password';

  if (!user?.email) {
    return (
      <AccountConvertPage title={title} lead="Log in to set a password for your account.">
        {null}
      </AccountConvertPage>
    );
  }

  if (!user.emailVerified || needsFreshLink) {
    return (
      <AccountConvertPage
        title={title}
        lead={`Then you can log in to ${user.email} with a password instead of an emailed link.`}
      >
        <ConfirmEmailFirst email={user.email} next={SET_PASSWORD_PATH} />
      </AccountConvertPage>
    );
  }

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      setUser(await setPasswordForCurrentUser(password));
      setDone(true);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'auth/requires-recent-login') setNeedsFreshLink(true);
      else if (code === 'auth/weak-password') setError('Pick a stronger password.');
      else setError('We couldn’t save that password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AccountConvertPage
        title="Password saved"
        lead={`Next time, log in with ${user.email} and your new password.`}
      >
        <GrapejuiceButton
          label="Continue"
          variant="filled"
          onPress={() => navigation.navigate('MyBox')}
          style={styles.btn}
        />
      </AccountConvertPage>
    );
  }

  return (
    <AccountConvertPage
      title={title}
      lead={
        replacing
          ? `Choose a new password for ${user.email}.`
          : `Log in to ${user.email} with a password instead of an emailed link.`
      }
    >
      <View>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          editable={!busy}
          onSubmitEditing={() => void onSubmit()}
        />
        <GrapejuiceButton
          label="Continue"
          variant="filled"
          onPress={() => void onSubmit()}
          disabled={busy}
          loading={busy}
          style={styles.btn}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </AccountConvertPage>
  );
}
