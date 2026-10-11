import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { MobileCodeSignIn } from '../../components/mobile/MobileCodeSignIn';
import { m, mType } from '../../components/mobile/mobileTheme';

/**
 * Phone sign-in and sign-up: one screen, email → 6-digit code. Google stays as a
 * secondary option. Replaces SignIn, SignInEmail, SignUp and SignUpEmail in AuthStack.
 */
export function MobileSignInScreen() {
  const { googleSignIn, error, clearError } = useAuthStore();
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const clearPending = useAuthFlowStore((s) => s.clearPending);
  const [busy, setBusy] = useState(false);
  const claimGift = pendingReturn === 'GiftClaim';

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <TaskHeader back={{ label: 'Back', onPress: clearPending }} title="Grapejuice" />
      <MobileCodeSignIn
        title={claimGift ? 'Sign in to claim your gift' : 'Sign in or sign up'}
        lead={
          claimGift
            ? "Use the email the gift was sent to. We'll send a 6-digit code."
            : "Enter your email and we'll send a 6-digit code. No password needed. New here? Same thing: your account is made when you enter the code."
        }
        footer={
          <View style={{ marginTop: 28, gap: 12 }}>
            <Text style={[mType.small, { textAlign: 'center' }]}>or</Text>
            <GoogleAuthButton
              onPress={async () => {
                clearError();
                setBusy(true);
                try {
                  await googleSignIn(pendingReturn === 'Stay' ? 'Stay' : undefined);
                } catch {
                  /* store */
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              loading={busy}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  error: { ...mType.small, color: m.warn, textAlign: 'center' },
});
