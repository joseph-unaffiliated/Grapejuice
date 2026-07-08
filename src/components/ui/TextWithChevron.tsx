import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { icons } from '../../constants/icons';

const TRAILING_ARROW = /\s*[>→]\s*$/;

export function stripTrailingArrow(text: string): string {
  return text.replace(TRAILING_ARROW, '');
}

export function hasTrailingArrow(text: string): boolean {
  return TRAILING_ARROW.test(text);
}

type Props = {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  iconColor?: string;
  gap?: number;
  /** auto: chevron when text ends with > or →; always: always show chevron (strips trailing glyph if present). */
  chevron?: 'auto' | 'always';
};

/** Label with Font Awesome chevron-right — replaces literal > / → in CTAs. */
export function TextWithChevron({
  text,
  textStyle,
  style,
  iconSize = 10,
  iconColor = '#111827',
  gap = 4,
  chevron = 'auto',
}: Props) {
  const showChevron = chevron === 'always' || hasTrailingArrow(text);
  const label = showChevron ? stripTrailingArrow(text) : text;

  if (!showChevron) {
    return <Text style={textStyle}>{text}</Text>;
  }

  return (
    <View style={[styles.row, { gap }, style]}>
      <Text style={textStyle}>{label}</Text>
      <Icon icon={icons.chevronRight} size={iconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
