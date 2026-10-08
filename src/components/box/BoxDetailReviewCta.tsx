import React, { useMemo } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { createBoxDetailStyles } from './boxDetailLayout';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { BrandLoadingMark } from '../brand/BrandLoadingMark';

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
        <BrandLoadingMark large={false} color={colors.goldMuted} />
      ) : (
        <Text style={styles.reviewCtaText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
