import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { MobileButton } from '../../components/mobile/MobileButton';
import { m, mType, mFont, balanceProps } from '../../components/mobile/mobileTheme';
import { byId, primaryPhoto } from '../../components/mobile/catalogPhotos';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { MobileChip, type MobileOrderAction } from './MobileOrdersBody';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { MobileFooterBleed, MobileFooterSpacer, mobileFooterScrollStyle } from '../../components/mobile/MobileFooter';

export type MobileGiftRow = {
  id: string;
  title: string;
  /** "Sent Oct 10 to dan@…", "From Grandma". */
  sub: string;
  status: string;
  items: BoxLineItem[];
  note?: string | null;
  actions: MobileOrderAction[];
};

type Props = {
  sent: MobileGiftRow[];
  received: MobileGiftRow[];
  catalog: CatalogItem[];
  creditLine?: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onSend: () => void;
};

/** Phone gifts (mockups/account s=3): Sent and Received, one card per gift with its actions under it. */
export function MobileGiftsBody(p: Props) {
  const catalogById = useMemo(() => byId(p.catalog), [p.catalog]);
  const [tab, setTab] = useState<'sent' | 'received'>(p.sent.length || !p.received.length ? 'sent' : 'received');
  const rows = tab === 'sent' ? p.sent : p.received;

  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Account', onPress: p.onBack }} title="Gifts" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, mobileFooterScrollStyle, { paddingBottom: 0 }]}>
        <Text style={styles.h1}>Gifts</Text>
        <View style={styles.chips}>
          <MobileChip label="Sent" on={tab === 'sent'} onPress={() => setTab('sent')} />
          <MobileChip label="Received" on={tab === 'received'} onPress={() => setTab('received')} />
        </View>
        {p.loading ? (
          <View style={styles.loading}><BrandLoadingMark /></View>
        ) : p.error ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Text style={mType.body}>{p.error}</Text>
            <MobileButton label="Try again" variant="secondary" onPress={p.onRetry} />
          </View>
        ) : rows.length === 0 ? (
          <Text style={[mType.body, { marginTop: 18 }]} {...balanceProps}>
            {tab === 'sent' ? "You haven't sent a gift yet." : 'When someone sends you a gift, it shows up here once you open the email.'}
          </Text>
        ) : (
          rows.map((g) => {
            const photo = g.items.length ? primaryPhoto(catalogById.get(g.items[0]!.itemId)) : null;
            const buttons = g.actions.filter((a) => !a.link);
            const links = g.actions.filter((a) => a.link);
            return (
              <View key={g.id} style={styles.gift}>
                <View style={styles.row}>
                  <View style={styles.thumb}>
                    {photo ? <Image source={{ uri: photo }} style={styles.thumbImg} /> : <Icon icon={icons.gift} size={20} color={m.goldDark} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.title}>{g.title}</Text>
                    <Text style={styles.sub}>{g.sub}</Text>
                    <Text style={styles.pill}>{g.status}</Text>
                  </View>
                </View>
                {buttons.length ? (
                  <View style={[styles.buttons, buttons.length === 2 && { flexDirection: 'row' }]}>
                    {buttons.map((a) => (
                      <MobileButton
                        key={a.label}
                        label={a.label}
                        onPress={a.onPress}
                        busy={a.busy}
                        disabled={a.busy}
                        variant={a.secondary || buttons.length === 2 ? 'secondary' : undefined}
                        height={46}
                        style={buttons.length === 2 ? { flex: 1 } : undefined}
                      />
                    ))}
                  </View>
                ) : null}
                {links.map((a) => (
                  <Text key={a.label} style={styles.link} onPress={a.busy ? undefined : a.onPress} accessibilityRole="button">
                    {a.busy ? 'Working…' : a.label}
                  </Text>
                ))}
                {g.note ? (
                  <View style={styles.note}>
                    <Icon icon={icons.clockHistory} size={14} color={m.goldDark} />
                    <Text style={styles.noteText} {...balanceProps}>{g.note}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        {tab === 'received' && p.creditLine ? <Text style={[mType.smallDark, { marginTop: 16 }]}>{p.creditLine}</Text> : null}
        <MobileButton label={p.sent.length ? 'Send another gift' : 'Send a gift'} variant="secondary" onPress={p.onSend} style={{ marginTop: 20 }} />
        <MobileFooterSpacer />
        <MobileFooterBleed inset={16} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 48 },
  h1: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 4 },
  loading: { paddingVertical: 60, alignItems: 'center' },
  gift: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line, gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: m.beige, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  title: { fontSize: 16, color: m.ink, ...mFont(400) },
  sub: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(300) },
  pill: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: m.beige, color: m.goldDark, fontSize: 12.5, paddingHorizontal: 10, height: 24, lineHeight: 24, borderRadius: 12, overflow: 'hidden', ...mFont(400) },
  buttons: { gap: 8 },
  link: { fontSize: 14, color: m.goldDark, textDecorationLine: 'underline', alignSelf: 'flex-start', paddingVertical: 4, ...mFont(400) },
  note: { flexDirection: 'row', gap: 10, backgroundColor: m.beige, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18, color: m.goldDark, ...mFont(400) },
});
