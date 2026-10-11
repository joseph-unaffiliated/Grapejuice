import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BoxThumbRow } from '../../components/mobile/BoxSummary';
import { primaryPhoto, SAMPLE_BOX_IDS } from '../../components/mobile/catalogPhotos';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';
import { useCatalog } from '../../hooks/useCatalog';
import { useBoxLockDay } from '../../hooks/useBoxLockDay';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import type { GiftPath } from '../gift/giftGiveTypes';

export const GIFT_PATH_LABEL: Record<GiftPath, string> = { customize: 'A Hanukkah box', credit_only: 'Hanukkah credit' };

/** Phone gift step 1 (gift.html s=2): title, then a radio card per path. */
export function MobileGiftPathCards({
  giftPath,
  onChange,
  boxesClosed,
  arrivesBefore,
  hasError,
}: {
  giftPath: GiftPath | null;
  onChange: (path: GiftPath) => void;
  boxesClosed: boolean;
  arrivesBefore: string;
  hasError?: boolean;
}) {
  const lockDay = useBoxLockDay();
  const { items } = useCatalog();
  const thumbs = useMemo(() => {
    const byId = new Map(items.map((c) => [c.id, c]));
    return SAMPLE_BOX_IDS.map((id) => ({ id, imageUrl: primaryPhoto(byId.get(id)) }));
  }, [items]);
  const from = `From ${formatCatalogDollars(listBoxCentsForKids(1))}`;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
          What would you like to send?
        </Text>
        <Text style={styles.sub} {...balanceProps}>
          Either way, they get a note from you and everything arrives before {arrivesBefore}.
        </Text>
      </View>
      <PathCard
        on={giftPath === 'customize'}
        error={hasError}
        disabled={boxesClosed}
        title={GIFT_PATH_LABEL.customize}
        body={boxesClosed ? `Gift boxes for this Hanukkah closed on ${lockDay}. You can still send gift credit.` : 'We pick everything for their family. You can swap anything before you send it.'}
        price={boxesClosed ? undefined : from}
        onPress={() => onChange('customize')}
      >
        {boxesClosed ? null : (
          <View style={{ marginTop: 12 }}>
            <BoxThumbRow items={thumbs} size="sm" />
          </View>
        )}
      </PathCard>
      <PathCard
        on={giftPath === 'credit_only'}
        error={hasError}
        title={GIFT_PATH_LABEL.credit_only}
        body="They build their own box with it. Anything over the credit goes on their card."
        price={`A box's worth for their family, ${from.toLowerCase()}`}
        onPress={() => onChange('credit_only')}
      />
    </View>
  );
}

function PathCard({
  on,
  error,
  disabled,
  title,
  body,
  price,
  onPress,
  children,
}: {
  on: boolean;
  error?: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  price?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      style={[styles.card, on && styles.cardOn, error && !on && styles.cardError, disabled && { opacity: 0.55 }]}
    >
      <View style={[styles.dot, on && styles.dotOn]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {children}
        {price ? <Text style={styles.price}>{price}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 22, gap: 10 },
  h1: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  sub: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, marginHorizontal: mGutter, marginBottom: 12, borderWidth: 1, borderColor: m.line, borderRadius: 16, backgroundColor: m.white },
  cardOn: { borderColor: m.gold, borderWidth: 2, padding: 15, backgroundColor: m.beige },
  cardError: { borderColor: m.warn },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: m.gold, marginTop: 2 },
  dotOn: { backgroundColor: m.gold, ...({ boxShadow: `inset 0 0 0 3px ${m.beige}` } as object) },
  title: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: m.ink, ...mFont(500) },
  body: { fontSize: 14, lineHeight: 20, color: m.muted, marginTop: 4, ...mFont(400) },
  price: { fontSize: 14, lineHeight: 20, color: m.ink, marginTop: 10, ...mFont(400) },
});
