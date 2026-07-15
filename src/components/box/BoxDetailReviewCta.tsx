import React, { useMemo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { createBoxDetailStyles } from './boxDetailLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
};

/** Figma 370:3514 — black Review Box CTA at scroll bottom. */
export function BoxDetailReviewCta({
  onPress,
  disabled,
  loading,
  label = 'Review Box',
}: Props) {
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createBoxDetailStyles(colors, { desktop: isDesktop }), [colors, isDesktop]);

  return (
    <TouchableOpacity
      style={[styles.reviewCta, (disabled || loading) && styles.reviewCtaDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={colors.goldMuted} />
      ) : (
        <Text style={styles.reviewCtaText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
