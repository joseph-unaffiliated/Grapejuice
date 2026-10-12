import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { BoxSummary } from '../../components/mobile/BoxSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileField } from '../../components/mobile/MobileField';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { m, mType, mFont, balanceProps } from '../../components/mobile/mobileTheme';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import { makeKidDraft, type ChildDraft } from '../../components/family/familyDraft';
import { PRICING_POLICY } from '../../services/box/boxRules';
import { formatDollars } from '../../services/box/buildDefaultBox';

export type MobileAccountFamily = {
  members: ChildDraft[];
  onChange: (next: ChildDraft[]) => void;
  onSave: () => void;
  busy: boolean;
  dirty: boolean;
  complete: boolean;
  error: string | null;
  saved: boolean;
};

export type MobileAccountHelpers = {
  invites: { id: string; email: string; status: string }[];
  email: string;
  onEmail: (v: string) => void;
  onSend: () => void;
  code: string;
  onCode: (v: string) => void;
  onAccept: () => void;
  busy: boolean;
};

export type MobileAccountSignIn = {
  hasPassword: boolean;
  hasGoogle: boolean;
  onSetPassword: () => void;
  onConnectGoogle?: () => void;
  password: {
    current: string;
    next: string;
    confirm: string;
    onCurrent: (v: string) => void;
    onNext: (v: string) => void;
    onConfirm: (v: string) => void;
    onSubmit: () => void;
    busy: boolean;
    error: string | null;
    success: boolean;
  };
};

type Props = {
  email: string;
  displayName?: string | null;
  cardOnFile: boolean;
  /** "Visa •••• 4242" when we know the saved card. */
  cardLabel?: string | null;
  creditLabel?: string | null;
  family: MobileAccountFamily;
  helpers?: MobileAccountHelpers | null;
  signIn: MobileAccountSignIn;
  previewBanner?: string | null;
  onOpenBox: () => void;
  onBuildBox: () => void;
  onCheckout: () => void;
  onOrders: () => void;
  onGifts: () => void;
  onPayment: () => void;
  onFavorites: () => void;
  onHistory: () => void;
  onSendGift: () => void;
  /** Ops admin links. Phones used to offer only the catalog, so Boxes and Orders was unreachable. */
  ops?: { label: string; sub: string; onPress: () => void }[];
  signOutLabel: string;
  onSignOut: () => void;
};

type IconDef = (typeof icons)[keyof typeof icons];
type Sheet = null | 'family' | 'payment' | 'helpers' | 'signin';

function memberAge(d: ChildDraft): string {
  if (d.role === 'adult') return 'Adult';
  if (typeof d.plannerAge === 'number') return d.plannerAge >= 18 ? '18+' : `${d.plannerAge}`;
  return d.ageGroup;
}

/** Phone account page (mockups/account s=1): box card first, then one row per thing you might need. */
export function MobileAccountHub(p: Props) {
  const glance = useBoxGlance();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingFamily, setEditingFamily] = useState(false);
  const kids = p.family.members.filter((x) => (x.role ?? 'kid') === 'kid');
  const named = kids.filter((k) => k.name.trim());
  const familySub = named.length
    ? named.map((k) => `${k.name.trim()}, ${memberAge(k)}`).join(' · ')
    : kids.length
      ? `${kids.length} ${kids.length === 1 ? 'kid' : 'kids'}`
      : 'Add your kids';
  const firstName = p.displayName?.trim().split(/\s+/)[0];
  const closeSheet = () => {
    if (sheet === 'family' && p.family.busy) return;
    setSheet(null);
    setEditingFamily(false);
  };
  const extraKidCents = PRICING_POLICY.perExtraKidCents;
  const extraKid = extraKidCents % 100 === 0 ? `$${extraKidCents / 100}` : formatDollars(extraKidCents);
  const listed = p.family.members.filter((d) => d.role !== 'adult' || d.name.trim());

  return (
    <ScrollView style={{ flex: 1, backgroundColor: m.white }} contentContainerStyle={styles.content}>
      {p.previewBanner ? <Text style={styles.preview}>{p.previewBanner}</Text> : null}
      <Text style={styles.hi} {...balanceProps}>{firstName ? `Hi, ${firstName}` : 'Your account'}</Text>
      <Text style={styles.email}>{p.email}</Text>

      <View style={{ marginTop: 18 }}>
        {glance.state === 'none' ? (
          <View style={styles.emptyBox}>
            <Text style={mType.h3}>No box yet</Text>
            <Text style={[mType.body, { marginTop: 4 }]}>Tell us about your kids and we'll build one in two minutes.</Text>
            <MobileButton label="Build my box" onPress={p.onBuildBox} style={{ marginTop: 14 }} />
          </View>
        ) : (
          <BoxSummary total={glance.totalLabel} items={glance.thumbs}>
            {glance.state === 'set' ? (
              <>
                <Text style={styles.pill}>Set · ships after {glance.lockShort}</Text>
                <Line icon={icons.pen} text={`Change anything until ${glance.lockShort}`} />
              </>
            ) : (
              <>
                <Line icon={icons.calendar} text={`Change anything until ${glance.lockShort}`} />
                {!glance.cardOnFile ? <Text style={styles.held}>{NOT_HELD_COPY}</Text> : null}
              </>
            )}
            <MobileButton label="View my box" onPress={p.onOpenBox} height={54} />
            {glance.state === 'draft' && !glance.cardOnFile ? (
              <MobileButton label="Add shipping and payment" onPress={p.onCheckout} variant="secondary" height={54} />
            ) : null}
          </BoxSummary>
        )}
      </View>

      <Text style={styles.eyebrow}>Your account</Text>
      <View>
        <Row icon={icons.boxOpen} label="Orders" sub="Boxes, shop orders and receipts" onPress={p.onOrders} />
        <Row
          icon={icons.card}
          label="Payment"
          sub={p.cardOnFile ? (p.cardLabel ? (p.creditLabel ? `${p.cardLabel} · ${p.creditLabel} credit` : p.cardLabel) : (p.creditLabel ? `Card on file · ${p.creditLabel} credit` : 'Card on file')) : 'No card yet'}
          warn={!p.cardOnFile && glance.state === 'draft'}
          onPress={() => setSheet('payment')}
        />
        <Row icon={icons.users} label="Family" sub={familySub} onPress={() => setSheet('family')} />
        <Row icon={icons.gift} label="Gifts" sub="Sent and received" onPress={p.onGifts} />
        {p.helpers ? (
          <Row
            icon={icons.userPlus}
            label="Box helpers"
            sub={p.helpers.invites.length ? p.helpers.invites.map((i) => i.email).join(', ') : 'Let someone else edit your box'}
            onPress={() => setSheet('helpers')}
          />
        ) : null}
        <Row icon={icons.key} label="Sign-in" sub={p.signIn.hasPassword ? 'Email code or password' : 'Email code · add a password'} onPress={() => setSheet('signin')} />
        <Row icon={icons.heart} label="Favorites" sub="Things you've hearted" onPress={p.onFavorites} />
        <Row icon={icons.clockHistory} label="History" sub="Past Hanukkahs" onPress={p.onHistory} />
        <Row icon={icons.paperPlane} label="Send a gift" sub="A box or credit for another family" onPress={p.onSendGift} />
      </View>

      {p.ops?.length ? (
        <>
          <Text style={styles.eyebrow}>Ops</Text>
          {p.ops.map((row) => (
            <Row key={row.label} icon={icons.gear} label={row.label} sub={row.sub} onPress={row.onPress} />
          ))}
        </>
      ) : null}

      <Pressable onPress={p.onSignOut} accessibilityRole="button" style={styles.signOut}>
        <Icon icon={icons.signOut} size={14} color={m.goldDark} />
        <Text style={styles.signOutText}>{p.signOutLabel}</Text>
      </Pressable>

      <MobileSheet
        visible={sheet === 'family'}
        onClose={closeSheet}
        title="Family"
        footer={
          editingFamily ? (
            <View style={{ gap: 8 }}>
              {p.family.error ? <Text style={styles.error}>{p.family.error}</Text> : null}
              <MobileButton
                label={p.family.busy ? 'Saving…' : 'Save changes'}
                onPress={p.family.onSave}
                disabled={!p.family.dirty || !p.family.complete || p.family.busy}
                busy={p.family.busy}
              />
            </View>
          ) : undefined
        }
      >
        {editingFamily && !(p.family.saved && !p.family.dirty) ? (
          <FamilyMembersForm members={p.family.members} onChange={p.family.onChange} sectionLead="Names and ages shape what goes in your box." />
        ) : (
          <View>
            <Text style={[mType.small, { fontSize: 14, marginBottom: 6 }]} {...balanceProps}>Each kid gets a book and a present. Extra kids are {extraKid}.</Text>
            {p.family.saved && !p.family.dirty ? <Text style={[mType.small, { color: m.goldDark, marginBottom: 8 }]}>Family saved.</Text> : null}
            {listed.map((d, i) => (
              <View key={`${d.name}-${i}`} style={styles.member}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(d.name.trim()[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{d.name.trim() || (d.role === 'adult' ? 'Grown-up' : 'Kid')}</Text>
                  <Text style={styles.memberSub}>{d.role === 'adult' ? 'Adult' : `Age ${memberAge(d)}`}</Text>
                </View>
                <Text style={styles.link} onPress={() => setEditingFamily(true)} accessibilityRole="button">Edit</Text>
              </View>
            ))}
            <Pressable
              onPress={() => {
                p.family.onChange([...p.family.members, makeKidDraft('', 5)]);
                setEditingFamily(true);
              }}
              accessibilityRole="button"
              style={styles.addKid}
            >
              <Icon icon={icons.plus} size={13} color={m.goldDark} />
              <Text style={styles.addKidText}>Add a kid · {extraKid}</Text>
            </Pressable>
            <View style={styles.note}>
              <Text style={styles.noteText} {...balanceProps}>
                Changing ages or adding a kid can change what's in your box. We'll show you before anything changes.
              </Text>
            </View>
          </View>
        )}
      </MobileSheet>

      <MobileSheet
        visible={sheet === 'payment'}
        onClose={closeSheet}
        title="Payment"
        footer={<MobileButton label={p.cardOnFile ? 'Replace card' : 'Add a card'} onPress={() => { closeSheet(); p.onPayment(); }} />}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardTile}>
            <Icon icon={icons.card} size={16} color={m.goldDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{p.cardOnFile ? (p.cardLabel ?? 'Card on file') : 'No card yet'}</Text>
            <Text style={styles.memberSub}>
              {p.cardOnFile ? 'Used for your box and checkout' : 'Add one to hold your box'}
            </Text>
          </View>
        </View>
        <Text style={[mType.body, { marginTop: 14 }]} {...balanceProps}>
          {p.cardOnFile
            ? `Your box is charged after ${glance.lockShort}. Nothing is charged before then.`
            : NOT_HELD_COPY}
        </Text>
        {p.creditLabel ? (
          <Text style={[mType.small, { color: m.goldDark, marginTop: 10 }]}>{`You have ${p.creditLabel} in credit. It comes off your next box, order or gift.`}</Text>
        ) : null}
      </MobileSheet>

      {p.helpers ? (
        <MobileSheet visible={sheet === 'helpers'} onClose={closeSheet} title="Box helpers">
          <Text style={[mType.body, { marginBottom: 16 }]} {...balanceProps}>Invite someone to edit the same box, like a partner or grandparent.</Text>
          <MobileField
            label="Their email"
            value={p.helpers.email}
            onChangeText={p.helpers.onEmail}
            placeholder="name@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <MobileButton label={p.helpers.busy ? 'Sending…' : 'Send invite'} onPress={p.helpers.onSend} disabled={p.helpers.busy || !p.helpers.email.trim()} />
          {p.helpers.invites.length ? (
            <View style={{ marginTop: 16 }}>
              {p.helpers.invites.map((inv) => (
                <View key={inv.id} style={styles.inviteRow}>
                  <Text style={[mType.bodyStrong, { flex: 1 }]} numberOfLines={1}>{inv.email}</Text>
                  <Text style={mType.small}>{inv.status}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[styles.eyebrow, { marginTop: 24 }]}>Got an invite?</Text>
          <MobileField label="Invite code" value={p.helpers.code} onChangeText={p.helpers.onCode} placeholder="Paste the code" autoCapitalize="none" />
          <MobileButton label={p.helpers.busy ? 'Joining…' : 'Join their box'} variant="secondary" onPress={p.helpers.onAccept} disabled={p.helpers.busy || !p.helpers.code.trim()} />
        </MobileSheet>
      ) : null}

      <MobileSheet visible={sheet === 'signin'} onClose={closeSheet} title="Sign-in">
        <Text style={[mType.body, { marginBottom: 16 }]} {...balanceProps}>
          {p.signIn.hasPassword
            ? `Sign in to ${p.email} with an emailed code or your password.`
            : p.signIn.hasGoogle
              ? `You sign in with Google. Add a password to also sign in to ${p.email} with email.`
              : `You sign in with a code we email you. Add a password to sign in to ${p.email} directly.`}
        </Text>
        {p.signIn.hasPassword ? (
          <>
            <MobileField label="Current password" value={p.signIn.password.current} onChangeText={p.signIn.password.onCurrent} secureTextEntry autoCapitalize="none" autoComplete="password" />
            <MobileField label="New password" value={p.signIn.password.next} onChangeText={p.signIn.password.onNext} secureTextEntry autoCapitalize="none" autoComplete="password-new" />
            <MobileField
              label="Confirm new password"
              value={p.signIn.password.confirm}
              onChangeText={p.signIn.password.onConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              onSubmitEditing={p.signIn.password.onSubmit}
              error={p.signIn.password.error}
            />
            {p.signIn.password.success ? <Text style={[mType.small, { color: m.goldDark, marginBottom: 10 }]}>Password updated.</Text> : null}
            <MobileButton label={p.signIn.password.busy ? 'Updating…' : 'Update password'} onPress={p.signIn.password.onSubmit} busy={p.signIn.password.busy} disabled={p.signIn.password.busy} />
          </>
        ) : (
          <MobileButton label="Add a password" onPress={() => { closeSheet(); p.signIn.onSetPassword(); }} />
        )}
        {!p.signIn.hasGoogle && p.signIn.onConnectGoogle ? (
          <MobileButton label="Sign in with Google too" variant="secondary" onPress={() => { closeSheet(); p.signIn.onConnectGoogle?.(); }} style={{ marginTop: 10 }} />
        ) : null}
      </MobileSheet>
    </ScrollView>
  );
}

function Line({ icon, text }: { icon: IconDef; text: string }) {
  return (
    <View style={styles.line}>
      <Icon icon={icon} size={14} color={m.goldDark} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

function Row({ icon, label, sub, onPress, warn }: { icon: IconDef; label: string; sub: string; onPress?: () => void; warn?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}>
      <View style={styles.tile}>
        <Icon icon={icon} size={15} color={m.goldDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={[styles.rowSub, warn && { color: m.warn }]} numberOfLines={1}>{sub}</Text>
      </View>
      {onPress ? <Icon icon={icons.chevronRight} size={13} color={m.gold} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 48 },
  preview: { ...mType.tiny, backgroundColor: m.beige, padding: 8, borderRadius: 8, marginBottom: 12 },
  hi: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  email: { fontSize: 14, color: m.muted, marginTop: 4, ...mFont(400) },
  emptyBox: { borderWidth: 1, borderColor: m.lineWarm, borderRadius: 14, padding: 16, backgroundColor: m.beige },
  pill: { alignSelf: 'flex-start', backgroundColor: m.white, color: m.goldDark, fontSize: 12, paddingHorizontal: 10, height: 24, lineHeight: 24, borderRadius: 12, overflow: 'hidden', ...mFont(400) },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13.5, color: m.body, ...mFont(400), flex: 1 },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 16, ...mFont(400) },
  eyebrow: { ...mType.eyebrow, marginTop: 26, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: m.line, gap: 12, minHeight: 64 },
  tile: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: m.line, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, color: m.ink, ...mFont(400) },
  rowSub: { fontSize: 13, color: m.muted, marginTop: 1, ...mFont(300) },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, minHeight: 44, alignSelf: 'flex-start' },
  signOutText: { fontSize: 14, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', paddingVertical: 8, paddingLeft: 8, ...mFont(400) },
  error: { ...mType.small, color: m.warn },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, color: m.goldDark, ...mFont(500) },
  memberName: { fontSize: 16, color: m.ink, ...mFont(400) },
  memberSub: { fontSize: 13, color: m.muted, ...mFont(300) },
  addKid: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 4 },
  addKidText: { fontSize: 15, color: m.goldDark, ...mFont(500) },
  note: { backgroundColor: m.beige, borderRadius: 12, padding: 12, marginTop: 8 },
  noteText: { fontSize: 13, lineHeight: 18, color: m.body, ...mFont(400) },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: m.lineWarm, borderRadius: 12, padding: 12, backgroundColor: m.beige },
  cardTile: { width: 44, height: 30, borderRadius: 6, backgroundColor: m.white, borderWidth: 1, borderColor: m.lineWarm, alignItems: 'center', justifyContent: 'center' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
});
