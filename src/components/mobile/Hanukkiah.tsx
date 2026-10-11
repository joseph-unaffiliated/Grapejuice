import React from 'react';
import { Platform, View } from 'react-native';
import { m } from './mobileTheme';

type Props = {
  /** Candles lit tonight, 0-8. The shamash is always present and lit when night > 0 (or `lit`). */
  night?: number;
  lit?: boolean;
  width?: number;
  label?: string;
};

/**
 * The brand hanukkiah from the mockups: black concentric arms with rounded ends,
 * stubby light-grey candles the same width as the arms, gold teardrop flames, no base.
 * Candles fill from the right, the shamash stands in the middle. Web renders inline SVG;
 * native gets a plain spacer (no native screen uses it).
 */
export function Hanukkiah({ night = 0, lit = true, width = 170, label }: Props) {
  const sw = 20;
  const cx = 160;
  const cupY = 121;
  const shY = 105;
  const rs = [34, 68, 102, 136];
  const foot = cupY + 136;
  const xs = [24, 58, 92, 126, 160, 194, 228, 262, 296];
  const order = [8, 7, 6, 5, 3, 2, 1, 0].slice(0, Math.max(0, Math.min(8, night)));
  const r = sw / 2;
  const viewH = foot + r + 2;
  const height = Math.round((width * viewH) / 320);

  if (Platform.OS !== 'web') return <View style={{ width, height }} />;

  const h = React.createElement;
  const candle = (x: number, base: number, on: boolean) => {
    const bot = base - r - 6 - r;
    const top = bot - 18;
    const f = top - r - 9;
    return [
      h('path', { key: `c${x}`, d: `M${x} ${bot}V${top}`, stroke: '#D1D5DB', strokeWidth: sw, strokeLinecap: 'round' }),
      on
        ? h('path', {
            key: `f${x}`,
            d: `M${x} ${f - 30}C${x + 6} ${f - 22} ${x + r} ${f - 16} ${x + r} ${f - r}A${r} ${r} 0 0 1 ${x - r} ${f - r}C${x - r} ${f - 16} ${x - 6} ${f - 22} ${x} ${f - 30}Z`,
            fill: m.gold,
          })
        : null,
    ];
  };

  return h(
    'svg',
    {
      viewBox: `0 0 320 ${viewH}`,
      width,
      height,
      role: 'img',
      'aria-label': label ?? `Night ${night}`,
      style: { display: 'block' },
    },
    ...rs.map((rr) =>
      h('path', { key: `a${rr}`, d: `M${cx - rr} ${cupY}A${rr} ${rr} 0 0 0 ${cx + rr} ${cupY}`, fill: 'none', stroke: m.ink, strokeWidth: sw, strokeLinecap: 'round' })
    ),
    h('path', { key: 'post', d: `M${cx} ${foot}V${shY}`, stroke: m.ink, strokeWidth: sw, strokeLinecap: 'round' }),
    ...order.flatMap((i) => candle(xs[i], cupY, lit)),
    ...candle(cx, shY, lit || night > 0)
  );
}
