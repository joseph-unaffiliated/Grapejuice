import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { MobileField } from '../../components/mobile/MobileField';
import { m, mFont, mGutter, balanceProps } from '../../components/mobile/mobileTheme';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids, PRICING_POLICY } from '../../services/box/boxRules';
import { giftChildFromAge, MAX_GIFT_CREDIT_KIDS, type GiftChildDraft } from '../gift/giftGiveTypes';

const MAX_GIFT_KIDS = 4;
const AGE_BANDS: { label: string; age: number }[] = [
  { label: '0-2', age: 1 },
  { label: '3-5', age: 4 },
  { label: '6-8', age: 7 },
  { label: '9-12', age: 10 },
  { label: '13+', age: 15 },
];
const UNSURE_AGE = 6;

const dollars = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : formatCatalogDollars(cents));

function Head({ title, lede }: { title: string; lede?: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>{title}</Text>
      {lede ? <Text style={styles.lede} {...balanceProps}>{lede}</Text> : null}
    </View>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} accessibilityRole="button" accessibilityLabel={`Fewer ${label}`} style={styles.stepBtn}>
        <Text style={[styles.stepText, value <= min && { opacity: 0.35 }]}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={styles.stepBtn}>
        <Text style={[styles.stepText, value >= max && { opacity: 0.35 }]}>+</Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function NoteLine({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.noteLine}>
      <Icon icon={icon} size={14} color={m.goldDark} />
      <Text style={styles.noteText} {...balanceProps}>{text}</Text>
    </View>
  );
}

/** gift.html s=3: family name, how many kids, and roughly how old. Names are optional. */
export function MobileGiftFamily({
  kids,
  adults,
  onChange,
  onAdults,
}: {
  kids: GiftChildDraft[];
  adults: number;
  onChange: (next: GiftChildDraft[]) => void;
  onAdults: (n: number) => void;
}) {
  const [naming, setNaming] = React.useState<number | null>(null);
  const setCount = (n: number) => {
    const next = kids.slice(0, n);
    while (next.length < n) next.push({ ...giftChildFromAge(UNSURE_AGE), ageUnsure: true });
    onChange(next);
  };
  const setAge = (i: number, age: number | null) => {
    const next = [...kids];
    const name = kids[i]?.name;
    const aged = age == null ? { ...giftChildFromAge(UNSURE_AGE), ageUnsure: true } : giftChildFromAge(age);
    next[i] = name?.trim() ? { ...aged, name } : aged;
    onChange(next);
  };
  const setName = (i: number, name: string) => {
    const next = [...kids];
    next[i] = { ...next[i], name };
    onChange(next);
  };
  return (
    <View>
      <Head title="Who is it for?" lede="We pick a book and a present for each kid, based on their age." />
      <View style={styles.pad}>
        <View style={styles.kidRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Kids</Text>
            <Text style={styles.rowSub}>Each kid gets a book and a present</Text>
          </View>
          <Stepper value={kids.length} min={1} max={MAX_GIFT_KIDS} onChange={setCount} label="kids" />
        </View>
        <View style={styles.kidRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Adults</Text>
            <Text style={styles.rowSub}>Dreidels and gelt for everyone</Text>
          </View>
          <Stepper value={adults} min={1} max={8} onChange={onAdults} label="adults" />
        </View>
        {kids.map((kid, i) => {
          const named = kid.name?.trim();
          return (
          <View key={i} style={styles.kidCard}>
            <View style={styles.kidHead}>
              <Text style={styles.kidTitle}>{named || `Kid ${i + 1}`}</Text>
              <Text style={styles.nameLink} onPress={() => setNaming(naming === i ? null : i)} accessibilityRole="button">
                {named ? 'Edit name' : 'Name optional'}
              </Text>
            </View>
            {naming === i ? (
              <MobileField label="Name" value={kid.name ?? ''} onChangeText={(name) => setName(i, name)} placeholder="Maya" autoComplete="off" style={{ marginBottom: 10 }} />
            ) : null}
            <View style={styles.chips}>
              {AGE_BANDS.map((b) => {
                const on = !kid.ageUnsure && (b.age >= 13 ? kid.plannerAge >= 13 : kid.plannerAge < 13 && kid.ageGroup === giftChildFromAge(b.age).ageGroup);
                return <Chip key={b.label} label={b.label} on={on} onPress={() => setAge(i, b.age)} />;
              })}
              <Chip label="Not sure" on={!!kid.ageUnsure} onPress={() => setAge(i, null)} />
            </View>
          </View>
          );
        })}
        {kids.length < MAX_GIFT_KIDS ? (
          <Text style={styles.link} onPress={() => setCount(kids.length + 1)} accessibilityRole="button">
            + Add a kid · {dollars(PRICING_POLICY.perExtraKidCents)}
          </Text>
        ) : null}
        <NoteLine icon={icons.pen} text="Not sure? Guess. They can change the book and presents when they get your email." />
      </View>
    </View>
  );
}

/** gift.html s=2b. Credit always matches a box price, so the amounts are boxes for 1, 2 or 3 kids. */
export function MobileGiftCredit({ creditKids, onChange }: { creditKids: number; onChange: (n: number) => void }) {
  const one = listBoxCentsForKids(1);
  const cards = [1, 2, 3].map((n) => ({ n, cents: listBoxCentsForKids(n), sub: n === 1 ? 'A box' : `Box for ${n} kids` }));
  return (
    <View>
      <Head title="How much credit?" lede={`They build their own box with it. A box for one kid is ${dollars(one)}.`} />
      <View style={styles.pad}>
        <View style={styles.amounts}>
          {cards.map((c) => {
            const on = creditKids === c.n;
            return (
              <Pressable key={c.n} onPress={() => onChange(c.n)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.amount, on && styles.amountOn]}>
                <Text style={[styles.amountValue, on && { color: m.gold }]}>{dollars(c.cents)}</Text>
                <Text style={[styles.amountSub, on && { color: m.gold }]}>{c.sub}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.kidRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Kids in their family</Text>
            <Text style={styles.rowSub}>Enough for a box for each of them</Text>
          </View>
          <Stepper value={creditKids} min={1} max={MAX_GIFT_CREDIT_KIDS} onChange={onChange} label="kids" />
        </View>
        <NoteLine icon={icons.gift} text="They can put it toward a Hanukkah box or spend it on anything in the store." />
      </View>
    </View>
  );
}

type SaveProps = {
  name: string;
  email: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  error?: string;
  signedInEmail: string | null;
  signedIn: boolean;
  onSubmit: () => void;
  busy: boolean;
};

/** gift.html s=4: who's sending, so the gift is saved under their email. */
export const MobileGiftSave = forwardRef<TextInput, SaveProps>(function MobileGiftSave(p, ref) {
  return (
    <View>
      <Head title="Save your gift" lede="So you can come back to it on any device." />
      <View style={styles.pad}>
        <MobileField label="Your name" value={p.name} onChangeText={p.onName} autoComplete="name" placeholder="Rachel" hint="Shown on the note" />
        {p.signedIn ? (
          <Text style={styles.rowSub}>{p.signedInEmail ? `Saving to ${p.signedInEmail}.` : 'Saving to your account.'}</Text>
        ) : (
          <MobileField
            ref={ref}
            label="Email"
            value={p.email}
            onChangeText={p.onEmail}
            onSubmitEditing={p.onSubmit}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="you@example.com"
            editable={!p.busy}
            error={p.error}
          />
        )}
      </View>
    </View>
  );
});

/** gift.html s=7: the note, with what they'll see. */
export function MobileGiftNote({ name, message, onName, onMessage, customize }: { name: string; message: string; onName: (v: string) => void; onMessage: (v: string) => void; customize: boolean; familyName?: string }) {
  const from = name.trim() || 'you';
  return (
    <View>
      <Head title="Add a note" lede="They'll see it in the email with your gift." />
      <View style={styles.pad}>
        <MobileField label="Your name" value={name} onChangeText={onName} autoComplete="name" placeholder="Grandma" />
        <MobileField label="Your note" value={message} onChangeText={onMessage} area maxLength={300} placeholder="Happy Hanukkah!" />
        <Text style={styles.counter}>{message.length} / 300</Text>
        <View style={styles.preview}>
          <Text style={styles.previewLab}>What they'll see</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewEyebrow}>A gift from {from}</Text>
            <Text style={styles.previewH2}>{customize ? 'Your Hanukkah box is on the way' : 'You got Hanukkah credit'}</Text>
            {message.trim() ? <Text style={styles.previewBody}>{message.trim()}</Text> : null}
            <View style={styles.previewBtn}>
              <Text style={styles.previewBtnText}>{customize ? 'See your box' : 'Use your credit'}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

type SendProps = {
  customize: boolean;
  lockShort: string;
  askGiverEmail: boolean;
  giverEmail: string;
  onGiverEmail: (v: string) => void;
  giverEmailError?: string;
  recipientEmail: string;
  onRecipientEmail: (v: string) => void;
  recipientError?: string;
  busy: boolean;
  surprise: boolean;
  onSurprise: (on: boolean) => void;
  address?: React.ReactNode;
  addressError?: string | null;
  discount: React.ReactNode;
  discountNote?: string | null;
  giverEmailRef?: React.Ref<TextInput>;
  recipientRef?: React.Ref<TextInput>;
  addressRef?: React.Ref<View>;
};

/** gift.html s=8: their email, and whether they add the address or it ships as a surprise. */
export function MobileGiftSend(p: SendProps) {
  const opt = (on: boolean, title: string, body: string, onPress: () => void, tag?: string) => (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.shipOpt, on && styles.shipOptOn]}>
      <View style={[styles.dot, on && styles.dotOn]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.shipTitle}>
          {title}
          {tag ? <Text style={styles.tag}>{`  ${tag}  `}</Text> : null}
        </Text>
        <Text style={styles.shipBody}>{body}</Text>
      </View>
    </Pressable>
  );
  return (
    <View>
      <Head
        title={p.customize ? 'How should they get it?' : 'Where should we send it?'}
        lede={p.customize ? 'We email them either way, so they know it’s coming.' : 'We email them a link to claim your gift.'}
      />
      <View style={styles.pad}>
        {p.askGiverEmail ? (
          <MobileField
            ref={p.giverEmailRef}
            label="Your email"
            value={p.giverEmail}
            onChangeText={p.onGiverEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="you@example.com"
            editable={!p.busy}
            error={p.giverEmailError}
            hint="For your receipt"
          />
        ) : null}
        <MobileField
          ref={p.recipientRef}
          label="Their email"
          value={p.recipientEmail}
          onChangeText={p.onRecipientEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="parent@example.com"
          editable={!p.busy}
          error={p.recipientError}
        />
        {p.customize ? (
          <View ref={p.addressRef} style={{ marginTop: 6 }}>
            {opt(!p.surprise, 'They add their address', `We email them a link. They can also swap the book and presents until ${p.lockShort}.`, () => p.onSurprise(false), 'Easiest')}
            {opt(p.surprise, 'Keep it a surprise', 'Enter their address now and it ships without them seeing what’s inside.', () => p.onSurprise(true))}
            {p.surprise ? <View style={{ marginTop: 6 }}>{p.address}</View> : null}
            {p.surprise && p.addressError ? <Text style={styles.error}>{p.addressError}</Text> : null}
          </View>
        ) : null}
        <View style={{ marginTop: 10 }}>{p.discount}</View>
        {p.discountNote ? <Text style={[styles.rowSub, { marginTop: 6 }]}>{p.discountNote}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 18, gap: 8 },
  h1: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  lede: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
  pad: { paddingHorizontal: mGutter },
  kidRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  rowTitle: { fontSize: 16, color: m.ink, ...mFont(400) },
  rowSub: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 20, height: 38, backgroundColor: m.white },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark, ...mFont(400) },
  stepValue: { minWidth: 18, textAlign: 'center', fontSize: 15, color: m.ink, ...mFont(400) },
  kidCard: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  kidHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  kidTitle: { flex: 1, fontSize: 16, color: m.ink, ...mFont(400) },
  nameLink: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: m.gold, justifyContent: 'center', backgroundColor: m.white },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 14, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  link: { fontSize: 14, color: m.goldDark, textDecorationLine: 'underline', marginTop: 14, alignSelf: 'flex-start', ...mFont(400) },
  noteLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 16 },
  noteText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: m.body, ...mFont(400) },
  amounts: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  amount: { flex: 1, height: 64, borderRadius: 12, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  amountOn: { backgroundColor: m.ink, borderColor: m.ink },
  amountValue: { fontSize: 19, color: m.ink, ...mFont(400) },
  amountSub: { fontSize: 12, color: m.muted, marginTop: 2, ...mFont(400) },
  counter: { fontSize: 12.5, color: m.muted, textAlign: 'right', marginTop: -6, ...mFont(400) },
  preview: { marginTop: 18, backgroundColor: m.beige, borderRadius: 16, padding: 14 },
  previewLab: { fontSize: 12.5, color: m.goldDark, marginBottom: 10, ...mFont(500) },
  previewCard: { backgroundColor: m.white, borderRadius: 12, padding: 16, gap: 8 },
  previewEyebrow: { fontSize: 12.5, color: m.goldDark, ...mFont(500) },
  previewH2: { fontSize: 18, lineHeight: 23, color: m.ink, ...mFont(500) },
  previewBody: { fontSize: 14, lineHeight: 20, color: m.body, ...mFont(300) },
  previewBtn: { height: 40, borderRadius: 8, backgroundColor: m.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  previewBtnText: { fontSize: 14, color: m.gold, ...mFont(400) },
  shipOpt: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1, borderColor: m.line, borderRadius: 12, marginBottom: 10 },
  shipOptOn: { borderColor: m.gold, backgroundColor: m.beige },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: m.gold, marginTop: 2 },
  dotOn: { backgroundColor: m.gold, ...({ boxShadow: `inset 0 0 0 3px ${m.beige}` } as object) },
  shipTitle: { fontSize: 15, color: m.ink, ...mFont(400) },
  tag: { fontSize: 11.5, color: m.goldDark, backgroundColor: m.white, borderRadius: 10, ...mFont(400) },
  shipBody: { fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 3, ...mFont(400) },
  error: { fontSize: 12.5, color: m.warn, marginTop: 6, ...mFont(400) },
});
