import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, type TextStyle, type ViewStyle } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { SemanticColors } from '../../constants/themeMode';

type OpsStyles = {
  section: TextStyle;
  hint: TextStyle;
  caption: TextStyle;
  stats: ViewStyle;
  stat: ViewStyle;
  statValue: TextStyle;
  statLabel: TextStyle;
  sectionDivider: ViewStyle;
  alert: ViewStyle;
  alertTitle: TextStyle;
  input: TextStyle;
  chip: ViewStyle;
  chipActive: ViewStyle;
  chipLabel: TextStyle;
  tr: ViewStyle;
  td: TextStyle;
  tdStrong: TextStyle;
  tdMuted: TextStyle;
  error: TextStyle;
  detail: ViewStyle;
  detailInner: ViewStyle;
  sectionBody: ViewStyle;
};

type Dashboard = {
  generatedAt: string;
  scoreboard: {
    commits: number;
    target: number;
    pace: number;
    daysLeft: number;
    revenueCents: number;
    byCode: Record<string, number>;
    blendedCpp: number | null;
    metaSpend: number;
    metaPurchases: number;
  };
  checkout: { steps: Record<string, number>; errors: Record<string, number> };
  jobs: Array<{ id: string; at?: string; ok?: boolean; error?: string; skipped?: string }>;
  alerts: Array<{ id: string; kind?: string; job?: string; at?: string }>;
  enabledStages: string[];
  snapshots: Array<{ date?: string; scoreboard?: { commits?: number } }>;
};

type PersonView = {
  email: string;
  log: { track?: string; segment?: string; sends?: Array<{ stage?: string; at?: string; reason?: string; skipped?: boolean }> } | null;
  override: { reason?: string; at?: string; trackOverride?: string } | null;
  next: { action?: string; stage?: string; reason?: string; variant?: string } | null;
};

const call = <T,>(name: string) => httpsCallable<Record<string, unknown>, T>(functions, name);

const JOB_LABEL: Record<string, string> = {
  draftLifecycle: 'Daily email pass',
  abandoner: 'Checkout abandoner scan',
  snapshots: 'Morning snapshot',
  newsletterSuppression: 'Newsletter suppression list',
  pilotSurvey: 'December pilot survey',
  metaGuard: 'Ad auto-pause check',
};

function money(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function Stat({ value, label, styles }: { value: string; label: string; styles: OpsStyles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function AdminProgramTab({ styles, colors }: { styles: OpsStyles; colors: SemanticColors }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [person, setPerson] = useState<PersonView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await call<Dashboard>('getAdminProgramDashboard')({});
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the program.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lookup = async () => {
    setNote(null);
    const res = await call<PersonView>('adminProgramPerson')({ email });
    setPerson(res.data);
  };

  const override = async () => {
    await call('adminProgramTrackOverride')({ email, reason });
    await lookup();
    setNote('Moved onto the 15% offer for this wave.');
  };

  if (!data && busy) return <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />;
  if (error && !data) return <Text style={styles.error}>{error}</Text>;
  if (!data) return null;
  const s = data.scoreboard;
  const code = s.byCode;

  return (
    <View style={styles.sectionBody}>
      <Text style={styles.section}>Conversion program, Oct 21 to Nov 7</Text>
      <Text style={styles.hint}>
        Live impact monitoring for the conversion program. Goal is {s.target} committed Hanukkah boxes by the lock; {data.enabledStages.length} lifecycle stages are enabled.
      </Text>

      <View style={styles.stats}>
        <Stat value={String(s.commits)} label="Committed since Oct 21" styles={styles} />
        <Stat value={String(s.target)} label="Goal by Nov 7" styles={styles} />
        <Stat value={String(s.pace)} label="Steady pace by today" styles={styles} />
        <Stat value={String(s.daysLeft)} label="Days until the lock" styles={styles} />
        <Stat value={s.blendedCpp != null ? `$${s.blendedCpp}` : '—'} label="Ad spend per commit" styles={styles} />
        <Stat value={money(s.revenueCents)} label="Committed box revenue" styles={styles} />
      </View>
      <Text style={styles.caption}>
        Steady pace is where the count would be if the {s.target} commits arrived evenly from Oct 21 through Nov 7. It is the benchmark for today, separate from the {s.commits} already committed. Meta spend since September is ${s.metaSpend.toLocaleString('en-US')} across {s.metaPurchases} purchases, which is a wider window than these commits.
      </Text>

      <View style={styles.stats}>
        <Stat value={String(code.pilot ?? 0)} label="New pilot enrollments" styles={styles} />
        <Stat value={String(code.FIFTEENOFF ?? 0)} label="Used FIFTEENOFF" styles={styles} />
        <Stat value={String(code.otherCode ?? 0)} label="Used another code" styles={styles} />
        <Stat value={String(code.none ?? 0)} label="Committed with no code" styles={styles} />
      </View>

      {data.alerts.length ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>Open alerts</Text>
          {data.alerts.map((a) => (
            <Text key={a.id} style={styles.caption}>{[a.kind, a.job, a.at].filter(Boolean).join(' · ')}</Text>
          ))}
        </View>
      ) : (
        <Text style={styles.caption}>No open alerts.</Text>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Checkout visits</Text>
      <Text style={styles.hint}>How far recent checkout sessions got. This starts from when the funnel log was deployed, so older visits are missing.</Text>
      <View style={styles.stats}>
        <Stat value={String(data.checkout.steps.view ?? 0)} label="Opened checkout" styles={styles} />
        <Stat value={String(data.checkout.steps.payment ?? 0)} label="Reached payment" styles={styles} />
        <Stat value={String(data.checkout.steps.card ?? 0)} label="Entered a card" styles={styles} />
        <Stat value={String(data.checkout.steps.purchased ?? 0)} label="Purchased" styles={styles} />
      </View>
      {Object.keys(data.checkout.errors).length ? (
        Object.entries(data.checkout.errors).map(([stage, n]) => (
          <Text key={stage} style={styles.caption}>{stage}: {n} errors</Text>
        ))
      ) : (
        <Text style={styles.caption}>No checkout errors recorded in this sample.</Text>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Scheduled jobs</Text>
      {data.jobs.length === 0 ? <Text style={styles.hint}>Nothing has run yet.</Text> : null}
      {data.jobs.map((j) => (
        <View key={j.id} style={styles.tr}>
          <Text style={[styles.td, styles.tdStrong, { flex: 1 }]}>{JOB_LABEL[j.id] ?? j.id}</Text>
          <Text style={[styles.tdMuted, { flex: 2 }]}>
            {j.ok === false ? j.error || 'Failed' : j.skipped || 'Ran'}{j.at ? ` · ${j.at.slice(0, 16).replace('T', ' ')}` : ''}
          </Text>
        </View>
      ))}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>Morning snapshots</Text>
      {data.snapshots.length === 0 ? <Text style={styles.hint}>The first snapshot is written at 7:30am ET.</Text> : null}
      {data.snapshots.map((row) => (
        <View key={row.date} style={styles.tr}>
          <Text style={[styles.td, { width: 120 }]}>{row.date}</Text>
          <Text style={styles.tdMuted}>{row.scoreboard?.commits ?? 0} committed</Text>
        </View>
      ))}

      <View style={styles.sectionDivider} />
      <Text style={styles.section}>One person</Text>
      <Text style={styles.hint}>Look up what the program would send this person next. Moving a pilot onto the 15% offer is manual, current wave only, and needs a reason.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={styles.input}
      />
      <TouchableOpacity style={[styles.chip, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => void lookup()} accessibilityRole="button">
        <Text style={styles.chipLabel}>Look up</Text>
      </TouchableOpacity>
      {person ? (
        <View style={[styles.detail, { marginTop: 12 }]}>
          <View style={styles.detailInner}>
            <Text style={styles.tdStrong}>{person.email}</Text>
            <Text style={styles.caption}>
              Track {person.log?.track ?? 'not in the program yet'}. Next: {person.next?.action ?? '—'} {person.next?.stage ?? ''} {person.next?.reason ?? ''}
            </Text>
            {(person.log?.sends ?? []).map((send, i) => (
              <Text key={`${send.stage}-${i}`} style={styles.caption}>
                {send.skipped ? 'Skipped' : 'Sent'} {send.stage} {send.reason ?? ''} {send.at ?? ''}
              </Text>
            ))}
            {person.override ? <Text style={styles.caption}>Already moved: {person.override.reason}</Text> : null}
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Why this pilot should get the 15% instead"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { marginTop: 8, maxWidth: 480 }]}
            />
            <TouchableOpacity style={[styles.chip, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => void override()} accessibilityRole="button">
              <Text style={styles.chipLabel}>Move this pilot to the 15%</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
