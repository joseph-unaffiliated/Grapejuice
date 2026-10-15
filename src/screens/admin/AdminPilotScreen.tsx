import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isOpsAdmin } from '../../constants/admin';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useViewportPinnedHeight } from '../../components/storefront/storefrontViewport';
import { useThemeMode } from '../../context/ThemeContext';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mGutter } from '../../components/mobile/mobileTheme';
import { paintOpsMobile } from './opsMobileSkin';
import { spacing, typography, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';
import { adminPilot, type AdminPilotInvite } from '../../services/pilot/pilotApi';
import { copyText } from '../../services/promo/copyText';
import {
  Button,
  Chip,
  confirmAction,
  createStyles as createSectionStyles,
  day,
  errMsg,
  Fact,
  Field,
  money,
  Notice,
  useAdminList,
  type Styles,
} from './AdminPromotionsSections';

type Nav = StackNavigationProp<MainStackParamList>;

const STATUS_LABEL: Record<string, string> = {
  invited: 'invited',
  opened: 'opened',
  joined: 'joined · needs checkout',
  awaiting_checkout: 'joined · needs checkout',
  enrolled: 'enrolled',
  cancelled: 'cancelled',
};

function CopyLinkRow({ link, styles }: { link: string; styles: Styles }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <View style={styles.linkRow}>
      <Text style={styles.link} selectable numberOfLines={1}>
        {link}
      </Text>
      <Chip label={copied ? 'Copied' : 'Copy link'} onPress={() => void copy()} styles={styles} />
    </View>
  );
}

type CheckStyles = ReturnType<typeof createCheckStyles>;

function SentCheck({
  label,
  at,
  onToggle,
  styles,
  check,
}: {
  label: string;
  at: string | null;
  onToggle: () => void;
  styles: Styles;
  check: CheckStyles;
}) {
  return (
    <TouchableOpacity
      style={check.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!at }}
      hitSlop={6}
    >
      <View style={[check.box, at ? check.boxOn : null]}>{at ? <Text style={check.tick}>✓</Text> : null}</View>
      <Text style={styles.fact}>{at ? `${label} ${day(at)}` : label}</Text>
    </TouchableOpacity>
  );
}

function InviteRow({
  inv,
  onChanged,
  styles,
  check,
}: {
  inv: AdminPilotInvite;
  onChanged: () => Promise<void>;
  styles: Styles;
  check: CheckStyles;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [emailedAt, setEmailedAt] = useState(inv.emailedAt);
  const [followUpAt, setFollowUpAt] = useState(inv.followUpAt);
  useEffect(() => setEmailedAt(inv.emailedAt), [inv.emailedAt]);
  useEffect(() => setFollowUpAt(inv.followUpAt), [inv.followUpAt]);
  const joined = !!inv.joinedAt;
  const toggle = async (kind: 'emailed' | 'followUp') => {
    const current = kind === 'emailed' ? emailedAt : followUpAt;
    const set = kind === 'emailed' ? setEmailedAt : setFollowUpAt;
    set(current ? null : new Date().toISOString());
    setMsg(null);
    try {
      const res = await (kind === 'emailed' ? adminPilot.markEmailed : adminPilot.markFollowUp)(inv.token, !current);
      set(res.at);
      await onChanged();
    } catch (err) {
      set(current);
      setMsg(errMsg(err));
    }
  };
  const cancel = async () => {
    if (!confirmAction(`Cancel ${inv.name}’s invite? The link will stop working.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminPilot.cancelInvite(inv.token);
      await onChanged();
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <View style={styles.rowHead}>
        <Text style={styles.cardTitle}>{`${inv.name} · ${inv.email}`}</Text>
        <View style={styles.chipRow}>
          {inv.source === 'auto' ? <Text style={styles.badge}>Auto</Text> : null}
          <Text style={[styles.badge, inv.status === 'enrolled' ? styles.badgeOn : null]}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
        </View>
      </View>
      <View style={styles.facts}>
        <Fact
          k="Invited"
          v={`${day(inv.createdAt)} ${inv.source === 'auto' ? 'automatically' : `by ${inv.createdByEmail || '—'}`}`}
          styles={styles}
        />
        {inv.jewishScore != null ? <Fact k="Jewish score" v={String(inv.jewishScore)} styles={styles} /> : null}
        <Fact k="Account" v={inv.accountCreated ? 'Created for them' : 'Already existed'} styles={styles} />
        <Fact k="Opened" v={day(inv.openedAt)} styles={styles} />
        {joined ? <Fact k="Joined" v={day(inv.joinedAt)} styles={styles} /> : null}
        {joined ? <Fact k="Value" v={money(inv.deferredTotalCents)} styles={styles} /> : null}
        {joined ? <Fact k="May quote" v={inv.quoteConsent ? 'Yes, first name' : 'No'} styles={styles} /> : null}
      </View>
      {inv.picks.length ? <Text style={styles.caption}>{inv.picks.join(' · ')}</Text> : null}
      {inv.status !== 'cancelled' ? <CopyLinkRow link={inv.link} styles={styles} /> : null}
      {inv.status !== 'cancelled' ? (
        <View style={check.group}>
          <SentCheck label="Emailed" at={emailedAt} onToggle={() => void toggle('emailed')} styles={styles} check={check} />
          <SentCheck label="Follow-up sent" at={followUpAt} onToggle={() => void toggle('followUp')} styles={styles} check={check} />
        </View>
      ) : null}
      {!joined && inv.status !== 'cancelled' ? (
        <View style={styles.chipRow}>
          <Chip label={busy ? 'Cancelling…' : 'Cancel invite'} onPress={() => void cancel()} styles={styles} />
        </View>
      ) : null}
      {msg ? <Text style={styles.error}>{msg}</Text> : null}
    </View>
  );
}

type Filter = 'all' | 'notEmailed' | 'needsFollowUp' | 'joined';

const FILTERS: Array<{ id: Filter; label: string; match: (i: AdminPilotInvite) => boolean }> = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'notEmailed', label: 'Not emailed yet', match: (i) => i.status !== 'cancelled' && !i.joinedAt && !i.emailedAt },
  {
    id: 'needsFollowUp',
    label: 'Emailed, no follow-up',
    match: (i) => i.status !== 'cancelled' && !i.joinedAt && !!i.emailedAt && !i.followUpAt,
  },
  { id: 'joined', label: 'Joined', match: (i) => !!i.joinedAt },
];

function AutoInviteCard({ onChanged, styles }: { onChanged: () => Promise<void>; styles: Styles }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await adminPilot.autoInvite();
      setNotice({
        ok: true,
        text: res.locked
          ? 'Boxes are locked, so no new invites were made.'
          : res.created
            ? `Created ${res.created} invite${res.created === 1 ? '' : 's'}.`
            : 'No new families to invite right now.',
      });
      await onChanged();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Automatic invites</Text>
      <Text style={styles.caption}>
        Families get a link automatically when their Jewish score is under 50, we have their email and a first name (not just an
        initial), and they’ve built a box but haven’t checked out. Test accounts and anyone already invited (even if cancelled) are
        skipped. Checks every hour; use the button to check now.
      </Text>
      <View style={styles.chipRow}>
        <Button label="Find new families" onPress={() => void run()} busy={busy} styles={styles} />
      </View>
      <Notice ok={notice?.ok ?? false} text={notice?.text ?? null} styles={styles} />
    </View>
  );
}

function PilotSection({ styles, colors }: { styles: Styles; colors: SemanticColors }) {
  const { rows, error, reload } = useAdminList(adminPilot.list);
  const check = useMemo(() => createCheckStyles(colors), [colors]);
  const [filter, setFilter] = useState<Filter>('all');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const create = async () => {
    const to = email.trim().toLowerCase();
    if (!to.includes('@')) return setNotice({ ok: false, text: 'Enter an email address.' });
    if (!name.trim()) return setNotice({ ok: false, text: 'Enter their name.' });
    setBusy(true);
    setNotice(null);
    setCreated(null);
    try {
      const res = await adminPilot.createInvite({ email: to, name: name.trim() });
      setCreated(res.link);
      setNotice({
        ok: true,
        text: res.existing
          ? `${to} already has an invite. Here’s their link.`
          : res.accountCreated
            ? `Link ready for ${to}. They didn’t have an account, so one was created: they sign in with “email me a link”.`
            : `Link ready for ${to}.`,
      });
      setEmail('');
      setName('');
      await reload();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  const list = rows ?? [];
  const count = (s: (i: AdminPilotInvite) => boolean) => list.filter(s).length;
  const live = (i: AdminPilotInvite) => i.status !== 'cancelled';
  const shown = list.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>
        Makes a personal link for someone to join Pilot Participants. Nothing is emailed from here: copy the link and send it yourself. If
        there’s no account for that email, one is created and they sign in with “email me a link”. Links stop working when boxes lock.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invite someone</Text>
        <View style={styles.formRow}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" width={280} styles={styles} colors={colors} />
          <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" width={240} styles={styles} colors={colors} />
        </View>
        <View style={styles.chipRow}>
          <Button label="Create link" onPress={() => void create()} busy={busy} styles={styles} />
        </View>
        <Notice ok={notice?.ok ?? false} text={notice?.text ?? null} styles={styles} />
        {created ? <CopyLinkRow link={created} styles={styles} /> : null}
      </View>

      <AutoInviteCard onChanged={reload} styles={styles} />

      <Text style={styles.caption}>
        {rows
          ? [
              `${count(live)} invited (${count((i) => live(i) && i.source === 'auto')} auto)`,
              `${count((i) => live(i) && !!i.emailedAt)} emailed`,
              `${count((i) => live(i) && !!i.followUpAt)} followed up`,
              `${count((i) => !!i.openedAt)} opened`,
              `${count((i) => !!i.joinedAt)} joined`,
              `${count((i) => i.status === 'enrolled')} enrolled`,
            ].join(' · ')
          : error ?? 'Loading invites…'}
      </Text>
      {rows && error ? <Text style={styles.error}>{error}</Text> : null}
      {rows ? (
        <View style={styles.chipRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={`${f.label} (${count(f.match)})`}
              active={filter === f.id}
              onPress={() => setFilter(f.id)}
              styles={styles}
            />
          ))}
        </View>
      ) : null}
      {shown.map((inv) => (
        <InviteRow key={inv.token} inv={inv} onChanged={reload} styles={styles} check={check} />
      ))}
    </View>
  );
}

/** Pilot Participants invites and who joined — admin-gated. */
export function AdminPilotScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const mobile = useMobileLayout();
  const insets = useSafeAreaInsets();
  const baseStyles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const styles = useMemo(() => (mobile ? paintOpsMobile(baseStyles) : baseStyles), [mobile, baseStyles]);
  const sectionStyles = useMemo(() => {
    const base = createSectionStyles(colors);
    return mobile ? paintOpsMobile(base) : base;
  }, [colors, mobile]);
  const user = useAuthStore((s) => s.user);
  const allowed = isOpsAdmin(user);
  const hostRef = useRef<View>(null);
  const pinnedHeight = useViewportPinnedHeight(hostRef, true);
  const hostStyle = [styles.host, pinnedHeight != null ? { height: pinnedHeight, maxHeight: pinnedHeight } : null];
  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <View ref={hostRef} style={hostStyle}>
        <WebContentPanel {...panelProps}>
          <View style={styles.centered}>
            <Text style={styles.title}>Admin only</Text>
            <Text style={styles.hint}>This page is limited to allowlisted ops accounts.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      </View>
    );
  }

  return (
    <View ref={hostRef} style={hostStyle}>
      <WebContentPanel {...panelProps}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={[
            styles.content,
            mobile && { paddingTop: 12 + insets.top, paddingBottom: 96 + insets.bottom, paddingHorizontal: mGutter },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
            <Text style={styles.backLink}>← Account</Text>
          </TouchableOpacity>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Pilot Participants</Text>
            <Text style={styles.subtitle}>Invite links, picks and agreements</Text>
          </View>
          <View style={styles.sectionDivider} />
          <PilotSection styles={sectionStyles} colors={colors} />
        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

function createCheckStyles(colors: SemanticColors) {
  return StyleSheet.create({
    group: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
    box: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: colors.brand },
    tick: { ...typeface('medium'), fontSize: 12, lineHeight: 14, color: colors.bgPrimary },
  });
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    host: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    panel: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 1120 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    backWrap: { alignSelf: 'flex-start' },
    backLink: { ...typeface('regular'), fontSize: typography.md, color: colors.textSecondary, letterSpacing: -0.22 },
    headerBlock: { alignItems: 'center', marginTop: spacing.sm },
    title: { ...typeface('medium'), fontSize: 36, letterSpacing: -0.8, color: colors.textPrimary, textAlign: 'center' },
    subtitle: {
      ...typeface('light'),
      fontSize: typography.lg,
      marginTop: spacing.sm,
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    hint: { ...typeface('regular'), fontSize: typography.md, letterSpacing: -0.22, color: colors.textSecondary, lineHeight: 18 },
    sectionDivider: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
  });
}
