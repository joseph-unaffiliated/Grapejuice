import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StickyBar } from '../../components/mobile/StickyBar';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { m, mFont, mGutter, mRadius, mType, balanceProps } from '../../components/mobile/mobileTheme';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import type { BoxThumb } from '../../components/mobile/BoxSummary';

const DOORSTEP = require('../../../assets/storefront/box-doorstep.jpg');

function GiftBanner({ giverName }: { giverName: string }) {
  return (
    <View style={styles.banner}>
      <Icon icon={icons.gift} size={13} color={m.goldDark} />
      <Text style={styles.bannerText}>A gift from {giverName}</Text>
    </View>
  );
}

function NoteCard({ message, giverName }: { message: string; giverName: string }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{message}</Text>
      <Text style={styles.noteFrom}>{giverName}</Text>
    </View>
  );
}

function NoteLine({ icon, children }: { icon: typeof icons.calendar; children: string }) {
  return (
    <View style={styles.noteLine}>
      <Icon icon={icon} size={12} color={m.gold} />
      <Text style={styles.noteLineText}>{children}</Text>
    </View>
  );
}

function CreditCard({ cents, lockDay }: { cents: number; lockDay: string }) {
  return (
    <View style={styles.credit}>
      <Text style={styles.creditLabel}>Your credit</Text>
      <Text style={styles.creditAmt}>{formatCatalogDollars(cents)}</Text>
      <Text style={[styles.creditLabel, { color: m.white }]}>Use it on a box for your family by {lockDay}.</Text>
    </View>
  );
}

/** Claim link landing (before sign-in): who it's from, what it is, one button. */
export function MobileGiftClaim({
  giverName,
  kind,
  creditCents,
  lockDay,
  guest,
  onOpen,
}: {
  giverName: string;
  kind: 'box' | 'credit';
  creditCents: number;
  lockDay: string;
  guest: boolean;
  onOpen: () => void;
}) {
  const box = kind === 'box';
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Image source={DOORSTEP} style={styles.hero} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.pad}>
          <GiftBanner giverName={giverName} />
          <Text style={[mType.h1, { marginTop: 14 }]} {...balanceProps}>
            {box ? `${giverName} sent your family Hanukkah` : `${giverName} sent you Hanukkah credit`}
          </Text>
          {box ? (
            <Text style={styles.lede} {...balanceProps}>A box with everything for all eight nights, already paid for. Just tell us where to send it.</Text>
          ) : (
            <View style={{ marginTop: 16 }}>
              <CreditCard cents={creditCents} lockDay={lockDay} />
            </View>
          )}
          <View style={{ marginTop: 16 }}>
            <NoteLine icon={box ? icons.calendar : icons.pen}>
              {box ? `Add your address by ${lockDay} so it ships with the Hanukkah boxes.` : 'Answer two quick questions and we’ll pick everything. The credit comes off automatically.'}
            </NoteLine>
          </View>
          {guest ? <Text style={styles.fine}>You’ll make a free account to open it. No password needed.</Text> : null}
        </View>
      </ScrollView>
      <StickyBar layout="stack" label={box ? `Covered by ${giverName}` : `Credit from ${giverName}`} total={box ? '$0 to you' : formatCatalogDollars(creditCents)} cta={{ label: 'Open my gift', onPress: onOpen }} />
    </View>
  );
}

/** After claiming a box gift: peek inside, or keep it a surprise. */
export function MobileGiftReveal({
  giverName,
  message,
  thumbs,
  onShow,
  onSurprise,
}: {
  giverName: string;
  message?: string;
  thumbs: BoxThumb[];
  onShow: () => void;
  onSurprise: () => void;
}) {
  const [choice, setChoice] = useState<'show' | 'surprise'>('show');
  const option = (key: 'show' | 'surprise', title: string, detail: string, extra: React.ReactNode) => {
    const on = choice === key;
    return (
      <Pressable onPress={() => setChoice(key)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={title} style={[styles.choice, on && styles.choiceOn]}>
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.choiceTitle}>{title}</Text>
          <Text style={styles.choiceDetail}>{detail}</Text>
          {extra}
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: 26, paddingBottom: 24 }]}>
        <Text style={[mType.h1, { fontSize: 27 }]} {...balanceProps}>Peek inside, or keep it a surprise?</Text>
        <Text style={[styles.lede, { marginBottom: 16 }]}>Either way it’s covered by {giverName}.</Text>
        {message ? (
          <View style={{ marginBottom: 16 }}>
            <NoteCard message={message} giverName={giverName} />
          </View>
        ) : null}
        <View style={{ gap: 12 }}>
          {option(
            'show',
            'Show me what’s inside',
            `See everything ${giverName} picked. Swap the book or presents if you like.`,
            thumbs.length ? (
              <View style={styles.thumbs}>
                {thumbs.slice(0, 6).map((t) => (
                  <View key={t.id} style={styles.thumb}>
                    <BoxItemImage size={40} imageUrl={t.imageUrl} itemId={t.id} />
                  </View>
                ))}
              </View>
            ) : null
          )}
          {option(
            'surprise',
            'Keep it a surprise',
            'Just add your address. We won’t show you what’s inside.',
            <View style={styles.thumbs}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.wrapped}>
                  <View style={styles.ribbonV} />
                  <View style={styles.ribbonH} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      <StickyBar layout="stack" label={`Covered by ${giverName}`} total="$0 to you" cta={{ label: 'Continue', onPress: choice === 'show' ? onShow : onSurprise }} />
    </View>
  );
}

/** After claiming credit: the amount, the note, and the way to spend it. */
export function MobileGiftCreditReady({
  giverName,
  message,
  creditCents,
  lockDay,
  onBuild,
}: {
  giverName: string;
  message?: string;
  creditCents: number;
  lockDay: string;
  onBuild: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: 26, paddingBottom: 24 }]}>
        <GiftBanner giverName={giverName} />
        <Text style={[mType.h1, { marginTop: 14 }]} {...balanceProps}>{giverName} sent you Hanukkah credit</Text>
        <View style={{ marginTop: 16, gap: 16 }}>
          <CreditCard cents={creditCents} lockDay={lockDay} />
          {message ? <NoteCard message={message} giverName={giverName} /> : null}
          <NoteLine icon={icons.pen}>Answer two quick questions and we’ll pick everything. The credit comes off automatically.</NoteLine>
        </View>
      </ScrollView>
      <StickyBar layout="stack" label={`Credit from ${giverName}`} total={formatCatalogDollars(creditCents)} cta={{ label: 'Build my box', onPress: onBuild }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 230, backgroundColor: m.img },
  pad: { paddingHorizontal: mGutter, paddingTop: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: m.beige, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bannerText: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  lede: { fontSize: 15.5, lineHeight: 23, color: m.body, marginTop: 10, ...mFont(300) },
  note: { backgroundColor: m.beige, borderRadius: 16, padding: 16, gap: 10 },
  noteText: { fontSize: 16, lineHeight: 25, color: m.ink, ...mFont(300) },
  noteFrom: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  noteLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteLineText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: m.body, ...mFont(400) },
  fine: { marginTop: 14, fontSize: 12.5, lineHeight: 18, color: m.muted, ...mFont(300) },
  credit: { backgroundColor: m.ink, borderRadius: 16, padding: 18, gap: 6 },
  creditLabel: { fontSize: 13.5, color: '#D1D5DB', ...mFont(400) },
  creditAmt: { fontSize: 44, color: m.gold, letterSpacing: -1, ...mFont(300) },
  choice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: mRadius.md, borderWidth: 1, borderColor: m.line, backgroundColor: m.white },
  choiceOn: { backgroundColor: m.beige, borderColor: m.gold, borderWidth: 1.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: m.goldDark },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: m.gold },
  choiceTitle: { fontSize: 17, color: m.ink, ...mFont(400) },
  choiceDetail: { fontSize: 14, lineHeight: 20, color: m.muted, marginTop: 4, ...mFont(300) },
  thumbs: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  thumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: m.img },
  wrapped: { width: 40, height: 40, borderRadius: 8, backgroundColor: m.ink, alignItems: 'center', justifyContent: 'center' },
  ribbonV: { position: 'absolute', width: 3, height: 40, backgroundColor: m.gold },
  ribbonH: { position: 'absolute', width: 40, height: 3, backgroundColor: m.gold },
});
