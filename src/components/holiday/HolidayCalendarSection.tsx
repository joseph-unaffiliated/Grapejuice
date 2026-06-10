import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import {
  PILOT_HOLIDAYS,
  PASSOVER_NOTIFY_INTEREST,
} from '../../constants/pilotHolidays';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { usersService } from '../../services/firestore/users';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

type Props = {
  hiddenHolidays: string[];
  interests: string[];
  onToggleInterest: (holidayId: string) => void;
  onHideHoliday: (holidayId: string) => void;
};

export function HolidayCalendarSection({
  hiddenHolidays,
  interests,
  onToggleInterest,
  onHideHoliday,
}: Props) {
  const [explainerId, setExplainerId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setGuestEmail = useGuestSessionStore((s) => s.setInterestEmail);
  const guestEmail = useGuestSessionStore((s) => s.interestEmail);

  const notifyCards = PILOT_HOLIDAYS.filter(
    (h) => h.status !== 'active' && !hiddenHolidays.includes(h.id)
  );

  const selected = notifyCards.find((h) => h.id === explainerId);
  const interested = (id: string) =>
    interests.includes(id) || (id === 'passover-2027' && interests.includes(PASSOVER_NOTIFY_INTEREST));

  const confirmInterest = async (holidayId: string) => {
    const key = holidayId === 'passover-2027' ? PASSOVER_NOTIFY_INTEREST : holidayId;
    onToggleInterest(key);
    if (isAuthenticated && user?.uid) {
      await usersService.upsert(user.uid, { notificationsOptIn: true });
    } else if (email.trim()) {
      setGuestEmail(email.trim());
    }
    setExplainerId(null);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Holiday calendar</Text>
      <Text style={styles.sectionSub}>
        Tap a holiday to learn more — register interest or hide what is not for you.
      </Text>

      {notifyCards.map((holiday) => (
        <TouchableOpacity
          key={holiday.id}
          style={[styles.card, interested(holiday.id) && styles.cardInterested]}
          onPress={() => setExplainerId(holiday.id)}
        >
          <Text style={styles.cardDate}>{holiday.gregorianDateLabel}</Text>
          <Text style={styles.cardTitle}>{holiday.title}</Text>
          <Text style={styles.cardMeta} numberOfLines={2}>{holiday.explainer}</Text>
          {interested(holiday.id) ? (
            <Text style={styles.interestedLabel}>You are on the list</Text>
          ) : null}
        </TouchableOpacity>
      ))}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setExplainerId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setExplainerId(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {selected ? (
              <>
                <Text style={styles.modalTitle}>{selected.title}</Text>
                <Text style={styles.modalDate}>{selected.gregorianDateLabel}</Text>
                <Text style={styles.modalBody}>{selected.explainer}</Text>
                {!isAuthenticated && !interested(selected.id) ? (
                  <>
                    <Text style={styles.emailLabel}>Email (optional — for first access)</Text>
                    <TextInput
                      style={styles.emailInput}
                      value={email || guestEmail}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      fontSize={16}
                    />
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => void confirmInterest(selected.id)}
                  disabled={interested(selected.id)}
                >
                  <Text style={styles.primaryBtnText}>
                    {interested(selected.id) ? 'You are on the list' : 'Interested — notify me'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => { onHideHoliday(selected.id); setExplainerId(null); }}>
                  <Text style={styles.secondaryBtnText}>Not interested — hide this</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md },
  sectionTitle: { fontSize: typography.title, fontWeight: '400', color: semanticColors.textPrimary },
  sectionSub: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  card: {
    backgroundColor: semanticColors.bgElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: semanticColors.border,
  },
  cardInterested: { borderColor: semanticColors.goldMuted, backgroundColor: semanticColors.accentCream },
  cardDate: { fontSize: typography.sm, color: semanticColors.textTertiary, fontWeight: '600' },
  cardTitle: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary, marginTop: 4 },
  cardMeta: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: 4 },
  interestedLabel: { fontSize: typography.sm, color: semanticColors.brand, fontWeight: '600', marginTop: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalSheet: { backgroundColor: semanticColors.bgPrimary, borderRadius: borderRadius.lg, padding: spacing.lg },
  modalTitle: { fontSize: typography.titleLg, fontWeight: '700' },
  modalDate: { fontSize: typography.sm, color: semanticColors.textTertiary, marginTop: 4 },
  modalBody: { fontSize: typography.md, color: semanticColors.textSecondary, marginTop: spacing.md, lineHeight: 20 },
  emailLabel: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: spacing.md },
  emailInput: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: semanticColors.textInverse, fontWeight: '700' },
  secondaryBtn: { marginTop: spacing.sm, padding: spacing.md, alignItems: 'center' },
  secondaryBtnText: { color: semanticColors.textSecondary, fontWeight: '600' },
});
