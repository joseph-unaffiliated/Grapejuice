import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GrapejuiceButton } from '../ui/GrapejuiceButton';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { isSocialInAppBrowser, openInSystemBrowser, systemBrowserName } from '../../utils/inAppBrowser';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
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
  return (
    <View style={[styles.wrap, style]}>
      <GrapejuiceButton
        label={`${label} in ${browser}`}
        variant="pill"
        onPress={() => {
          openInSystemBrowser();
          // Still here after the hand-off attempt: the app blocked it.
          if (helpTimer.current) clearTimeout(helpTimer.current);
          helpTimer.current = setTimeout(() => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') setShowHelp(true);
          }, 1500);
        }}
        disabled={disabled}
      />
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
  help: {
    ...typeface('regular'),
    marginTop: spacing.xs,
    fontSize: typography.sm,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
});
