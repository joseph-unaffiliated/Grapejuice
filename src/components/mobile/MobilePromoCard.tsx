import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MobileButton } from './MobileButton';
import { balanceProps, m, mFont, mGutter, mRadius } from './mobileTheme';

type Cta = { label: string; onPress: () => void; disabled?: boolean };

type Props = {
  headline: string;
  body?: string;
  primary: Cta;
  secondary?: Cta;
  style?: StyleProp<ViewStyle>;
};

/** Beige promo card for phone content pages: headline, short body, stacked full-width buttons. */
export function MobilePromoCard({ headline, body, primary, secondary, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.card}>
        <Text style={styles.headline} {...balanceProps}>{headline}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <View style={styles.ctas}>
          <MobileButton label={primary.label} onPress={primary.onPress} disabled={primary.disabled} height={48} />
          {secondary ? (
            <MobileButton
              label={secondary.label}
              onPress={secondary.onPress}
              disabled={secondary.disabled}
              variant="secondary"
              height={48}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', paddingHorizontal: mGutter },
  card: { backgroundColor: m.beige, borderRadius: mRadius.lg, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20, gap: 10 },
  headline: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6, color: m.ink, ...mFont(400) },
  body: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
  ctas: { gap: 10, marginTop: 6 },
});
