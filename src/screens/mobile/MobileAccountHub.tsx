import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { BoxSummary } from '../../components/mobile/BoxSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { m, mType, mFont, balanceProps } from '../../components/mobile/mobileTheme';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import type { ChildDraft } from '../../components/family/familyDraft';

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

type Props = {
  email: string;
  displayName?: string | null;
  cardOnFile: boolean;
  creditLabel?: string | null;
  family: MobileAccountFamily;
  previewBanner?: string | null;
  onOpenBox: () => void;
  onBuildBox: () => void;
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

/** Phone account page: box card first, then one row per thing you might need. */
export function MobileAccountHub(p: Props) {
  const glance = useBoxGlance();
  const [familyOpen, setFamilyOpen] = useState(false);
  const kids = p.family.members.filter((x) => (x.role ?? 'kid') === 'kid').length;
  const familySub = kids ? `${kids} ${kids === 1 ? 'kid' : 'kids'}` : 'Add your kids';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: m.white }} contentContainerStyle={styles.content}>
      {p.previewBanner ? <Text style={styles.preview}>{p.previewBanner}</Text> : null}
      <Text style={mType.h1} {...balanceProps}>{p.displayName ? `Hi, ${p.displayName.split(' ')[0]}` : 'Your account'}</Text>
      <Text style={[mType.small, { marginTop: 4 }]}>{p.email}</Text>

      <View style={{ marginTop: 20 }}>
        {glance.state === 'none' ? (
          <View style={styles.emptyBox}>
            <Text style={mType.h3}>No box yet</Text>
            <Text style={[mType.body, { marginTop: 4 }]}>Tell us about your kids and we'll build one in two minutes.</Text>
            <MobileButton label="Build my box" onPress={p.onBuildBox} style={{ marginTop: 14 }} />
          </View>
        ) : (
          <BoxSummary
            size="lg"
            total={glance.totalLabel}
            items={glance.thumbs}
            sub={glance.state === 'set' ? `Locks ${glance.lockShort} · card on file` : p.cardOnFile ? `Locks ${glance.lockShort}` : NOT_HELD_COPY}
            onPress={p.onOpenBox}
            link={<Text style={styles.link} onPress={p.onOpenBox}>Open my box</Text>}
          />
        )}
      </View>

      <View style={styles.rows}>
        <Row label="Orders" sub="Boxes, shop orders and receipts" onPress={p.onOrders} />
        <Row label="Gifts" sub="Sent and received" onPress={p.onGifts} />
        <Row label="Payment" sub={p.cardOnFile ? 'Card on file' : 'No card yet'} warn={!p.cardOnFile && glance.state === 'draft'} onPress={p.onPayment} />
        {p.creditLabel ? <Row label="Credit" sub={`${p.creditLabel} comes off your next checkout`} /> : null}
        <Row label="Family" sub={familySub} onPress={() => setFamilyOpen(true)} />
        <Row label="Favorites" sub="Things you've hearted" onPress={p.onFavorites} />
        <Row label="History" sub="Past Hanukkahs" onPress={p.onHistory} />
        <Row label="Send a gift" sub="A box or credit for another family" onPress={p.onSendGift} />
        {p.ops?.length ? (
          <>
            <Text style={styles.opsHead}>Ops</Text>
            {p.ops.map((row) => (
              <Row key={row.label} label={row.label} sub={row.sub} onPress={row.onPress} />
            ))}
          </>
        ) : null}
      </View>

      <MobileButton label={p.signOutLabel} variant="secondary" onPress={p.onSignOut} style={{ marginTop: 28 }} />

      <MobileSheet
        visible={familyOpen}
        onClose={() => { if (!p.family.busy) setFamilyOpen(false); }}
        title="Your family"
        footer={
          <View style={{ gap: 8 }}>
            {p.family.error ? <Text style={styles.error}>{p.family.error}</Text> : null}
            {p.family.saved && !p.family.dirty ? <Text style={[mType.small, { color: m.goldDark }]}>Family saved.</Text> : null}
            <MobileButton
              label={p.family.busy ? 'Saving…' : 'Save changes'}
              onPress={p.family.onSave}
              disabled={!p.family.dirty || !p.family.complete || p.family.busy}
              busy={p.family.busy}
            />
          </View>
        }
      >
        <FamilyMembersForm members={p.family.members} onChange={p.family.onChange} sectionLead="Names and ages shape what goes in your box." />
      </MobileSheet>
    </ScrollView>
  );
}

function Row({ label, sub, onPress, warn }: { label: string; sub: string; onPress?: () => void; warn?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}>
      <View style={{ flex: 1 }}>
        <Text style={mType.bodyStrong}>{label}</Text>
        <Text style={[mType.small, warn && { color: m.warn }]}>{sub}</Text>
      </View>
      {onPress ? <Text style={styles.chev}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 },
  preview: { ...mType.tiny, backgroundColor: m.beige, padding: 8, borderRadius: 8, marginBottom: 12 },
  emptyBox: { borderWidth: 1, borderColor: m.lineWarm, borderRadius: 14, padding: 16, backgroundColor: m.beige },
  link: { ...mType.small, color: m.goldDark, ...mFont(500) },
  rows: { marginTop: 24, borderTopWidth: 1, borderTopColor: m.line },
  opsHead: { ...mType.eyebrow, marginTop: 22, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line, gap: 12 },
  chev: { fontSize: 22, color: m.muted, lineHeight: 24 },
  error: { ...mType.small, color: m.warn },
});
