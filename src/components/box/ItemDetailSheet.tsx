import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { inferKeepOrToss } from '../../constants/boxPracticeGroups';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

type Props = {
  visible: boolean;
  item?: CatalogItem;
  lineItem: BoxLineItem;
  onClose: () => void;
  onSwap?: () => void;
};

export function ItemDetailSheet({ visible, item, lineItem, onClose, onSwap }: Props) {
  const keepOrToss = lineItem.keepOrToss ?? inferKeepOrToss(lineItem.slotId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            <BoxItemImage size={120} imageUrl={item?.imageUrl} itemId={item?.id ?? lineItem.itemId} style={styles.hero} />
            <Text style={styles.title}>{lineItem.label ?? item?.name ?? lineItem.itemId}</Text>
            <Text style={styles.desc}>{item?.description ?? 'Included in your Hanukkah kit.'}</Text>
            <Text style={styles.badge}>
              {keepOrToss === 'keep'
                ? 'Keep — goes in your storage box or on the shelf'
                : "Use it up — we'll send more next year"}
            </Text>
            {onSwap ? (
              <TouchableOpacity style={styles.swapBtn} onPress={onSwap}>
                <Text style={styles.swapText}>Swap this item</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: semanticColors.bgPrimary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.lg,
    maxHeight: '75%',
  },
  hero: { alignSelf: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.titleLg, fontWeight: '700' },
  desc: { fontSize: typography.md, color: semanticColors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  badge: { fontSize: typography.sm, color: semanticColors.goldMuted, marginTop: spacing.md },
  swapBtn: {
    marginTop: spacing.lg,
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  swapText: { color: semanticColors.textInverse, fontWeight: '700' },
  closeBtn: { marginTop: spacing.md, alignItems: 'center', padding: spacing.sm },
  closeText: { color: semanticColors.textTertiary },
});
