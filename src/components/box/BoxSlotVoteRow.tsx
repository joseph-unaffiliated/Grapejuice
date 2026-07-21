import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import type { CatalogItem, SlotVotes } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useThemeMode } from '../../context/ThemeContext';
import { getVotersForOption, voteCount } from '../../services/box/slotVotes';
import { spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

type Props = {
  slotId: string;
  slotVotes: SlotVotes;
  options: CatalogItem[];
  currentItemId: string;
  currentVoterId: string;
  onToggleVote: (itemId: string) => void;
  topPickItemId?: string | null;
  topPickItemName?: string | null;
  onApplyTopPick?: () => void;
};

export function BoxSlotVoteRow({
  slotId,
  slotVotes,
  options,
  currentItemId,
  currentVoterId,
  onToggleVote,
  topPickItemId,
  topPickItemName,
  onApplyTopPick,
}: Props) {
  const { colors } = useThemeMode();
  const [voterModal, setVoterModal] = useState<{ itemId: string; itemName: string } | null>(null);

  const uniqueOptions = options.filter(
    (opt, idx, arr) => arr.findIndex((o) => o.id === opt.id) === idx
  );

  return (
    <>
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Family picks</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {uniqueOptions.map((opt) => {
            const count = voteCount(slotVotes, slotId, opt.id);
            const iVoted = getVotersForOption(slotVotes, slotId, opt.id).some(
              (v) => v.voterId === currentVoterId
            );
            const isCurrent = opt.id === currentItemId;
            return (
              <View
                key={opt.id}
                style={[
                  styles.card,
                  isCurrent && styles.cardCurrent,
                  { borderColor: isCurrent ? colors.brand : colors.border, backgroundColor: colors.bgPrimary },
                  Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
                ]}
              >
                <BoxItemImage size={56} imageUrl={opt.imageUrl} itemId={opt.id} />
                <Text style={[styles.optName, { color: colors.textPrimary }]} numberOfLines={2}>
                  {opt.name}
                </Text>
                <TouchableOpacity
                  style={styles.thumbBtn}
                  onPress={() => onToggleVote(opt.id)}
                  onLongPress={() => setVoterModal({ itemId: opt.id, itemName: opt.name })}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityLabel={`Vote for ${opt.name}${count > 0 ? `, ${count} vote${count === 1 ? '' : 's'}` : ''}`}
                  accessibilityHint="Press and hold to see who voted"
                >
                  <Icon
                    icon={icons.thumbsUp}
                    size={16}
                    color={iVoted || count > 0 ? colors.brand : colors.textTertiary}
                  />
                  {count > 0 ? (
                    <Text style={[styles.count, { color: colors.brand }]}>{count}</Text>
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
        <Text style={[styles.hint, { color: colors.textTertiary }]} accessibilityRole="text">
          Press and hold 👍 to see who voted
        </Text>
        {onApplyTopPick && topPickItemId && topPickItemId !== currentItemId ? (
          <TouchableOpacity
            style={[styles.applyTopPick, { borderColor: colors.brand }]}
            onPress={onApplyTopPick}
            accessibilityRole="button"
            accessibilityLabel={`Apply family top pick${topPickItemName ? `: ${topPickItemName}` : ''}`}
          >
            <Text style={[styles.applyTopPickText, { color: colors.brand }]}>
              Use family top pick{topPickItemName ? ` — ${topPickItemName}` : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <VoterListModal
        visible={!!voterModal}
        title={voterModal?.itemName ?? ''}
        voters={voterModal ? getVotersForOption(slotVotes, slotId, voterModal.itemId) : []}
        onClose={() => setVoterModal(null)}
      />
    </>
  );
}

function VoterListModal({
  visible,
  title,
  voters,
  onClose,
}: {
  visible: boolean;
  title: string;
  voters: Array<{ voterName: string; voterType: 'parent' | 'child' }>;
  onClose: () => void;
}) {
  const { colors } = useThemeMode();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.bgElevated }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
          {voters.length === 0 ? (
            <Text style={[styles.modalEmpty, { color: colors.textTertiary }]}>No votes yet</Text>
          ) : (
            voters.map((v, i) => (
              <Text key={`${v.voterName}-${i}`} style={[styles.modalRow, { color: colors.textSecondary }]}>
                {v.voterName} · {v.voterType === 'parent' ? 'Grown-up' : 'Kid'}
              </Text>
            ))
          )}
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Text style={[styles.modalCloseText, { color: colors.brand }]}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Wrapped slot placeholder for child profiles — no voting. */
export function WrappedGiftPlaceholder() {
  const { colors } = useThemeMode();
  return (
    <View style={[styles.wrappedBlock, { backgroundColor: colors.bgElevated }]}>
      <Icon icon={icons.gift} size={32} color={colors.brand} />
      <Text style={[styles.wrappedBlockTitle, { color: colors.textPrimary }]}>Wrapped surprise</Text>
      <Text style={[styles.wrappedBlockSub, { color: colors.textTertiary }]}>
        A grown-up wrapped this gift — you&apos;ll see it on Hanukkah!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, marginBottom: spacing.md },
  label: { fontSize: typography.sm, fontWeight: '600', marginBottom: spacing.xs },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  hint: { fontSize: typography.sm, marginTop: spacing.xs },
  applyTopPick: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  applyTopPickText: { fontSize: typography.sm, fontWeight: '600' },
  card: {
    width: 108,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  cardCurrent: { borderWidth: 2 },
  optName: { fontSize: typography.sm, textAlign: 'center', marginTop: 4, minHeight: 32 },
  thumbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    padding: spacing.xs,
  },
  count: { fontSize: typography.sm, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: { borderRadius: borderRadius.md, padding: spacing.lg },
  modalTitle: { fontSize: typography.xl, fontWeight: '700', marginBottom: spacing.sm },
  modalEmpty: { fontSize: typography.md },
  modalRow: { fontSize: typography.lg, marginTop: spacing.xs },
  modalClose: { marginTop: spacing.lg, alignSelf: 'flex-end' },
  modalCloseText: { fontWeight: '600', fontSize: typography.lg },
  wrappedBlock: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  wrappedBlockTitle: { fontSize: typography.lg, fontWeight: '700', marginTop: spacing.sm },
  wrappedBlockSub: { fontSize: typography.sm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 18 },
});
