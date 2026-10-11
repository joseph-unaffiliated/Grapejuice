import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { m, mType } from './mobileTheme';

type Props = {
  label: string;
  onPress?: () => void;
  /** primary: ink with gold text. secondary: outlined. link: text only. */
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
  busy?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** The one button style for the phone layouts: black with gold text; outlined for secondary actions. */
export function MobileButton({ label, onPress, variant = 'primary', disabled, busy, height = 52, style, accessibilityLabel }: Props) {
  const isPrimary = variant === 'primary';
  const isLink = variant === 'link';
  /** Tile-sized buttons are pills with smaller text; full-width ones are 10px-radius blocks. */
  const small = height <= 40;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        { height },
        small && { borderRadius: height / 2, paddingHorizontal: 12 },
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        isLink && styles.link,
        disabled && (isPrimary ? styles.primaryDisabled : styles.secondaryDisabled),
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? m.gold : m.ink} />
      ) : (
        <Text
          style={[
            mType.button,
            { fontSize: small ? 13.5 : height >= 50 ? 17 : 16 },
            isPrimary ? styles.primaryText : isLink ? styles.linkText : styles.secondaryText,
            disabled && styles.disabledText,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, width: '100%' },
  primary: { backgroundColor: m.ink },
  primaryText: { color: m.gold },
  secondary: { backgroundColor: m.white, borderWidth: 1, borderColor: m.gold },
  secondaryText: { color: m.ink },
  link: { height: 'auto', paddingVertical: 8, width: 'auto', alignSelf: 'flex-start', paddingHorizontal: 0 },
  linkText: { color: m.goldDark, fontSize: 14, textDecorationLine: 'underline' },
  primaryDisabled: { backgroundColor: m.line },
  secondaryDisabled: { borderColor: m.line },
  disabledText: { color: '#9CA3AF' },
  pressed: { opacity: 0.85 },
});
