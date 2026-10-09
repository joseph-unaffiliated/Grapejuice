import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import {
  adminPromotions,
  type AdminCreditGrant,
  type AdminDiscountCode,
  type AdminInfluencer,
} from '../../services/promo/promotionsApi';
import { copyText } from '../../services/promo/copyText';

export type PromotionsTab = 'discounts' | 'credit' | 'influencers';

type Styles = ReturnType<typeof createStyles>;
type TermsKind = 'none' | 'percent' | 'dollars';

function money(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** ISO → YYYY-MM-DD in the admin's local time zone, for the date inputs. */
function toInputDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD → start or end of that local day as ISO; '' → null. */
function fromInputDate(raw: string, endOfDay: boolean): string | null | { error: string } {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: `Use YYYY-MM-DD for dates (got “${s}”).` };
  const d = new Date(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  if (Number.isNaN(d.getTime())) return { error: `Not a date: ${s}` };
  return d.toISOString();
}

function errMsg(err: unknown): string {
  const msg = (err as { message?: string })?.message;
  return msg ? msg.replace(/^FirebaseError:\s*/, '') : 'Something went wrong.';
}

function confirmAction(message: string): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  return true;
}

function dollarsToCents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''));
  return raw.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
}

function termsFromForm(kind: TermsKind, amount: string): { percentOff: number | null; amountOffCents: number | null } {
  if (kind === 'percent') return { percentOff: Number(amount) || null, amountOffCents: null };
  if (kind === 'dollars') return { percentOff: null, amountOffCents: dollarsToCents(amount) };
  return { percentOff: null, amountOffCents: null };
}

function termsToForm(t: { percentOff: number | null; amountOffCents: number | null }): { kind: TermsKind; amount: string } {
  if (t.percentOff) return { kind: 'percent', amount: String(t.percentOff) };
  if (t.amountOffCents) return { kind: 'dollars', amount: (t.amountOffCents / 100).toFixed(2) };
  return { kind: 'none', amount: '' };
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function useAdminList<T>(load: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setRows(await load());
      setError(null);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { rows, error, reload };
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function Chip({ label, active, onPress, styles }: { label: string; active?: boolean; onPress: () => void; styles: Styles }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Button({
  label,
  onPress,
  busy,
  disabled,
  quiet,
  styles,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  quiet?: boolean;
  styles: Styles;
}) {
  const off = disabled || busy;
  return (
    <TouchableOpacity
      style={[quiet ? styles.buttonQuiet : styles.button, off && styles.buttonOff]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
    >
      <Text style={quiet ? styles.buttonQuietLabel : styles.buttonLabel}>{busy ? 'Saving…' : label}</Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  editable = true,
  keyboardType,
  width,
  styles,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'number-pad';
  width?: number;
  styles: Styles;
  colors: SemanticColors;
}) {
  return (
    <View style={[styles.field, width ? { flexBasis: width, maxWidth: width } : null]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputLocked]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
      />
      {hint ? <Text style={styles.caption}>{hint}</Text> : null}
    </View>
  );
}

function TermsPicker({
  kind,
  amount,
  allowNone,
  onKind,
  onAmount,
  styles,
  colors,
}: {
  kind: TermsKind;
  amount: string;
  allowNone: boolean;
  onKind: (k: TermsKind) => void;
  onAmount: (v: string) => void;
  styles: Styles;
  colors: SemanticColors;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Discount</Text>
      <View style={styles.chipRow}>
        {allowNone ? <Chip label="No discount" active={kind === 'none'} onPress={() => onKind('none')} styles={styles} /> : null}
        <Chip label="% off" active={kind === 'percent'} onPress={() => onKind('percent')} styles={styles} />
        <Chip label="$ off" active={kind === 'dollars'} onPress={() => onKind('dollars')} styles={styles} />
        {kind !== 'none' ? (
          <TextInput
            style={[styles.input, styles.inputShort]}
            value={amount}
            onChangeText={onAmount}
            placeholder={kind === 'percent' ? '10' : '20.00'}
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            accessibilityLabel={kind === 'percent' ? 'Percent off' : 'Dollars off'}
          />
        ) : null}
      </View>
      <Text style={styles.caption}>Applies to the order before credit, never to shipping or tax.</Text>
    </View>
  );
}

function Fact({ k, v, styles }: { k: string; v: string; styles: Styles }) {
  return (
    <Text style={styles.fact}>
      <Text style={styles.factKey}>{k} </Text>
      {v}
    </Text>
  );
}

function Notice({ ok, text, styles }: { ok: boolean; text: string | null; styles: Styles }) {
  if (!text) return null;
  return <Text style={ok ? styles.ok : styles.error}>{text}</Text>;
}

// ---------------------------------------------------------------------------
// Discount codes
// ---------------------------------------------------------------------------

type CodeForm = {
  editing: string | null;
  code: string;
  kind: TermsKind;
  amount: string;
  startsAt: string;
  endsAt: string;
  max: string;
  onePerAccount: boolean;
  active: boolean;
  note: string;
};

const EMPTY_CODE: CodeForm = {
  editing: null,
  code: '',
  kind: 'percent',
  amount: '',
  startsAt: '',
  endsAt: '',
  max: '',
  onePerAccount: false,
  active: true,
  note: '',
};

function codeFormFrom(c: AdminDiscountCode): CodeForm {
  const t = termsToForm(c);
  return {
    editing: c.code,
    code: c.code,
    kind: t.kind === 'none' ? 'percent' : t.kind,
    amount: t.amount,
    startsAt: toInputDate(c.startsAt),
    endsAt: toInputDate(c.endsAt),
    max: c.maxRedemptions == null ? '' : String(c.maxRedemptions),
    onePerAccount: c.onePerAccount,
    active: c.active,
    note: c.note ?? '',
  };
}

function DiscountsSection({ styles, colors }: { styles: Styles; colors: SemanticColors }) {
  const { rows, error, reload } = useAdminList(adminPromotions.listCodes);
  const [form, setForm] = useState<CodeForm>(EMPTY_CODE);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<CodeForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async (f: CodeForm, key: string) => {
    const startsAt = fromInputDate(f.startsAt, false);
    const endsAt = fromInputDate(f.endsAt, true);
    const bad = [startsAt, endsAt].find((d): d is { error: string } => typeof d === 'object' && d !== null);
    if (bad) {
      setNotice({ ok: false, text: bad.error });
      return;
    }
    setBusy(key);
    setNotice(null);
    try {
      const isNew = !f.editing;
      const res = await adminPromotions.saveCode({
        isNew,
        generate: isNew && !f.code.trim(),
        code: f.code.trim() || undefined,
        ...termsFromForm(f.kind, f.amount),
        startsAt: startsAt as string | null,
        endsAt: endsAt as string | null,
        maxRedemptions: f.max.trim() ? Number(f.max) : null,
        onePerAccount: f.onePerAccount,
        active: f.active,
        note: f.note.trim() || null,
      });
      setNotice({ ok: true, text: isNew ? `Created ${res.code}.` : `Saved ${res.code}.` });
      setForm(EMPTY_CODE);
      await reload();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = (c: AdminDiscountCode) => {
    if (c.active && !confirmAction(`Deactivate ${c.code}? Shoppers won’t be able to use it.`)) return;
    void save({ ...codeFormFrom(c), active: !c.active }, c.code);
  };

  const live = (rows ?? []).filter((c) => c.status === 'active');
  const totalUsed = (rows ?? []).reduce((s, c) => s + c.used, 0);
  const totalGiven = (rows ?? []).reduce((s, c) => s + c.discountGivenCents, 0);

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>
        Shoppers type a code at checkout (box, marketplace and gifts), or open a link with ?code=CODE. One code per order. A code counts as used once
        the order is placed with a card or paid; cancelled or refunded orders drop out.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{form.editing ? `Edit ${form.editing}` : 'New code'}</Text>
        <View style={styles.formRow}>
          <Field
            label="Code"
            value={form.code}
            onChangeText={(v) => set({ code: v.toUpperCase() })}
            placeholder="Leave blank to generate"
            editable={!form.editing}
            width={240}
            styles={styles}
            colors={colors}
          />
          <TermsPicker
            kind={form.kind}
            amount={form.amount}
            allowNone={false}
            onKind={(kind) => set({ kind })}
            onAmount={(amount) => set({ amount })}
            styles={styles}
            colors={colors}
          />
        </View>
        <View style={styles.formRow}>
          <Field label="Starts (optional)" value={form.startsAt} onChangeText={(v) => set({ startsAt: v })} placeholder="YYYY-MM-DD" width={160} styles={styles} colors={colors} />
          <Field label="Ends (optional)" value={form.endsAt} onChangeText={(v) => set({ endsAt: v })} placeholder="YYYY-MM-DD" hint="Through the end of that day." width={180} styles={styles} colors={colors} />
          <Field label="Max uses (optional)" value={form.max} onChangeText={(v) => set({ max: v.replace(/\D/g, '') })} placeholder="Unlimited" keyboardType="number-pad" width={160} styles={styles} colors={colors} />
        </View>
        <View style={styles.chipRow}>
          <Chip label="One per account" active={form.onePerAccount} onPress={() => set({ onePerAccount: !form.onePerAccount })} styles={styles} />
          <Chip label={form.active ? 'Active' : 'Inactive'} active={form.active} onPress={() => set({ active: !form.active })} styles={styles} />
        </View>
        <Field label="Note (only you see this)" value={form.note} onChangeText={(v) => set({ note: v })} placeholder="e.g. Shabbat dinner guests" styles={styles} colors={colors} />
        <View style={styles.chipRow}>
          <Button label={form.editing ? 'Save changes' : form.code.trim() ? 'Create code' : 'Generate code'} onPress={() => void save(form, 'form')} busy={busy === 'form'} styles={styles} />
          {form.editing ? <Button quiet label="Cancel" onPress={() => setForm(EMPTY_CODE)} styles={styles} /> : null}
        </View>
        <Notice ok={notice?.ok ?? false} text={notice?.text ?? null} styles={styles} />
      </View>

      <Text style={styles.caption}>
        {rows ? `${rows.length} codes · ${live.length} usable now · ${totalUsed} uses · ${money(totalGiven)} in discounts` : error ?? 'Loading codes…'}
      </Text>
      {rows && error ? <Text style={styles.error}>{error}</Text> : null}
      {(rows ?? []).map((c) => (
        <View key={c.code} style={styles.card}>
          <View style={styles.rowHead}>
            <TouchableOpacity onPress={() => void copyText(c.code)} accessibilityLabel={`Copy ${c.code}`}>
              <Text style={styles.cardTitle}>{c.code}</Text>
            </TouchableOpacity>
            <Text style={[styles.badge, c.status === 'active' ? styles.badgeOn : null]}>{c.status}</Text>
          </View>
          <View style={styles.facts}>
            <Fact k="Discount" v={c.label} styles={styles} />
            <Fact
              k="Used"
              v={`${c.used}${c.maxRedemptions != null ? ` of ${c.maxRedemptions}` : ''}${c.pending ? ` (+${c.pending} at checkout)` : ''}`}
              styles={styles}
            />
            <Fact k="Remaining" v={c.remaining == null ? 'Unlimited' : String(c.remaining)} styles={styles} />
            <Fact k="Dates" v={c.startsAt || c.endsAt ? `${day(c.startsAt)} – ${day(c.endsAt)}` : 'No limit'} styles={styles} />
            {c.onePerAccount ? <Fact k="Limit" v="One per account" styles={styles} /> : null}
            <Fact k="Sales" v={`${money(c.salesCents)} · ${money(c.discountGivenCents)} off`} styles={styles} />
          </View>
          {c.note ? <Text style={styles.caption}>{c.note}</Text> : null}
          <View style={styles.chipRow}>
            <Chip label="Edit" onPress={() => setForm(codeFormFrom(c))} styles={styles} />
            <Chip label={busy === c.code ? 'Saving…' : c.active ? 'Deactivate' : 'Reactivate'} onPress={() => toggleActive(c)} styles={styles} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Direct credit
// ---------------------------------------------------------------------------

function CreditSection({ styles, colors }: { styles: Styles; colors: SemanticColors }) {
  const { rows, error, reload } = useAdminList(adminPromotions.listCredits);
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const grant = async () => {
    const cents = dollarsToCents(amount);
    const to = email.trim().toLowerCase();
    if (!to.includes('@')) return setNotice({ ok: false, text: 'Enter an email address.' });
    if (cents == null || cents < 100) return setNotice({ ok: false, text: 'Enter at least $1.' });
    if (!confirmAction(`Give ${money(cents)} of credit to ${to}?`)) return;
    setBusy('grant');
    setNotice(null);
    try {
      const res = await adminPromotions.grantCredit({ email: to, amountCents: cents, note: note.trim() || undefined, name: name.trim() || undefined });
      setNotice({
        ok: true,
        text: res.accountCreated
          ? `Added ${money(cents)} for ${to}. They didn’t have an account, so one was created: they sign in with “email me a link”.`
          : `Added ${money(cents)} to ${to}’s account.`,
      });
      setEmail('');
      setAmount('');
      setName('');
      setNote('');
      await reload();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (g: AdminCreditGrant) => {
    if (!confirmAction(`Take back ${money(g.amountCents)} from ${g.email}?`)) return;
    setBusy(g.id);
    setNotice(null);
    try {
      await adminPromotions.revokeCredit(g.id);
      setNotice({ ok: true, text: `Revoked ${money(g.amountCents)} from ${g.email}.` });
      await reload();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(null);
    }
  };

  const active = (rows ?? []).filter((g) => g.status !== 'revoked');
  const granted = active.reduce((s, g) => s + g.amountCents, 0);
  const used = active.reduce((s, g) => s + g.usedCents, 0);

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>
        Adds credit straight to someone’s account; no email is sent. If there’s no account for that email, one is created and they sign in with
        “email me a link”. Credit pays for boxes, marketplace orders and gifts, the same way gift credit does.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Give credit</Text>
        <View style={styles.formRow}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" width={280} styles={styles} colors={colors} />
          <Field label="Amount ($)" value={amount} onChangeText={setAmount} placeholder="25" keyboardType="decimal-pad" width={120} styles={styles} colors={colors} />
          <Field label="First name (optional)" value={name} onChangeText={setName} placeholder="For new accounts" width={200} styles={styles} colors={colors} />
        </View>
        <Field label="Note (only you see this)" value={note} onChangeText={setNote} placeholder="e.g. Sorry about the late box" styles={styles} colors={colors} />
        <View style={styles.chipRow}>
          <Button label="Give credit" onPress={() => void grant()} busy={busy === 'grant'} styles={styles} />
        </View>
        <Notice ok={notice?.ok ?? false} text={notice?.text ?? null} styles={styles} />
      </View>

      <Text style={styles.caption}>
        {rows
          ? `${active.length} grants · ${money(granted)} given · about ${money(used)} spent. “Used” is estimated from the balance, oldest credit first.`
          : error ?? 'Loading credit…'}
      </Text>
      {rows && error ? <Text style={styles.error}>{error}</Text> : null}
      {(rows ?? []).map((g) => (
        <View key={g.id} style={styles.card}>
          <View style={styles.rowHead}>
            <Text style={styles.cardTitle}>{`${money(g.amountCents)} · ${g.email}`}</Text>
            <Text style={[styles.badge, g.status === 'unused' ? styles.badgeOn : null]}>{g.status}</Text>
          </View>
          <View style={styles.facts}>
            <Fact k="Given" v={`${day(g.createdAt)} by ${g.grantedByEmail || '—'}`} styles={styles} />
            <Fact k="Account" v={g.accountCreated ? 'Created for them' : 'Already existed'} styles={styles} />
            {g.status !== 'revoked' ? <Fact k="Spent" v={money(g.usedCents)} styles={styles} /> : <Fact k="Revoked" v={day(g.revokedAt)} styles={styles} />}
          </View>
          {g.note ? <Text style={styles.caption}>{g.note}</Text> : null}
          {g.status === 'unused' ? (
            <View style={styles.chipRow}>
              <Chip label={busy === g.id ? 'Revoking…' : 'Revoke'} onPress={() => void revoke(g)} styles={styles} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Influencers
// ---------------------------------------------------------------------------

type InfluencerForm = {
  editing: string | null;
  name: string;
  email: string;
  slug: string;
  slugTouched: boolean;
  kind: TermsKind;
  amount: string;
  commission: string;
  active: boolean;
  note: string;
};

const EMPTY_INFLUENCER: InfluencerForm = {
  editing: null,
  name: '',
  email: '',
  slug: '',
  slugTouched: false,
  kind: 'none',
  amount: '',
  commission: '10',
  active: true,
  note: '',
};

function influencerFormFrom(i: AdminInfluencer): InfluencerForm {
  const t = termsToForm(i);
  return {
    editing: i.slug,
    name: i.name,
    email: i.email,
    slug: i.slug,
    slugTouched: true,
    kind: t.kind,
    amount: t.amount,
    commission: String(i.commissionPercent),
    active: i.active,
    note: i.note ?? '',
  };
}

function InfluencerRow({
  inf,
  onEdit,
  onChanged,
  styles,
  colors,
}: {
  inf: AdminInfluencer;
  onEdit: () => void;
  onChanged: () => Promise<void>;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [copied, setCopied] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [showPurchases, setShowPurchases] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const copy = async () => {
    if (await copyText(inf.link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const record = async () => {
    const cents = dollarsToCents(amount);
    if (cents == null || cents < 1) return setMsg('Enter the amount you paid.');
    setBusy(true);
    setMsg(null);
    try {
      await adminPromotions.recordPayout({ slug: inf.slug, amountCents: cents, note: note.trim() || undefined });
      setAmount('');
      setNote('');
      setShowPayout(false);
      await onChanged();
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, cents: number) => {
    if (!confirmAction(`Delete the ${money(cents)} payout record?`)) return;
    try {
      await adminPromotions.deletePayout(id);
      await onChanged();
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.rowHead}>
        <Text style={styles.cardTitle}>{inf.name}</Text>
        <Text style={[styles.badge, inf.active ? styles.badgeOn : null]}>{inf.active ? 'active' : 'paused'}</Text>
      </View>
      <View style={styles.linkRow}>
        <Text style={styles.link} selectable numberOfLines={1}>
          {inf.link}
        </Text>
        <Chip label={copied ? 'Copied' : 'Copy link'} onPress={() => void copy()} styles={styles} />
      </View>
      <View style={styles.facts}>
        <Fact k="Email" v={`${inf.email}${inf.accountCreated ? ' (account created)' : ''}`} styles={styles} />
        <Fact k="Their offer" v={inf.discountLabel || 'None'} styles={styles} />
        <Fact k="Commission" v={`${inf.commissionPercent}%`} styles={styles} />
        <Fact k="Visits" v={`${inf.visitCount} (${inf.uniqueVisitorCount} people)`} styles={styles} />
        <Fact k="Purchases" v={String(inf.purchases)} styles={styles} />
        <Fact k="Sales" v={money(inf.salesCents)} styles={styles} />
        <Fact k="Earned" v={money(inf.earningsCents)} styles={styles} />
        <Fact k="Paid" v={money(inf.paidOutCents)} styles={styles} />
        <Fact k="Owed" v={money(inf.owedCents)} styles={styles} />
      </View>
      {inf.note ? <Text style={styles.caption}>{inf.note}</Text> : null}
      <View style={styles.chipRow}>
        <Chip label="Edit" onPress={onEdit} styles={styles} />
        <Chip label="Mark paid out" active={showPayout} onPress={() => setShowPayout((v) => !v)} styles={styles} />
        {inf.recent.length ? (
          <Chip label={`Purchases (${inf.recent.length})`} active={showPurchases} onPress={() => setShowPurchases((v) => !v)} styles={styles} />
        ) : null}
      </View>
      {showPayout ? (
        <View style={styles.formRow}>
          <Field label="Amount paid ($)" value={amount} onChangeText={setAmount} placeholder={(inf.owedCents / 100).toFixed(2)} keyboardType="decimal-pad" width={140} styles={styles} colors={colors} />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="e.g. Venmo, Dec 1" width={240} styles={styles} colors={colors} />
          <View style={styles.fieldAction}>
            <Button label="Record payout" onPress={() => void record()} busy={busy} styles={styles} />
          </View>
        </View>
      ) : null}
      {msg ? <Text style={styles.error}>{msg}</Text> : null}
      {inf.payouts.length ? (
        <View style={styles.subList}>
          <Text style={styles.fieldLabel}>Payouts</Text>
          {inf.payouts.map((p) => (
            <View key={p.id} style={styles.subRow}>
              <Text style={styles.fact}>{`${day(p.paidAt)} · ${money(p.amountCents)}${p.note ? ` · ${p.note}` : ''}`}</Text>
              <TouchableOpacity onPress={() => void remove(p.id, p.amountCents)} accessibilityLabel="Delete payout">
                <Text style={styles.linkAction}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      {showPurchases ? (
        <View style={styles.subList}>
          {inf.recent.map((r, i) => (
            <Text key={`${r.date}-${i}`} style={styles.fact}>
              {`${r.date} · ${r.kind} · ${money(r.netCents)} → ${money(r.commissionCents)}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InfluencersSection({ styles, colors }: { styles: Styles; colors: SemanticColors }) {
  const { rows, error, reload } = useAdminList(adminPromotions.listInfluencers);
  const [form, setForm] = useState<InfluencerForm>(EMPTY_INFLUENCER);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<InfluencerForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const isNew = !form.editing;
      const res = await adminPromotions.saveInfluencer({
        isNew,
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        ...termsFromForm(form.kind, form.amount),
        commissionPercent: Number(form.commission) || 0,
        active: form.active,
        note: form.note.trim() || null,
      });
      setNotice({
        ok: true,
        text: `${isNew ? 'Created' : 'Saved'}: ${res.link}${res.accountCreated ? ' · account created for their email' : ''}`,
      });
      setForm(EMPTY_INFLUENCER);
      await reload();
    } catch (err) {
      setNotice({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  const list = rows ?? [];
  const owed = list.reduce((s, i) => s + i.owedCents, 0);
  const sales = list.reduce((s, i) => s + i.salesCents, 0);

  return (
    <View style={styles.body}>
      <Text style={styles.hint}>
        Each influencer gets a link (grapejuice.co/r/name, or any page with ?ref=name). Visitors keep the influencer’s offer for 30 days; the
        last link clicked wins. Commission is the rate times what the buyer actually paid for goods (after discounts and credit, before shipping and
        tax), counted once a box is placed with a card or an order is paid, and dropped if it’s cancelled or refunded. The influencer sees their
        numbers on their Account page when they sign in with this email.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{form.editing ? `Edit ${form.name || form.editing}` : 'New influencer'}</Text>
        <View style={styles.formRow}>
          <Field
            label="Name"
            value={form.name}
            onChangeText={(v) => set({ name: v, ...(form.editing || form.slugTouched ? {} : { slug: slugFromName(v) }) })}
            placeholder="Rivka Cohen"
            width={220}
            styles={styles}
            colors={colors}
          />
          <Field label="Email" value={form.email} onChangeText={(v) => set({ email: v })} placeholder="name@example.com" keyboardType="email-address" width={260} styles={styles} colors={colors} />
          <Field
            label="Link name"
            value={form.slug}
            onChangeText={(v) => set({ slug: v.toLowerCase(), slugTouched: true })}
            placeholder="rivka"
            editable={!form.editing}
            hint={form.editing ? 'Links can’t be renamed.' : `grapejuice.co/r/${form.slug || '…'}`}
            width={200}
            styles={styles}
            colors={colors}
          />
        </View>
        <View style={styles.formRow}>
          <TermsPicker
            kind={form.kind}
            amount={form.amount}
            allowNone
            onKind={(kind) => set({ kind })}
            onAmount={(amount) => set({ amount })}
            styles={styles}
            colors={colors}
          />
          <Field label="Commission %" value={form.commission} onChangeText={(v) => set({ commission: v })} placeholder="10" keyboardType="decimal-pad" width={120} styles={styles} colors={colors} />
        </View>
        <View style={styles.chipRow}>
          <Chip label={form.active ? 'Active' : 'Paused'} active={form.active} onPress={() => set({ active: !form.active })} styles={styles} />
        </View>
        <Field label="Note (only you see this)" value={form.note} onChangeText={(v) => set({ note: v })} placeholder="e.g. Instagram, 40k followers" styles={styles} colors={colors} />
        <View style={styles.chipRow}>
          <Button label={form.editing ? 'Save changes' : 'Create link'} onPress={() => void save()} busy={busy} styles={styles} />
          {form.editing ? <Button quiet label="Cancel" onPress={() => setForm(EMPTY_INFLUENCER)} styles={styles} /> : null}
        </View>
        <Notice ok={notice?.ok ?? false} text={notice?.text ?? null} styles={styles} />
      </View>

      <Text style={styles.caption}>
        {rows ? `${list.length} influencers · ${money(sales)} in sales · ${money(owed)} owed` : error ?? 'Loading influencers…'}
      </Text>
      {rows && error ? <Text style={styles.error}>{error}</Text> : null}
      {list.map((inf) => (
        <InfluencerRow key={inf.slug} inf={inf} onEdit={() => setForm(influencerFormFrom(inf))} onChanged={reload} styles={styles} colors={colors} />
      ))}
    </View>
  );
}

/** Discounts, direct credit and influencer links — the tabs of the Promotions admin page. */
export function PromotionsSection({ tab }: { tab: PromotionsTab }) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (tab === 'discounts') return <DiscountsSection styles={styles} colors={colors} />;
  if (tab === 'credit') return <CreditSection styles={styles} colors={colors} />;
  return <InfluencersSection styles={styles} colors={colors} />;
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    body: { gap: spacing.md },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      letterSpacing: -0.22,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    caption: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      letterSpacing: -0.22,
      lineHeight: 17,
    },
    ok: { ...typeface('regular'), fontSize: typography.md, color: colors.success },
    error: { ...typeface('regular'), fontSize: typography.md, color: colors.error },
    card: {
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: {
      ...typeface('medium'),
      fontSize: typography.lg,
      letterSpacing: -0.3,
      color: colors.textPrimary,
    },
    rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
    badge: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    badgeOn: { color: colors.success, borderColor: colors.success },
    facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 4 },
    fact: { ...typeface('regular'), fontSize: typography.sm, color: colors.textPrimary, letterSpacing: -0.22 },
    factKey: { ...typeface('light'), color: colors.textSecondary },
    formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
    field: { gap: 4, flexGrow: 1, flexBasis: 200, minWidth: 0 },
    fieldAction: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
    fieldLabel: { ...typeface('medium'), fontSize: typography.sm, color: colors.textSecondary, letterSpacing: -0.22 },
    input: {
      ...typeface('regular'),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      fontSize: Platform.OS === 'web' ? 14 : 16,
      color: colors.textPrimary,
      minHeight: 40,
    },
    inputShort: { width: 96 },
    inputLocked: { color: colors.textSecondary, borderColor: colors.border },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
    chip: {
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.brand },
    chipLabel: { ...typeface('regular'), fontSize: typography.sm, color: colors.textPrimary, letterSpacing: -0.22 },
    button: {
      borderRadius: borderRadius.xl,
      backgroundColor: colors.logoDark,
      paddingHorizontal: spacing.lg,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonLabel: { ...typeface('medium'), fontSize: typography.md, color: colors.bgPrimary, letterSpacing: -0.22 },
    buttonQuiet: { paddingHorizontal: spacing.md, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
    buttonQuietLabel: { ...typeface('regular'), fontSize: typography.md, color: colors.textSecondary },
    buttonOff: { opacity: 0.5 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    link: { ...typeface('regular'), fontSize: typography.md, color: colors.textPrimary, flexShrink: 1 },
    linkAction: { ...typeface('regular'), fontSize: typography.sm, color: colors.textSecondary, textDecorationLine: 'underline' },
    subList: { gap: 4, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  });
}
