import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { m, mFont } from './mobileTheme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string | null;
  error?: string | null;
  /** Taller box for notes. */
  area?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The mockups' field: muted label, 50px box with a gold edge (soft once filled, dark while typing). */
export const MobileField = forwardRef<TextInput, Props>(function MobileField({ label, hint, error, area, style, onFocus, onBlur, value, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  const filled = typeof value === 'string' && value.length > 0;
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        value={value}
        placeholderTextColor="#9CA3AF"
        accessibilityLabel={input.accessibilityLabel ?? label}
        multiline={area}
        textAlignVertical={area ? 'top' : 'center'}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, area && styles.area, filled && !focused && styles.done, focused && styles.focus, error ? styles.errorBox : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12.5, color: m.muted, marginBottom: 6, ...mFont(400) },
  input: { height: 50, borderWidth: 1, borderColor: m.gold, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: m.ink, backgroundColor: m.white, ...mFont(400) },
  area: { height: 96, paddingTop: 14, lineHeight: 23 },
  done: { borderColor: m.lineWarm },
  focus: { borderWidth: 2, borderColor: m.goldDark, paddingHorizontal: 13 },
  errorBox: { borderColor: m.warn },
  hint: { fontSize: 12.5, color: m.muted, marginTop: 6, lineHeight: 17, ...mFont(400) },
  error: { fontSize: 12.5, color: m.warn, marginTop: 6, lineHeight: 17, ...mFont(400) },
});
