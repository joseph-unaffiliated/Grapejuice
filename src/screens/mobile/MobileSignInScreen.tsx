import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { MobileCodeSignIn } from '../../components/mobile/MobileCodeSignIn';
import { m, mFont } from '../../components/mobile/mobileTheme';

/**
 * Phone sign-in and sign-up: one screen. Email me a code first, then password, then
 * Google (hidden inside Instagram / Facebook). Replaces SignIn, SignInEmail, SignUp and
 * SignUpEmail in AuthStack.
 */
export function MobileSignInScreen() {
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const clearPending = useAuthFlowStore((s) => s.clearPending);
  const claimGift = pendingReturn === 'GiftClaim';

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <TaskHeader back={{ label: 'Back', onPress: clearPending }} title="Sign in" />
      <MobileCodeSignIn
        title={claimGift ? 'Sign in to claim your gift' : 'Sign in'}
        lead={claimGift ? 'Use the email the gift was sent to.' : 'Enter the email you used for your box.'}
        alternatives={{ googleReturnTo: pendingReturn === 'Stay' ? 'Stay' : null }}
        footer={claimGift ? null : <Text style={styles.alt}>New here? Same thing: your account is made when you enter the code.</Text>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  alt: { fontSize: 13.5, lineHeight: 21, color: m.muted, textAlign: 'center', marginTop: 16, ...mFont(400) },
});
