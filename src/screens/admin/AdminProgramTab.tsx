import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, TextInput, TouchableOpacity, View, type TextStyle, type ViewStyle } from 'react-native';
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

type Piece = {
  id: string;
  title: string;
  channel: string;
  subject: string;
  who: string;
  when: string;
  status: string;
  session: number;
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
  approvals: Piece[];
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

/** Grapejuice transactional drafts are the code editor. The ’90s Parent dedicated is Design Studio. */
const CIO_EDITOR: Record<string, { href: string; label: string }> = {
  pilot_invite: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/25/templates/29',
    label: 'Edit in Customer.io',
  },
  pilot_d3: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/26/templates/30',
    label: 'Edit in Customer.io',
  },
  pilot_d7: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/27/templates/31',
    label: 'Edit in Customer.io',
  },
  d1: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/28/templates/32',
    label: 'Edit in Customer.io',
  },
  s6: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/29/templates/33',
    label: 'Edit in Customer.io',
  },
  d4: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/30/templates/34',
    label: 'Edit in Customer.io',
  },
  d8: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/31/templates/35',
    label: 'Edit in Customer.io',
  },
  abandoner: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/32/templates/36',
    label: 'Edit in Customer.io',
  },
  wave2: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/33/templates/37',
    label: 'Edit in Customer.io',
  },
  lock_t1: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/34/templates/38',
    label: 'Edit in Customer.io',
  },
  lock_t1_committed: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/37/templates/41',
    label: 'Edit in Customer.io',
  },
  lock_sorry: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/38/templates/42',
    label: 'Edit in Customer.io',
  },
  lock_charged: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/39/templates/43',
    label: 'Edit in Customer.io',
  },
  extend_draft: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/40/templates/44',
    label: 'Edit in Customer.io',
  },
  extend_new: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/41/templates/45',
    label: 'Edit in Customer.io',
  },
  order_cancelled: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/42/templates/46',
    label: 'Edit in Customer.io',
  },
  survey: {
    href: 'https://fly.customer.io/messaging/env/208456/composer/transactional/35/templates/39',
    label: 'Edit in Customer.io',
  },
  dedicated_tnp: {
    href: 'https://fly.customer.io/workspaces/198880/design-studio/editor/2e031c4d-cb34-4612-a96b-c298182ad5b2',
    label: 'Edit in Design Studio',
  },
};

function openCustomerIo(href: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(href);
}

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

  const approve = async (id: string, status: 'approved' | 'pending') => {
    setNote(null);
    await call('adminProgramApprove')({ id, status });
    await load();
  };

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
        Goal is {s.target} committed Hanukkah boxes by the lock. Nothing in the approval list sends until you approve it, and the email templates are still unwired, so an approval does not send on its own.
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
      <Text style={styles.section}>Approvals</Text>
      <Text style={styles.hint}>
        Approved right now: {data.enabledStages.length ? data.enabledStages.join(', ') : 'none'}. The subject line is the live Customer.io email. Open that email to review the words. Approving here only allows it to send.
      </Text>
      {[1, 2].map((session) => (
        <View key={session} style={{ gap: 0 }}>
          <Text style={[styles.caption, { marginTop: 12 }]}>Review session {session}</Text>
          {data.approvals.filter((p) => p.session === session).map((p) => (
            <View key={p.id} style={styles.detail}>
              <View style={styles.detailInner}>
                <Text style={styles.tdStrong}>{p.title}</Text>
                <Text style={styles.td}>{p.subject}</Text>
                <Text style={styles.caption}>{p.who}. {p.when}.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.chip, p.status === 'approved' && styles.chipActive, { alignSelf: 'flex-start' }]}
                    onPress={() => void approve(p.id, p.status === 'approved' ? 'pending' : 'approved')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipLabel}>
                      {p.status === 'approved' ? 'Approved · undo' : 'Approve'}
                    </Text>
                  </TouchableOpacity>
                  {CIO_EDITOR[p.id] ? (
                    <TouchableOpacity
                      style={[styles.chip, { alignSelf: 'flex-start' }]}
                      onPress={() => openCustomerIo(CIO_EDITOR[p.id].href)}
                      accessibilityRole="link"
                    >
                      <Text style={styles.chipLabel}>{CIO_EDITOR[p.id].label}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
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

      <View style={styles.sectionDivider} />
      <TouchableOpacity
        style={[styles.chip, { alignSelf: 'flex-start' }]}
        onPress={() => void call('adminProgramDryRun')({}).then(() => load()).then(() => setNote('Today’s pass ran. Only approved pieces can send.'))}
        accessibilityRole="button"
      >
        <Text style={styles.chipLabel}>Run today’s email pass</Text>
      </TouchableOpacity>
      <Text style={styles.caption}>Approved pieces only. Templates are still unwired, so this records the decision and does not email anyone.</Text>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
