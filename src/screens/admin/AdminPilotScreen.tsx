import React, { useMemo, useRef, useState } from 'react';
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

function InviteRow({ inv, onChanged, styles }: { inv: AdminPilotInvite; onChanged: () => Promise<void>; styles: Styles }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const joined = !!inv.joinedAt;
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
        <Text style={[styles.badge, inv.status === 'enrolled' ? styles.badgeOn : null]}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
      </View>
      <View style={styles.facts}>
        <Fact k="Invited" v={`${day(inv.createdAt)} by ${inv.createdByEmail || '—'}`} styles={styles} />
        <Fact k="Account" v={inv.accountCreated ? 'Created for them' : 'Already existed'} styles={styles} />
        <Fact k="Opened" v={day(inv.openedAt)} styles={styles} />
        {joined ? <Fact k="Joined" v={day(inv.joinedAt)} styles={styles} /> : null}
        {joined ? <Fact k="Value" v={money(inv.deferredTotalCents)} styles={styles} /> : null}
        {joined ? <Fact k="May quote" v={inv.quoteConsent ? 'Yes, first name' : 'No'} styles={styles} /> : null}
      </View>
      {inv.picks.length ? <Text style={styles.caption}>{inv.picks.join(' · ')}</Text> : null}
      {inv.status !== 'cancelled' ? <CopyLinkRow link={inv.link} styles={styles} /> : null}
      {!joined && inv.status !== 'cancelled' ? (
        <View style={styles.chipRow}>
          <Chip label={busy ? 'Cancelling…' : 'Cancel invite'} onPress={() => void cancel()} styles={styles} />
        </View>
      ) : null}
      {msg ? <Text style={styles.error}>{msg}</Text> : null}
    </View>
  );
}

function PilotSection({ styles, colors }: { styles: Styles; colors: SemanticColors }) {
  const { rows, error, reload } = useAdminList(adminPilot.list);
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

      <Text style={styles.caption}>
        {rows
          ? `${count((i) => i.status !== 'cancelled')} invited · ${count((i) => !!i.openedAt)} opened · ${count((i) => !!i.joinedAt)} joined · ${count((i) => i.status === 'enrolled')} enrolled`
          : error ?? 'Loading invites…'}
      </Text>
      {rows && error ? <Text style={styles.error}>{error}</Text> : null}
      {list.map((inv) => (
        <InviteRow key={inv.token} inv={inv} onChanged={reload} styles={styles} />
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
