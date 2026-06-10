import React from 'react';
import { View, Image, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { semanticColors, borderRadius } from '../../constants/theme';
import { resolveCatalogImage } from '../../constants/catalogImages';

type Props = {
  size?: number;
  imageUrl?: string | null;
  itemId?: string | null;
  style?: ViewStyle;
};

export function BoxItemImage({ size = 72, imageUrl, itemId, style }: Props) {
  const source = resolveCatalogImage(itemId, imageUrl);
  const radius = borderRadius.md;

  if (source) {
    return (
      <Image
        source={source}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: semanticColors.border,
          },
          style,
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        Platform.OS === 'web' ? { backgroundColor: 'rgba(0,0,0,0.06)' } : undefined,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: semanticColors.border,
  },
});
