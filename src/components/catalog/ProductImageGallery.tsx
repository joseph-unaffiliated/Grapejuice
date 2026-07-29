import React, { useMemo, useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { spacing } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  itemId: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  /** Max width of the gallery column (desktop). */
  maxWidth?: number;
  style?: ViewStyle;
};

function collectUrls(imageUrl?: string | null, imageUrls?: string[] | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [imageUrl, ...(imageUrls ?? [])]) {
    if (!u || typeof u !== 'string') continue;
    const trimmed = u.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function ProductImageGallery({
  itemId,
  imageUrl,
  imageUrls,
  maxWidth,
  style,
}: Props) {
  const { colors } = useThemeMode();
  const urls = useMemo(() => collectUrls(imageUrl, imageUrls), [imageUrl, imageUrls]);
  const [selected, setSelected] = useState(0);
  const activeIndex = Math.min(selected, Math.max(0, urls.length - 1));
  const activeUrl = urls[activeIndex];

  return (
    <View style={[styles.root, maxWidth != null ? { maxWidth, width: '100%' } : undefined, style]}>
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.brandLight },
          Platform.OS === 'web' ? { aspectRatio: 1 } : undefined,
        ]}
      >
        {activeUrl ? (
          <Image source={{ uri: activeUrl }} style={styles.heroImage} resizeMode="contain" />
        ) : (
          <BoxItemImage
            size={Platform.OS === 'web' ? 480 : 320}
            itemId={itemId}
            imageUrl={imageUrl}
            style={styles.heroFallback}
          />
        )}
      </View>
      {urls.length > 1 ? (
        <View style={styles.thumbs}>
          {urls.map((url, i) => {
            const isActive = i === activeIndex;
            return (
              <TouchableOpacity
                key={url}
                onPress={() => setSelected(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={[
                  styles.thumb,
                  {
                    borderColor: isActive ? colors.textPrimary : colors.border,
                    backgroundColor: colors.brandLight,
                  },
                ]}
              >
                <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="contain" />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const THUMB = 72;

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  hero: {
    width: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    minHeight: Platform.OS === 'web' ? undefined : 320,
    aspectRatio: 1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 0,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
});
