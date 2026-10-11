import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { MobileCodeSignIn } from '../../components/mobile/MobileCodeSignIn';
import { m, mFont, mType } from '../../components/mobile/mobileTheme';

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
      <TaskHeader back={{ label: 'Back', onPress: clearPending }} title="Sign in" />
      <MobileCodeSignIn
        title={claimGift ? 'Sign in to claim your gift' : 'Sign in'}
        lead={claimGift ? "Use the email the gift was sent to. We'll send a 6-digit code." : "We'll email you a 6-digit code. No password needed."}
        footer={
          <View>
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.or}>or</Text>
              <View style={styles.rule} />
            </View>
            <GoogleAuthButton
              appearance="mobile"
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
            {claimGift ? null : <Text style={styles.alt}>New here? Same thing: your account is made when you enter the code.</Text>}
          </View>
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  error: { ...mType.small, color: m.warn, textAlign: 'center', marginTop: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  rule: { flex: 1, height: 1, backgroundColor: m.line },
  or: { fontSize: 13, color: m.muted, ...mFont(400) },
  alt: { fontSize: 13.5, lineHeight: 21, color: m.muted, textAlign: 'center', marginTop: 16, ...mFont(400) },
});
