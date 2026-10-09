import React from 'react';
import { View, Image, StyleSheet, Platform, type ImageStyle } from 'react-native';
import { semanticColors, borderRadius } from '../../constants/theme';
import { catalogThumbFits, resolveCatalogImage } from '../../constants/catalogImages';

type Props = {
  size?: number;
  imageUrl?: string | null;
  itemId?: string | null;
  style?: ImageStyle;
  /** Always load the full-size photo (defaults to the small thumb at tile sizes when one exists). */
  full?: boolean;
};

export function BoxItemImage({ size = 72, imageUrl, itemId, style, full = false }: Props) {
  const source = resolveCatalogImage(itemId, imageUrl, {
    thumb: !full && catalogThumbFits(size),
  });
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
