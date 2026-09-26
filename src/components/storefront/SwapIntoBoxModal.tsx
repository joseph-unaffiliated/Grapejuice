import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { UPSELL_TILE_MEDIUM } from '../box/BoxSectionUpsellStrip';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type SwapPickerOption = {
  key: string;
  name: string;
  imageUrl?: string | null;
  itemId: string;
};

type Props = {
  visible: boolean;
  options: SwapPickerOption[];
  onSelect: (key: string) => void;
  onCancel: () => void;
};

/** Match expanded My Box upsell tiles. */
const IMAGE_SIZE = UPSELL_TILE_MEDIUM;
const CARD_WIDTH = UPSELL_TILE_MEDIUM;
const ROW_GAP = 8;
const MAX_VISIBLE_CARDS = 4;
const MAX_ROW_WIDTH = CARD_WIDTH * MAX_VISIBLE_CARDS + ROW_GAP * (MAX_VISIBLE_CARDS - 1);

/**
 * Pick a swap target — one horizontal row of large image cards (My Box expanded upsell size).
 */
export function SwapIntoBoxModal({ visible, options, onSelect, onCancel }: Props) {
  if (!visible) return null;

  const contentWidth =
    options.length * CARD_WIDTH + Math.max(0, options.length - 1) * ROW_GAP;
  const rowWidth = Math.min(contentWidth, MAX_ROW_WIDTH);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityLabel="Dismiss swap options"
        />
        <View style={styles.sheet} accessibilityRole="dialog" accessibilityLabel="Swap for">
          <Text style={styles.title}>Swap for…</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            style={[styles.rowScroll, { width: rowWidth }]}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.card}
                onPress={() => onSelect(opt.key)}
                accessibilityRole="button"
                accessibilityLabel={`Swap for ${opt.name}`}
              >
                <BoxItemImage size={IMAGE_SIZE} imageUrl={opt.imageUrl} itemId={opt.itemId} />
                <Text style={styles.cardName} numberOfLines={3}>
                  {opt.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.cancel}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Never mind"
          >
            <Text style={styles.cancelText}>Never mind</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 2, 34, 0.45)',
  },
  sheet: {
    maxWidth: MAX_ROW_WIDTH + spacing.md * 2,
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 16px 40px rgba(17, 2, 34, 0.2)',
          width: 'fit-content',
          maxWidth: `min(100%, ${MAX_ROW_WIDTH + spacing.md * 2}px)`,
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
          elevation: 12,
        }),
  },
  title: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  rowScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: ROW_GAP,
    paddingVertical: spacing.xs,
    flexGrow: 0,
  },
  card: {
    width: CARD_WIDTH,
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    textAlign: 'center',
    letterSpacing: -0.2,
    width: '100%',
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
});
