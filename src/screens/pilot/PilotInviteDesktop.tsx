import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { StorefrontArticlePage, type StorefrontArticleBlock } from '../../components/storefront/StorefrontArticlePage';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { CheckoutAddressFields } from '../main/checkout/CheckoutAddressFields';
import { PilotCardField } from './PilotCardField';
import { borderRadius, MOBILE_GUTTER, semanticColors, spacing, typeface, typography } from '../../constants/theme';
import type { MainStackParamList } from '../../navigation/types';
import type { PilotBoxView, PilotDates, PilotItem } from '../../services/pilot/pilotApi';
import { formatPilotDollars } from '../../services/pilot/pilotAgreement';
import { pilotCopy, shortDate, type PilotInviteState } from './usePilotInvite';

type Nav = StackNavigationProp<MainStackParamList>;

const SIGN_IN_CTA = 'Sign in to get started';

function stepsBlock(dates: PilotDates): StorefrontArticleBlock {
  return {
    type: 'steps',
    heading: 'How it works',
    items: pilotCopy.steps(dates).map(([lead, rest]) => ({ title: lead, body: rest })),
  };
}

function finePrintBlock(totalLabel: string | null): StorefrontArticleBlock {
  return { type: 'prose', body: pilotCopy.stepsFine(totalLabel), maxWidth: 480 };
}

function node(content: React.ReactNode): StorefrontArticleBlock {
  return { type: 'node', node: <View style={styles.column}>{content}</View> };
}

/** Compact FAQ: every answer starts closed so the page's last word stays the call to action. */
function Questions() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Questions</Text>
      <View style={styles.rows}>
        {pilotCopy.questions.map(([q, a]) => {
          const isOpen = open === q;
          return (
            <View key={q} style={styles.qaRow}>
              <TouchableOpacity
                style={styles.qaHead}
                onPress={() => setOpen(isOpen ? null : q)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
              >
                <Text style={[styles.qaQuestion, styles.flex]}>{q}</Text>
                <Text style={styles.qaToggle}>{isOpen ? '−' : '+'}</Text>
              </TouchableOpacity>
              {isOpen ? <Text style={styles.qaAnswer}>{a}</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function questionsBlock(): StorefrontArticleBlock {
  return node(<Questions />);
}

function Cta({ label, onPress, disabled, loading, note }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; note?: string | null }) {
  return (
    <View style={styles.ctaWrap}>
      <GrapejuiceButton
        label={label}
        variant="filled"
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        style={styles.cta}
        textStyle={styles.ctaText}
      />
      {note ? <Text style={styles.ctaNote}>{note}</Text> : null}
    </View>
  );
}

function Check({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Icon icon={icons.check} size={13} color={semanticColors.logoDark} /> : null}</View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string | null; children?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Thumb({ uri, size = 40 }: { uri: string | null; size?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {uri ? <Image source={{ uri }} style={styles.thumbImg} resizeMode="contain" /> : null}
    </View>
  );
}

function YourBox({ box, onBuild }: { box: PilotBoxView; onBuild: () => void }) {
  if (box.kind === 'none') {
    return (
      <Section title="Your box" hint={pilotCopy.needBox}>
        <Cta label="Build my box" onPress={onBuild} note={pilotCopy.needBoxFine} />
      </Section>
    );
  }
  return (
    <Section title="Your box" hint={pilotCopy.boxNote}>
      <View style={styles.boxGrid}>
        {box.items.map((it) => (
          <View key={it.itemId} style={styles.boxCell}>
            <View style={styles.boxImage}>
              {it.imageUrl ? <Image source={{ uri: it.imageUrl }} style={styles.thumbImg} resizeMode="contain" /> : null}
              {it.quantity > 1 ? (
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyText}>{`×${it.quantity}`}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.boxName} numberOfLines={2}>
              {it.name}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function ItemCard({ item, chosen, disabled, onPress }: { item: PilotItem; chosen: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: chosen, disabled }}
      accessibilityLabel={`${item.name}, free`}
    >
      <View style={[styles.cardImage, chosen && styles.cardImageOn]}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumbImg} resizeMode="cover" /> : null}
        {chosen ? (
          <View style={styles.cardTick}>
            <Text style={styles.cardTickText}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.cardPrice}>
        <Text style={styles.struck}>{formatPilotDollars(item.memberPriceCents)}</Text>
        {'  '}
        <Text style={styles.free}>Free</Text>
      </Text>
      {item.inBox ? <Text style={styles.cardNote}>Already in your box</Text> : null}
    </TouchableOpacity>
  );
}

function DeadEnd({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <StorefrontArticlePage
      eyebrow={pilotCopy.kicker}
      title={title}
      lead={body}
      leadMaxWidth={560}
      leadBalance
      titleLarge
      primaryCta={action}
      primaryCtaSize="medium"
      showFooterStrips={false}
      blocks={[]}
    />
  );
}

/** Desktop invite page: the /gift article layout (large centered hero, numbered steps, roomy questions, paper band). */
export function PilotInviteDesktop({ s }: { s: PilotInviteState }) {
  const navigation = useNavigation<Nav>();
  const { view } = s;

  if (!s.token || view?.state === 'unavailable') return <DeadEnd {...pilotCopy.unavailable} />;
  if (s.loadError && !view) return <DeadEnd title={pilotCopy.loadFailed} body={s.loadError} action={{ label: 'Try again', onPress: s.reload }} />;
  if (!view) {
    return (
      <StorefrontChrome>
        <View style={styles.loader}>
          <BrandLoadingMark />
        </View>
      </StorefrontChrome>
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

  const hero = {
    eyebrow: pilotCopy.kicker,
    leadMaxWidth: 560,
    leadBalance: true,
    titleLarge: true,
    primaryCtaSize: 'medium' as const,
    showFooterStrips: false,
  };

  if (view.state === 'sign_in') {
    return (
      <StorefrontArticlePage
        {...hero}
        title={pilotCopy.title}
        lead={pilotCopy.intro(view.firstName)}
        primaryCta={{ label: SIGN_IN_CTA, onPress: s.signIn }}
        primaryCtaNote={pilotCopy.signIn(view.maskedEmail)}
        blocks={[
          stepsBlock(view.dates),
          finePrintBlock(null),
          questionsBlock(),
          { type: 'band', heading: 'Sign in', body: pilotCopy.signIn(view.maskedEmail), cta: { label: SIGN_IN_CTA, onPress: s.signIn }, paper: true },
        ]}
      />
    );
  }

  if (view.state === 'joined') {
    const e = view.enrollment;
    const needsCheckout = e.status === 'awaiting_checkout';
    return (
      <StorefrontArticlePage
        {...hero}
        title={pilotCopy.joinedTitle(view.firstName)}
        lead={needsCheckout ? pilotCopy.joinedCheckout : pilotCopy.joinedEmailed(shortDate(view.dates.lockAt, 'Nov 7'))}
        primaryCta={
          needsCheckout
            ? { label: 'Check out', onPress: () => navigation.navigate('Checkout') }
            : { label: 'Edit my box', onPress: () => navigation.navigate('MyBox') }
        }
        blocks={[
          node(
            <Section title="Your picks">
              <View style={styles.rows}>
                {e.picks.map((p) => (
                  <View key={p.itemId} style={styles.itemRow}>
                    <Thumb uri={p.imageUrl} size={48} />
                    <Text style={[styles.rowTitle, styles.flex]}>{p.name}</Text>
                    <Text style={styles.free}>Free</Text>
                  </View>
                ))}
              </View>
            </Section>,
          ),
          { type: 'steps', heading: 'Key dates', items: pilotCopy.joinedDates(view.dates).map(([when, what]) => ({ title: when, body: `${what[0].toUpperCase()}${what.slice(1)}` })) },
          questionsBlock(),
        ]}
      />
    );
  }

  const hasBox = view.box.kind !== 'none';
  const lock = shortDate(view.dates.lockAt, 'Nov 7');
  const picker = hasBox ? (
    <>
      <View ref={s.picksRef}>
        <Section
          title={`Pick ${s.pickCount} of ${s.items.length}`}
          hint={s.full ? 'That’s three. Tap one to swap it out.' : `${s.chosen.length} of ${s.pickCount} chosen`}
        >
          <View style={styles.grid}>
            {s.items.map((item) => {
              const on = s.picks.includes(item.id);
              return <ItemCard key={item.id} item={item} chosen={on} disabled={s.full && !on} onPress={() => s.toggle(item.id)} />;
            })}
          </View>
        </Section>
      </View>

      {s.collectsPayment ? (
        <Section title="Shipping and card" hint={pilotCopy.payHint}>
          <View style={styles.form}>
            <CheckoutAddressFields
              address={s.pay.address}
              onChange={s.pay.onAddressChange}
              fieldErrors={s.pay.fieldErrors}
              {...s.pay.deliverability.fieldsProps}
            />
            {s.pay.formError ? <Text style={checkoutUi.fieldError}>{s.pay.formError}</Text> : null}
            <View ref={s.cardRef}>
              <Text style={[checkoutUi.sectionHeading, styles.cardHeading]}>Card</Text>
              <PilotCardField pay={s.pay} preview={s.preview} />
            </View>
            <Text style={[styles.fine, styles.fineLeft]}>{pilotCopy.cardFine(lock, s.pay.totalLabel)}</Text>
          </View>
        </Section>
      ) : (
        <Section title="Shipping and card">
          <View style={styles.lines}>
            {view.box.address ? <Text style={styles.bodyCenter}>{`Ships to ${view.box.address}`}</Text> : null}
            <Text style={styles.bodyCenter}>{view.box.cardOnFile ? 'Card on file' : 'No card on file yet'}</Text>
            <Text style={styles.fine}>{pilotCopy.cardFine(lock, null)}</Text>
          </View>
        </Section>
      )}

      <Section title="Participant agreement" hint={s.agreement ? null : pilotCopy.agreementPendingNote}>
        <View style={styles.agreement}>
          {(s.agreement ?? pilotCopy.agreementPending).split('\n').map((line) => (
            <Text key={line} style={styles.bodyDark}>
              {line}
            </Text>
          ))}
        </View>
        <View style={styles.form}>
          <Text style={checkoutUi.label}>Typed full name</Text>
          <TextInput
            ref={s.nameRef}
            style={checkoutUi.input}
            value={s.typedName}
            onChangeText={s.setTypedName}
            placeholder="Your full name"
            placeholderTextColor={semanticColors.textTertiary}
            autoComplete="name"
            autoCapitalize="words"
          />
          <Check on={s.agreed} label={pilotCopy.agreeLabel} onPress={() => s.setAgreed((v) => !v)} />
          <Check on={s.quoteConsent} label={pilotCopy.quoteConsent} onPress={() => s.setQuoteConsent((v) => !v)} />
        </View>
      </Section>

      <View>
        <Cta
          label="Join the pilot"
          onPress={() => void s.join()}
          disabled={s.joining}
          loading={s.joining}
          note={s.joinError ? null : !s.canJoin && !s.joining ? s.joinHint : null}
        />
        {s.joinError ? <Text style={styles.error}>{s.joinError}</Text> : null}
      </View>
    </>
  ) : null;

  return (
    <StorefrontArticlePage
      {...hero}
      title={pilotCopy.title}
      lead={pilotCopy.intro(view.firstName)}
      blocks={[
        stepsBlock(view.dates),
        finePrintBlock(s.totalLabel),
        questionsBlock(),
        node(
          <>
            <YourBox box={view.box} onBuild={() => navigation.navigate('MyBox')} />
            {picker}
          </>,
        ),
      ]}
    />
  );
}

const CARD_GAP = 16;
const BOX_GAP = 12;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loader: { minHeight: 480, alignItems: 'center', justifyContent: 'center' },
  column: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    gap: spacing.xxl,
  },
  section: { width: '100%', gap: spacing.sm },
  sectionHeading: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  sectionHint: {
    ...typeface('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  bodyCenter: {
    ...typeface('regular'),
    fontSize: 15,
    lineHeight: 22,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  bodyDark: {
    ...typeface('regular'),
    fontSize: 14,
    lineHeight: 21,
    color: semanticColors.logoDark,
  },
  fine: {
    ...typeface('regular'),
    fontSize: 12,
    lineHeight: 17,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  lines: { gap: 2, alignItems: 'center' },
  rows: { marginTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semanticColors.border },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  rowTitle: { ...typeface('medium'), fontSize: 15, letterSpacing: -0.2, color: semanticColors.logoDark },
  qaRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: semanticColors.border },
  qaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  qaQuestion: { ...typeface('medium'), fontSize: 15, lineHeight: 21, letterSpacing: -0.2, color: semanticColors.logoDark },
  qaToggle: { ...typeface('regular'), fontSize: 20, lineHeight: 21, color: semanticColors.textSecondary, width: 20, textAlign: 'center' },
  qaAnswer: { ...typeface('regular'), fontSize: 14, lineHeight: 21, color: semanticColors.textSecondary, paddingBottom: 14, paddingRight: 28 },
  boxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: BOX_GAP, marginTop: spacing.sm },
  boxCell: {
    width: `calc((100% - ${BOX_GAP * 3}px) / 4)` as unknown as number,
    ...(Platform.OS === 'web' ? null : { width: '23%' }),
    gap: 6,
  },
  boxImage: { width: '100%', aspectRatio: 1, borderRadius: borderRadius.md, backgroundColor: semanticColors.bgElevated, overflow: 'hidden' },
  qtyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 24,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: semanticColors.logoDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { ...typeface('medium'), fontSize: 11, color: semanticColors.bgPrimary },
  boxName: { ...typeface('regular'), fontSize: 13, lineHeight: 17, color: semanticColors.logoDark, textAlign: 'center' },
  cardHeading: { marginTop: spacing.lg },
  fineLeft: { textAlign: 'left', marginTop: spacing.sm },
  thumb: { borderRadius: borderRadius.md, backgroundColor: semanticColors.bgElevated, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginTop: spacing.sm },
  card: {
    width: `calc((100% - ${CARD_GAP * 2}px) / 3)` as unknown as number,
    ...(Platform.OS === 'web' ? null : { width: '31%' }),
    gap: 4,
  },
  cardOff: { opacity: 0.4 },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    backgroundColor: semanticColors.bgElevated,
    overflow: 'hidden',
    marginBottom: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardImageOn: { borderColor: semanticColors.brand },
  cardTick: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTickText: { ...typeface('medium'), fontSize: typography.sm, color: semanticColors.logoDark },
  cardName: { ...typeface('medium'), fontSize: 15, lineHeight: 19, letterSpacing: -0.2, color: semanticColors.logoDark },
  cardPrice: { ...typeface('regular'), fontSize: typography.md },
  cardNote: { ...typeface('regular'), fontSize: 12, color: semanticColors.textTertiary },
  struck: { color: semanticColors.textTertiary, textDecorationLine: 'line-through' },
  free: { ...typeface('medium'), fontSize: typography.md, color: semanticColors.logoDark },
  agreement: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.accentCream,
    marginTop: spacing.xs,
  },
  form: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
  },
  checkboxOn: { backgroundColor: semanticColors.brand },
  checkLabel: { ...typeface('regular'), fontSize: typography.md, letterSpacing: -0.22, flex: 1, color: semanticColors.logoDark },
  ctaWrap: { alignItems: 'center' },
  cta: { alignSelf: 'center', borderRadius: borderRadius.md, paddingVertical: 16, paddingHorizontal: 32 },
  ctaText: { ...typeface('medium'), fontSize: 18, lineHeight: 24, letterSpacing: -0.25, color: semanticColors.logoDark },
  ctaNote: {
    ...typeface('regular'),
    fontSize: 12,
    lineHeight: 17,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 360,
  },
  error: { ...typeface('regular'), fontSize: typography.md, color: semanticColors.error, textAlign: 'center', marginTop: spacing.sm },
});
