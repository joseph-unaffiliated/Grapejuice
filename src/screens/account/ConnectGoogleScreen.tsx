import React, { useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { connectGoogleToCurrentUser } from '../../services/auth/auth';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { CONNECT_GOOGLE_PATH } from '../../navigation/loginLink';
import {
  AccountConvertPage,
  ConfirmEmailFirst,
  useAccountConvertStyles,
  type AccountConvertNav,
} from './accountConvertShared';

function errorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** `/account/connect-google` — link Google sign-in to the current account. */
export function ConnectGoogleScreen() {
  const navigation = useNavigation<AccountConvertNav>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { styles } = useAccountConvertStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFreshLink, setNeedsFreshLink] = useState(false);

  if (!user?.email) {
    return (
      <AccountConvertPage title="Log in with Google" lead="Log in to connect Google to your account.">
        {null}
      </AccountConvertPage>
    );
  }

  if (user.hasGoogleProvider) {
    return (
      <AccountConvertPage
        title="Google is connected"
        lead="You can log in to Grapejuice with your Google account."
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

  if (!user.emailVerified || needsFreshLink) {
    return (
      <AccountConvertPage
        title="Log in with Google"
        lead={`Then you can log in to ${user.email} with Google instead of an emailed link.`}
      >
        <ConfirmEmailFirst email={user.email} next={CONNECT_GOOGLE_PATH} />
      </AccountConvertPage>
    );
  }

  const onConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      setUser(await connectGoogleToCurrentUser());
    } catch (err) {
      const code = errorCode(err);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        /* user closed the popup */
      } else if (code === 'auth/credential-already-in-use') {
        setError(
          'That Google account already has its own Grapejuice login. Log out, then use “Continue with Google” to open it, or pick a different Google account here.'
        );
      } else if (code === 'auth/requires-recent-login') {
        setNeedsFreshLink(true);
      } else if (code === 'auth/provider-already-linked') {
        setError('Google is already connected to this account.');
      } else {
        setError(err instanceof Error ? err.message : 'We couldn’t connect Google. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountConvertPage
      title="Log in with Google"
      lead={`Connect a Google account so you can log in to ${user.email} with one click.`}
    >
      <GrapejuiceButton
        label="Continue with Google"
        variant="pill"
        onPress={() => void onConnect()}
        disabled={busy}
        loading={busy}
        style={styles.btn}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AccountConvertPage>
  );
}
