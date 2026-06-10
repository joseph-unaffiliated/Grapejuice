import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { useSession } from '../../hooks/useSession';
import { useThemeMode } from '../../context/ThemeContext';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { useAuthStore } from '../../stores/authStore';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius } from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;

export function ProfilesScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const { profile } = useSession();
  const { colors } = useThemeMode();
  const {
    children,
    activeProfile,
    loading,
    enterParentProfile,
    enterChildProfile,
    setChildRavEnabled,
  } = useActiveProfile();
  const [savingRav, setSavingRav] = useState<string | null>(null);

  const selectParent = useCallback(async () => {
    await enterParentProfile();
    navigation.navigate('MainTabs', { screen: 'Home' });
  }, [enterParentProfile, navigation]);

  const selectChild = useCallback(
    async (childId: string) => {
      await enterChildProfile(childId);
      navigation.navigate('MainTabs', { screen: 'Home' });
    },
    [enterChildProfile, navigation]
  );

  const onRavToggle = async (childId: string, value: boolean) => {
    setSavingRav(childId);
    try {
      await setChildRavEnabled(childId, value);
    } finally {
      setSavingRav(null);
    }
  };

  const parentActive = activeProfile.type === 'parent';
  const parentName = profile?.displayName?.trim() || profile?.email?.split('@')[0] || 'Grown-up';

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!user) {
    return (
      <WebContentPanel>
        <GuestAuthPrompt
          returnTo="Profiles"
          showBack
          onBack={() => navigation.goBack()}
        />
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel>
      <ScrollView style={[styles.root, { backgroundColor: colors.bgPrimary }]} contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backText, { color: colors.textSecondary }]}>← Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.textPrimary }]}>Who&apos;s using Grapejuice?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Tap a profile to enter. Switch anytime from Account → Profiles.
        </Text>

        <Text style={[styles.section, { color: colors.textPrimary }]}>Grown-ups</Text>
        <TouchableOpacity
          style={[
            styles.row,
            parentActive && styles.rowActive,
            { borderColor: colors.border, backgroundColor: parentActive ? colors.brandLight : colors.bgElevated },
          ]}
          onPress={() => void selectParent()}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${parentName}`}
        >
          <View style={[styles.avatar, { backgroundColor: colors.brandLight }]}>
            <Icon icon={icons.user} size={20} color={colors.brand} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowName, { color: colors.textPrimary }]}>{parentName}</Text>
            <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>Grown-up · full app</Text>
          </View>
          {parentActive ? <Text style={[styles.activeMark, { color: colors.brand }]}>Active</Text> : null}
        </TouchableOpacity>

        <Text style={[styles.section, { color: colors.textPrimary }]}>Kids</Text>
        {children.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textTertiary }]}>
            No kid profiles yet. Add kids during onboarding or in Account to let them vote and explore.
          </Text>
        ) : null}

        {children.map((child) => {
          const active = activeProfile.type === 'child' && activeProfile.childId === child.id;
          return (
            <View
              key={child.id}
              style={[
                styles.row,
                active && styles.rowActive,
                { borderColor: colors.border, backgroundColor: active ? colors.brandLight : colors.bgElevated },
              ]}
            >
              <TouchableOpacity
                style={styles.rowTap}
                onPress={() => void selectChild(child.id)}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${child.name || 'Kid'}`}
              >
                <View style={[styles.avatar, { backgroundColor: colors.brandLight }]}>
                  <Icon icon={icons.childReaching} size={20} color={colors.brand} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }]}>
                    {child.name?.trim() || 'Kid'}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
                    Ages {child.ageGroup} · vote & guide
                  </Text>
                </View>
                {active ? <Text style={[styles.activeMark, { color: colors.brand }]}>Active</Text> : null}
              </TouchableOpacity>
              <View style={[styles.ravRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.ravLabel, { color: colors.textSecondary }]}>Allow Rav</Text>
                <Switch
                  value={child.ravEnabled === true}
                  onValueChange={(v) => void onRavToggle(child.id, v)}
                  disabled={savingRav === child.id}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  accessibilityLabel={`Allow Rav for ${child.name || 'kid'}`}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </WebContentPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs, marginBottom: spacing.sm },
  backText: { fontSize: typography.lg, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: typography.lg, marginTop: spacing.xs, marginBottom: spacing.lg },
  section: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  rowActive: { borderWidth: 2 },
  rowTap: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: typography.xl, fontWeight: '700' },
  rowMeta: { fontSize: typography.sm, marginTop: 2 },
  activeMark: { fontSize: typography.sm, fontWeight: '700' },
  ravRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ravLabel: { fontSize: typography.md },
  empty: { fontSize: typography.md, lineHeight: 20 },
});
