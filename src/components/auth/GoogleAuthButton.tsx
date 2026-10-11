import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GrapejuiceButton } from '../ui/GrapejuiceButton';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { isSocialInAppBrowser, openInSystemBrowser, systemBrowserName } from '../../utils/inAppBrowser';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
  /** Phone layouts: the 50px outlined block with the G mark, not the desktop pill. */
  appearance?: 'pill' | 'mobile';
};

/**
 * "Continue with Google", except inside Instagram / Facebook, where Google refuses to sign in.
 * There it reopens this page in the system browser instead, with manual steps if the app blocks that.
 */
export function GoogleAuthButton({
  onPress,
  disabled,
  loading,
  style,
  label = 'Continue with Google',
  appearance = 'pill',
}: Props) {
  const [inApp] = useState(isSocialInAppBrowser);
  const [showHelp, setShowHelp] = useState(false);
  const helpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (helpTimer.current) clearTimeout(helpTimer.current);
    },
    []
  );

  if (!inApp && appearance === 'mobile') {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={label} style={[styles.mobile, style]}>
        {loading ? <ActivityIndicator color="#111827" /> : (
          <>
            <Text style={styles.mobileG}>G</Text>
            <Text style={styles.mobileText}>{label}</Text>
          </>
        )}
      </Pressable>
    );
  }

  if (!inApp) {
    return (
      <GrapejuiceButton
        label={label}
        variant="pill"
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        style={style}
      />
    );
  }

  const browser = systemBrowserName();
  const handOff = () => {
    openInSystemBrowser();
    // Still here after the hand-off attempt: the app blocked it.
    if (helpTimer.current) clearTimeout(helpTimer.current);
    helpTimer.current = setTimeout(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') setShowHelp(true);
    }, 1500);
  };
  return (
    <View style={[styles.wrap, style]}>
      {appearance === 'mobile' ? (
        <Pressable onPress={handOff} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label} in ${browser}`} style={styles.mobile}>
          <Text style={styles.mobileG}>G</Text>
          <Text style={styles.mobileText}>{`${label} in ${browser}`}</Text>
        </Pressable>
      ) : (
        <GrapejuiceButton label={`${label} in ${browser}`} variant="pill" onPress={handOff} disabled={disabled} />
      )}
      {showHelp ? (
        <Text style={styles.help}>
          {`Google sign-in doesn’t work inside this app. Tap ••• at the top and choose “Open in ${
            browser === 'Safari' ? 'external browser' : 'browser'
          }”, or use your email instead.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%' },
  mobile: { width: '100%', height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  mobileG: { fontSize: 17, color: '#4285F4', ...typeface('bold') },
  mobileText: { fontSize: 15.5, color: '#111827', ...typeface('regular') },
  help: {
    ...typeface('regular'),
    marginTop: spacing.xs,
    fontSize: typography.sm,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
});
