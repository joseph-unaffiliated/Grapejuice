import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import {
  borderRadius,
  MOBILE_GUTTER,
  shadows,
  shadowsWeb,
  spacing,
  typography,
  typeface,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

const LINE = typography.lg;
/** Figma 366:1762 — 37px pill height */
export const SEARCH_PILL_HEIGHT = 37;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  returnKeyType?: 'search' | 'done' | 'default';
};

export function SearchPill({
  value,
  onChangeText,
  onSubmitEditing,
  placeholder = 'Search or ask a question',
  returnKeyType = 'search',
}: Props) {
  const { colors } = useThemeMode();
  const hasText = value.trim().length > 0;
  const pillStyle = [
    styles.pill,
    { backgroundColor: colors.bgPrimary },
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm } : shadows.goldGlow,
  ];

  return (
    <View style={pillStyle}>
      <TextInput
        style={[
          styles.input,
          { color: colors.textPrimary },
          !hasText && styles.inputCentered,
          hasText && styles.inputActive,
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.textPrimary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        multiline={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: '100%',
    height: SEARCH_PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.pill,
    paddingHorizontal: MOBILE_GUTTER,
  },
  input: {
    flex: 1,
    fontSize: LINE,
    lineHeight: LINE,
    height: LINE,
    padding: 0,
    margin: 0,
    letterSpacing: -0.26,
    ...typeface('regular'),
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', border: 'none', backgroundColor: 'transparent' } as object)
      : { includeFontPadding: false, textAlignVertical: 'center' }),
  },
  inputCentered: { textAlign: 'center' },
  inputActive: { textAlign: 'left' },
});
