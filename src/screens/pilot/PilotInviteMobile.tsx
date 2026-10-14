import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { BoxSummary, type BoxThumb } from '../../components/mobile/BoxSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileField } from '../../components/mobile/MobileField';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { StickyBar } from '../../components/mobile/StickyBar';
import { MobileFooterBleed, MobileFooterSpacer, mobileFooterScrollStyle } from '../../components/mobile/MobileFooter';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { MobileDoneLayout } from '../mobile/MobileCheckoutParts';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { PilotCardField } from './PilotCardField';
import type { MainStackParamList } from '../../navigation/types';
import type { PilotBoxView, PilotDates, PilotItem } from '../../services/pilot/pilotApi';
import { formatPilotDollars } from '../../services/pilot/pilotAgreement';
import { pilotCopy, shortDate, type PilotInviteState } from './usePilotInvite';

type Nav = StackNavigationProp<MainStackParamList>;

const HEADER_TITLE = 'Pilot Participants';

function Page({ children, bar }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <TaskHeader title={HEADER_TITLE} />
      <ScrollView style={styles.flex} contentContainerStyle={[styles.pad, mobileFooterScrollStyle]} keyboardShouldPersistTaps="handled">
        {children}
        <View style={styles.footerGap} />
        <MobileFooterSpacer />
        <MobileFooterBleed inset={mGutter} />
      </ScrollView>
      {bar}
    </View>
  );
}

function Check({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.checkRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[styles.checkBox, on && styles.checkBoxOn]}>{on ? <Icon icon={icons.check} size={12} color={m.gold} /> : null}</View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function Hero({ firstName, lock, cta }: { firstName: string; lock: string; cta?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.hero}>
      <View style={styles.banner}>
        <Icon icon={icons.gift} size={14} color={m.goldDark} />
        <Text style={styles.bannerText}>{`${pilotCopy.kicker} · join by ${lock}`}</Text>
      </View>
      <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
        {pilotCopy.title}
      </Text>
      <Text style={styles.lede}>{pilotCopy.intro(firstName)}</Text>
      {cta ? <MobileButton label={cta.label} onPress={cta.onPress} height={54} style={styles.heroCta} /> : null}
    </View>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.h2}>{title}</Text>
      {sub ? <Text style={mType.small}>{sub}</Text> : null}
    </View>
  );
}

function HowItWorks({ dates, totalLabel }: { dates: PilotDates; totalLabel: string | null }) {
  return (
    <View style={styles.creamBand}>
      <Text style={[styles.h2, styles.bandHeading]}>How it works</Text>
      <View style={styles.steps}>
        {pilotCopy.steps(dates).map(([lead, rest], i) => (
          <View key={lead} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.stepTitle}>{lead.replace(/\.$/, '')}</Text>
              <Text style={styles.stepBody} {...balanceProps}>
                {rest}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={[mType.small, styles.bandFine]}>{pilotCopy.stepsFine(totalLabel)}</Text>
    </View>
  );
}

function YourBox({ box, onBuild }: { box: PilotBoxView; onBuild: () => void }) {
  if (box.kind === 'none') {
    return (
      <View style={styles.section}>
        <SectionHead title="Your box" />
        <Text style={mType.body}>{pilotCopy.needBox}</Text>
        <MobileButton label="Build my box" onPress={onBuild} style={styles.buttonTop} />
        <Text style={[mType.small, styles.fine]}>{pilotCopy.needBoxFine}</Text>
      </View>
    );
  }
  const thumbs: BoxThumb[] = box.items.map((it) => ({ id: it.itemId, imageUrl: it.imageUrl, count: it.quantity > 1 ? it.quantity : undefined }));
  const count = box.items.reduce((s, it) => s + it.quantity, 0);
  return (
    <View style={styles.section}>
      <BoxSummary size="sm" title="Your box" sub={pilotCopy.boxCount(count)} items={thumbs} />
    </View>
  );
}

function Tile({ item, chosen, disabled, onPress }: { item: PilotItem; chosen: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.tile, disabled && styles.tileOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: chosen, disabled }}
      accessibilityLabel={`${item.name}, free`}
    >
      <View style={[styles.tileImage, chosen && styles.tileImageOn]}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}
        {chosen ? (
          <View style={styles.tick}>
            <Icon icon={icons.check} size={11} color={m.ink} />
          </View>
        ) : null}
      </View>
      <Text style={styles.tileName} numberOfLines={2} {...balanceProps}>
        {item.name}
      </Text>
      <Text style={styles.tilePrice}>
        <Text style={styles.struck}>{formatPilotDollars(item.memberPriceCents)}</Text>
        {'  '}
        <Text style={styles.free}>Free</Text>
      </Text>
      {item.inBox ? <Text style={mType.tiny}>Already in your box</Text> : null}
    </Pressable>
  );
}

function firstSentence(text: string): string {
  const match = /^.*?[.?!](\s|$)/.exec(text);
  return (match ? match[0] : text).trim();
}

function Questions() {
  const [open, setOpen] = useState<readonly [string, string] | null>(null);
  return (
    <View style={styles.section}>
      <Text style={[styles.h2, styles.questionsHeading]}>Questions</Text>
      {pilotCopy.questions.map((qa) => (
        <Pressable key={qa[0]} onPress={() => setOpen(qa)} accessibilityRole="button" style={styles.qRow}>
          <View style={styles.flex}>
            <Text style={styles.qTitle}>{qa[0]}</Text>
            <Text style={styles.qBody} numberOfLines={1}>
              {firstSentence(qa[1])}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
      <MobileSheet visible={open != null} onClose={() => setOpen(null)} title={open?.[0] ?? ''}>
        <Text style={styles.sheetBody}>{open?.[1]}</Text>
      </MobileSheet>
    </View>
  );
}

function DeadEnd({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Page>
      <View style={styles.deadEnd}>
        <Text style={mType.h1} {...balanceProps}>
          {title}
        </Text>
        <Text style={mType.body} {...balanceProps}>
          {body}
        </Text>
        {action ? <MobileButton label={action.label} onPress={action.onPress} style={styles.buttonTop} /> : null}
      </View>
    </Page>
  );
}

/** Phone invite page: task header, the mobile type scale and tiles, and the sticky join bar. */
export function PilotInviteMobile({ s }: { s: PilotInviteState }) {
  const navigation = useNavigation<Nav>();
  const { view } = s;

  if (!s.token || view?.state === 'unavailable') return <DeadEnd {...pilotCopy.unavailable} />;
  if (s.loadError && !view) return <DeadEnd title={pilotCopy.loadFailed} body={s.loadError} action={{ label: 'Try again', onPress: s.reload }} />;
  if (!view) {
    return (
      <View style={styles.root}>
        <TaskHeader title={HEADER_TITLE} />
        <View style={styles.loader}>
          <BrandLoadingMark />
        </View>
      </View>
    );
  }
  if (view.state === 'closed') return <DeadEnd {...pilotCopy.closed} />;
  if (view.state === 'wrong_account') {
    return (
      <DeadEnd
        title={`Hi ${view.firstName || 'there'}`}
        body={pilotCopy.wrongAccount(view.maskedEmail)}
        action={{ label: 'Sign in with that email', onPress: () => void s.switchAccount() }}
      />
    );
  }

  const lock = shortDate(view.dates.lockAt, 'Nov 7');

  if (view.state === 'sign_in') {
    const signIn = { label: 'Sign in to get started', onPress: s.signIn };
    return (
      <Page>
        <Hero firstName={view.firstName} lock={lock} cta={signIn} />
        <HowItWorks dates={view.dates} totalLabel={null} />
        <Questions />
        <View style={[styles.creamBand, styles.closingBand]}>
          <Text style={[styles.h2, styles.bandHeading]}>Sign in</Text>
          <Text style={[styles.lede, styles.bandBody]}>{pilotCopy.signIn(view.maskedEmail)}</Text>
          <View style={styles.bandCta}>
            <MobileButton label={signIn.label} onPress={signIn.onPress} height={54} />
          </View>
        </View>
      </Page>
    );
  }

  if (view.state === 'joined') {
    const e = view.enrollment;
    const needsCheckout = e.status === 'awaiting_checkout';
    const steps = pilotCopy.joinedDates(view.dates).map(([when, what]): [string, string] => [when, `${what[0].toUpperCase()}${what.slice(1)}.`]);
    return (
      <MobileDoneLayout title={pilotCopy.joinedTitle(view.firstName)} lede={needsCheckout ? pilotCopy.joinedCheckout : pilotCopy.joinedEmailed(shortDate(view.dates.lockAt, 'Nov 7'))} steps={steps}>
        <BoxSummary
          size="sm"
          title="Your picks"
          sub="Free · ship inside your box"
          items={e.picks.map((p) => ({ id: p.itemId, imageUrl: p.imageUrl, mine: true }))}
        >
          <View style={styles.pickNames}>
            {e.picks.map((p) => (
              <Text key={p.itemId} style={mType.small}>
                {p.name}
              </Text>
            ))}
          </View>
        </BoxSummary>
        {needsCheckout ? (
          <MobileButton label="Check out" onPress={() => navigation.navigate('Checkout')} style={styles.buttonTop} />
        ) : (
          <MobileButton label="Edit my box" onPress={() => navigation.navigate('MyBox')} style={styles.buttonTop} />
        )}
        <Questions />
      </MobileDoneLayout>
    );
  }

  const hasBox = view.box.kind !== 'none';
  const bar = hasBox ? (
    <StickyBar
      layout="stack"
      label={s.full ? 'Your three picks' : `${s.chosen.length} of ${s.pickCount} picked`}
      total={s.full && s.totalLabel ? `${s.totalLabel} value · Free` : 'Free'}
      hint={s.joinError ?? (!s.canJoin && !s.joining ? (s.joinHint ?? undefined) : undefined)}
      cta={{ label: 'Join the pilot', onPress: () => void s.join(), disabled: !s.canJoin, busy: s.joining }}
    />
  ) : null;

  return (
    <Page bar={bar}>
      <Hero firstName={view.firstName} lock={lock} />
      <HowItWorks dates={view.dates} totalLabel={s.totalLabel} />
      <Questions />
      <YourBox box={view.box} onBuild={() => navigation.navigate('MyBox')} />

      {hasBox ? (
        <>
          <View style={styles.section}>
            <SectionHead
              title={`Pick ${s.pickCount} of ${s.items.length}`}
              sub={s.full ? 'Tap one to swap it' : `${s.chosen.length} of ${s.pickCount} chosen`}
            />
            <View style={styles.grid}>
              {s.items.map((item) => {
                const on = s.picks.includes(item.id);
                return <Tile key={item.id} item={item} chosen={on} disabled={s.full && !on} onPress={() => s.toggle(item.id)} />;
              })}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHead title="Shipping and card" />
            {s.collectsPayment ? (
              <>
                <Text style={[mType.small, styles.payHint]}>{pilotCopy.payHint}</Text>
                <CheckoutAddressFields
                  address={s.pay.address}
                  onChange={s.pay.onAddressChange}
                  fieldErrors={s.pay.fieldErrors}
                  heading=""
                  hint=""
                  {...s.pay.deliverability.fieldsProps}
                />
                {s.pay.formError ? <Text style={styles.error}>{s.pay.formError}</Text> : null}
                <Text style={[mType.bodyStrong, styles.cardHeading]}>Card</Text>
                <PilotCardField pay={s.pay} preview={s.preview} mobile />
              </>
            ) : (
              <>
                {view.box.address ? <Text style={mType.bodyStrong}>{`Ships to ${view.box.address}`}</Text> : null}
                <Text style={mType.body}>{view.box.cardOnFile ? 'Card on file' : 'No card on file yet'}</Text>
              </>
            )}
            <Text style={[mType.small, styles.fine]}>{pilotCopy.cardFine(lock, s.collectsPayment ? s.pay.totalLabel : null)}</Text>
          </View>

          <View style={styles.section}>
            <SectionHead title="Participant agreement" />
            <View style={styles.agreement}>
              {(s.agreement ?? pilotCopy.agreementPending).split('\n').map((line) => (
                <Text key={line} style={styles.agreementText}>
                  {line}
                </Text>
              ))}
            </View>
            {s.agreement ? null : <Text style={[mType.small, styles.agreementPending]}>{pilotCopy.agreementPendingNote}</Text>}
            <MobileField
              label="Typed full name"
              value={s.typedName}
              onChangeText={s.setTypedName}
              placeholder="Your full name"
              autoComplete="name"
              autoCapitalize="words"
            />
            <Check on={s.agreed} label={pilotCopy.agreeLabel} onPress={() => s.setAgreed((v) => !v)} />
            <Check on={s.quoteConsent} label={pilotCopy.quoteConsent} onPress={() => s.setQuoteConsent((v) => !v)} />
          </View>
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingHorizontal: mGutter },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingTop: 36, paddingBottom: 40, gap: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingVertical: 6, paddingLeft: 8, paddingRight: 12, borderRadius: 16, backgroundColor: m.beige, marginBottom: 10 },
  bannerText: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  h1: { fontSize: 32, lineHeight: 36, letterSpacing: -1, color: m.ink, ...mFont(400) },
  lede: { fontSize: 15.5, lineHeight: 23, color: m.body, ...mFont(300) },
  heroCta: { marginTop: 4 },
  h2: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(400) },
  creamBand: { marginHorizontal: -mGutter, paddingHorizontal: mGutter, paddingVertical: 36, backgroundColor: m.beige },
  closingBand: { marginTop: 36 },
  bandHeading: { marginBottom: 18 },
  bandBody: { marginTop: -8 },
  bandCta: { marginTop: 20 },
  bandFine: { marginTop: 20 },
  section: { marginTop: 32 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 },
  steps: { gap: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: m.white, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 15, color: m.goldDark, ...mFont(500) },
  stepTitle: { fontSize: 16, lineHeight: 22, color: m.ink, ...mFont(500) },
  stepBody: { fontSize: 14, lineHeight: 20, color: m.muted, ...mFont(400) },
  questionsHeading: { marginBottom: 6 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  qTitle: { fontSize: 15.5, lineHeight: 21, color: m.ink, ...mFont(400) },
  qBody: { fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 2, ...mFont(300) },
  chev: { fontSize: 20, color: m.goldDark, ...mFont(400) },
  sheetBody: { fontSize: 15, lineHeight: 23, color: m.body, ...mFont(300) },
  fine: { marginTop: 12 },
  buttonTop: { marginTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 },
  tile: { width: '48%', gap: 4 },
  tileOff: { opacity: 0.45 },
  tileImage: { width: '100%', aspectRatio: 1, borderRadius: mRadius.md, overflow: 'hidden', backgroundColor: m.img, marginBottom: 4 },
  tileImageOn: { borderWidth: 2, borderColor: m.gold },
  img: { width: '100%', height: '100%' },
  tick: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  tileName: { fontSize: 14, lineHeight: 18, color: m.ink, ...mFont(400) },
  tilePrice: { fontSize: 13, lineHeight: 18, ...mFont(400) },
  struck: { color: m.muted, textDecorationLine: 'line-through' },
  free: { color: m.goldDark, ...mFont(500) },
  agreement: { backgroundColor: m.beige, borderRadius: mRadius.md, padding: 14, gap: 10, marginBottom: 16 },
  agreementText: { fontSize: 14, lineHeight: 20, color: m.ink, ...mFont(400) },
  agreementPending: { marginTop: -8, marginBottom: 16 },
  payHint: { marginTop: -4, marginBottom: 14 },
  cardHeading: { marginTop: 20, marginBottom: 10 },
  error: { fontSize: 13, color: m.warn, marginTop: 8, ...mFont(400) },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  checkBoxOn: { backgroundColor: m.ink, borderColor: m.ink },
  checkLabel: { flex: 1, fontSize: 14, lineHeight: 19, color: m.body, ...mFont(400) },
  pickNames: { gap: 2 },
  deadEnd: { gap: 10, paddingTop: 28 },
  footerGap: { height: 56 },
});
