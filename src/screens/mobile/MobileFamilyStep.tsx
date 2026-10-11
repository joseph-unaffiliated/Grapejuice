import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChildDraft } from '../../components/family/familyDraft';
import { makeAdultDraft, makeKidDraft } from '../../components/family/familyDraft';
import { kidAgeIsSelected, kidAgePatch } from '../../components/family/FamilyMembersForm';
import { ONBOARDING_KID_AGE_CHOICES, type KidAgeChoice } from '../../components/family/KidAgePicker';
import { CHILD_INTEREST_OPTIONS, type ChildInterestId } from '../../constants/childInterests';
import { PracticeRowIcon } from '../../components/holiday/HanukkahPracticesOverview';
import { MobileButton } from '../../components/mobile/MobileButton';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { balanceProps, m, mFont, mGutter, mType } from '../../components/mobile/mobileTheme';

const MAX_MEMBERS = 8;

const PRACTICES = [
  { id: 'candles', label: 'Candles' },
  { id: 'dreidel', label: 'Dreidel' },
  { id: 'food', label: 'Fried foods' },
  { id: 'story', label: 'A story' },
  { id: 'presents', label: 'Presents' },
];

const ageLabel = (c: KidAgeChoice) => (c === 0 ? 'Under 1' : String(c));

type Props = {
  members: ChildDraft[];
  onChange: (next: ChildDraft[]) => void;
  canContinue: boolean;
  onContinue: () => void;
};

/** Onboarding step 1 on the phone (onboarding-v3 s=1): who's celebrating, one card per person. */
export function MobileFamilyStep({ members, onChange, canContinue, onContinue }: Props) {
  const update = (i: number, patch: Partial<ChildDraft>) => onChange(members.map((mem, j) => (j === i ? { ...mem, ...patch } : mem)));
  const toggleInterest = (i: number, id: ChildInterestId) => {
    const cur = members[i].interests ?? [];
    update(i, { interests: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const add = (role: 'kid' | 'adult') => {
    if (members.length < MAX_MEMBERS) onChange([...members, role === 'adult' ? makeAdultDraft() : makeKidDraft()]);
  };
  const kids = members.filter((mem) => mem.role !== 'adult');
  const firstKid = kids[0]?.name.trim();
  const preview =
    kids.length === 0
      ? 'Your box comes with candles, gelt, and latke and sufganiyot mixes.'
      : `${kids.length > 1 ? 'Each kid gets' : `${firstKid || 'Your kid'} gets`} a dreidel, an age-appropriate book, and a present. Plus candles, gelt, and latke and sufganiyot mixes.`;

  return (
    <View style={styles.root}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[mType.h1, { fontSize: 30 }]} {...balanceProps}>Eight nights. Your way.</Text>
        <Text style={styles.sub} {...balanceProps}>
          Tell us who's celebrating. We'll send everything for all eight nights, and you can change anything.
        </Text>
        <View style={styles.icons}>
          {PRACTICES.map((pr) => (
            <View key={pr.id} style={styles.iconCell}>
              <PracticeRowIcon practiceId={pr.id} size={22} />
              <Text style={styles.iconLabel}>{pr.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.who}>Who's celebrating?</Text>
        {members.map((mem, i) => {
          const kid = mem.role !== 'adult';
          const name = mem.name.trim();
          return (
            <View key={i} style={styles.person}>
              <View style={styles.personTop}>
                <View style={[styles.avatar, kid && styles.avatarKid]}>
                  {name ? (
                    <Text style={[styles.avatarText, kid && styles.avatarTextKid]}>{name[0].toUpperCase()}</Text>
                  ) : (
                    <Icon icon={icons.user} size={13} color={kid ? m.ink : m.gold} />
                  )}
                </View>
                <TextInput
                  style={styles.field}
                  value={mem.name}
                  onChangeText={(t) => update(i, { name: t })}
                  placeholder={kid ? 'Their name' : i === 0 ? 'Your name' : 'Name'}
                  placeholderTextColor={m.muted}
                  accessibilityLabel={kid ? 'Kid name' : 'Name'}
                  autoCapitalize="words"
                />
                {i === 0 ? (
                  <Text style={styles.tag}>You</Text>
                ) : (
                  <Pressable onPress={() => onChange(members.filter((_, j) => j !== i))} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.tag}>Remove</Text>
                  </Pressable>
                )}
              </View>
              {kid ? (
                <>
                  <Text style={styles.lab}>Age</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ages} style={{ marginRight: -14 }}>
                    {ONBOARDING_KID_AGE_CHOICES.map((c) => {
                      const on = kidAgeIsSelected(mem, c);
                      return (
                        <Pressable key={String(c)} onPress={() => update(i, kidAgePatch(c))} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.age, on && styles.ageOn]}>
                          <Text style={[styles.ageText, on && styles.ageTextOn]}>{ageLabel(c)}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.lab}>
                    What's {name || 'this kid'} into? <Text style={{ opacity: 0.7 }}>Optional</Text>
                  </Text>
                  <View style={styles.ints}>
                    {CHILD_INTEREST_OPTIONS.map(({ id, label }) => {
                      const on = (mem.interests ?? []).includes(id);
                      return (
                        <Pressable key={id} onPress={() => toggleInterest(i, id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.int, on && styles.intOn]}>
                          <Text style={styles.intText}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
        {members.length < MAX_MEMBERS ? (
          <View style={styles.adds}>
            <Pressable onPress={() => add('kid')} accessibilityRole="button" style={[styles.pill, styles.pillDark]}>
              <Text style={[styles.pillText, { color: m.gold }]}>+ Add a kid</Text>
            </Pressable>
            <Pressable onPress={() => add('adult')} accessibilityRole="button" style={styles.pill}>
              <Text style={styles.pillText}>+ Add an adult</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.preview}>
          <View style={styles.previewIcon}>
            <Icon icon={icons.gift} size={15} color={m.goldDark} />
          </View>
          <Text style={styles.previewText}>{preview}</Text>
        </View>
        <MobileButton label="Next: About you" onPress={onContinue} disabled={!canContinue} />
        {!canContinue ? <Text style={styles.hint}>Add a name for everyone to continue</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  content: { paddingHorizontal: mGutter, paddingTop: 28, paddingBottom: 24 },
  sub: { fontSize: 15, lineHeight: 22, color: m.body, marginTop: 12, ...mFont(300) },
  icons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26, marginBottom: 8 },
  iconCell: { flex: 1, alignItems: 'center', gap: 8 },
  iconLabel: { fontSize: 12, color: m.ink, textAlign: 'center', ...mFont(400) },
  who: { fontSize: 17, color: m.ink, marginTop: 34, marginBottom: 14, ...mFont(500) },
  person: { borderWidth: 1, borderColor: m.line, borderRadius: 14, padding: 14, marginBottom: 12, overflow: 'hidden' },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: m.ink, alignItems: 'center', justifyContent: 'center' },
  avatarKid: { backgroundColor: m.gold },
  avatarText: { fontSize: 14, color: m.gold, ...mFont(400) },
  avatarTextKid: { color: m.ink },
  field: { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderColor: m.gold, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: m.ink, ...mFont(400) },
  tag: { fontSize: 12, color: m.muted, ...mFont(400) },
  lab: { fontSize: 12.5, color: m.muted, marginTop: 16, marginBottom: 8, ...mFont(400) },
  ages: { gap: 6, paddingRight: 14 },
  age: { minWidth: 42, height: 38, borderRadius: 19, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ageOn: { backgroundColor: m.ink, borderColor: m.ink },
  ageText: { fontSize: 14, color: m.ink, ...mFont(400) },
  ageTextOn: { color: m.gold },
  ints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  int: { height: 32, borderRadius: 16, borderWidth: 1, borderColor: m.gold, paddingHorizontal: 12, justifyContent: 'center' },
  intOn: { backgroundColor: m.gold },
  intText: { fontSize: 13, color: m.ink, ...mFont(400) },
  adds: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pill: { height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: m.gold, justifyContent: 'center' },
  pillDark: { backgroundColor: m.ink, borderColor: m.ink },
  pillText: { fontSize: 14, color: m.ink, ...mFont(400) },
  bottom: { paddingHorizontal: mGutter, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: m.line, backgroundColor: m.white, gap: 10 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  previewText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: m.body, ...mFont(400) },
  hint: { fontSize: 12.5, color: m.muted, textAlign: 'center', ...mFont(400) },
});
