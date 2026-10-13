import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { m, mFont, mRadius } from './mobileTheme';

export type BoxThumb = {
  id: string;
  imageUrl?: string | null;
  /** Quantity badge, e.g. 3 or "+1". */
  count?: number | string;
  /** Gold outline: added by you / selected. */
  mine?: boolean;
  /** Blurred preview (onboarding reveal). */
  blur?: boolean;
  /** Overlay text, e.g. "+2". */
  label?: string;
  onPress?: () => void;
};

/** The shared row of box thumbnails: six per row, scrolling when there are more. */
export function BoxThumbRow({ items, size = 'lg', onThumbIntent }: { items: BoxThumb[]; size?: 'lg' | 'sm'; onThumbIntent?: () => void }) {
  const scroll = items.length > 6;
  const [rowWidth, setRowWidth] = React.useState(0);
  // Six cells per row whatever the count, so a three-item box doesn't get giant tiles.
  const cellSize = scroll ? 48 : rowWidth > 60 ? Math.floor((rowWidth - 6 * 5) / 6) : undefined;
  const cells = items.map((it) => (
    <Pressable
      key={it.id + (it.label ?? '')}
      onPressIn={it.onPress ? onThumbIntent : undefined}
      onPress={it.onPress}
      disabled={!it.onPress}
      accessibilityRole={it.onPress ? 'button' : undefined}
      style={[styles.cell, cellSize != null && { width: cellSize, height: cellSize, flexGrow: 0, flexShrink: 0, flexBasis: cellSize }, it.mine && styles.cellMine]}
    >
      {it.imageUrl ? (
        <Image
          source={{ uri: it.imageUrl }}
          style={[styles.img, it.mine && styles.imgMine, it.blur && (Platform.OS === 'web' ? ({ filter: 'blur(5px)', transform: [{ scale: 1.1 }] } as object) : null)]}
          blurRadius={it.blur && Platform.OS !== 'web' ? 6 : 0}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.img, { backgroundColor: m.img }]} />
      )}
      {it.count ? (
        <View style={[styles.count, it.mine && styles.countMine]}>
          <Text style={[styles.countText, it.mine && styles.countTextMine]}>{it.count}</Text>
        </View>
      ) : null}
      {it.label ? (
        <View style={styles.more}>
          <Text style={styles.moreText}>{it.label}</Text>
        </View>
      ) : null}
    </Pressable>
  ));
  const panMark = Platform.OS === 'web' ? ({ dataSet: { panx: '1' } } as object) : null;
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
        style={[styles.scroll, Platform.OS === 'web' ? ({ touchAction: 'pan-x', overscrollBehavior: 'contain' } as object) : null]}
        {...panMark}
      >
        {cells}
      </ScrollView>
    );
  }
  return (
    <View
      style={[styles.grid, size === 'sm' && styles.gridSm, Platform.OS === 'web' ? ({ touchAction: 'pan-x' } as object) : null]}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      {...panMark}
    >
      {cells}
    </View>
  );
}

type Props = {
  size?: 'lg' | 'sm';
  title?: string;
  sub?: string | React.ReactNode;
  total?: string;
  /** Right-aligned link in the title row ("See list", "›"). */
  link?: React.ReactNode;
  items: BoxThumb[];
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One box summary, two sizes: large on the home page, account and box pitch; small in
 * the menu, the box editor and checkout. Plain beige; gold outlines only on your items.
 */
export function BoxSummary({ size = 'lg', title = 'Your Hanukkah box', sub, total, link, items, children, onPress, style, testID }: Props) {
  const sm = size === 'sm';
  const fromThumb = React.useRef(false);
  const noteThumb = () => {
    fromThumb.current = true;
    setTimeout(() => {
      fromThumb.current = false;
    }, 0);
  };
  const body = (
    <>
      <View style={styles.top}>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, sm && styles.titleSm]}>{title}</Text>
          {sub ? typeof sub === 'string' ? <Text style={[styles.sub, sm && styles.subSm]}>{sub}</Text> : sub : null}
        </View>
        {total ? <Text style={[styles.total, sm && styles.totalSm]}>{total}</Text> : null}
        {link ?? null}
      </View>
      {items.length ? <BoxThumbRow items={items} size={size} onThumbIntent={noteThumb} /> : null}
      {children}
    </>
  );
  const rootStyle = [styles.root, sm && styles.rootSm, style];
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          if (fromThumb.current) return;
          onPress();
        }}
        accessibilityRole="button"
        style={rootStyle}
        testID={testID}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View style={rootStyle} testID={testID}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: m.beige, borderRadius: mRadius.lg, padding: 16, gap: 12, alignSelf: 'stretch', maxWidth: '100%', minWidth: 0 },
  rootSm: { borderRadius: mRadius.md, padding: 12, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleWrap: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: m.ink, ...mFont(500) },
  titleSm: { fontSize: 15, lineHeight: 19 },
  sub: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  subSm: { fontSize: 12.5, color: m.muted },
  total: { fontSize: 17, color: m.ink, ...mFont(400) },
  totalSm: { fontSize: 14.5 },
  grid: { flexDirection: 'row', gap: 6, width: '100%', alignSelf: 'stretch', minWidth: 0 },
  gridSm: { gap: 6 },
  scroll: { marginRight: -12 },
  scrollRow: { flexDirection: 'row', gap: 6, paddingRight: 12, paddingTop: 4 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: mRadius.sm, backgroundColor: m.white, overflow: 'visible' },
  cellMine: { borderWidth: 2, borderColor: m.gold, borderRadius: 9 },
  img: { width: '100%', height: '100%', borderRadius: mRadius.sm },
  imgMine: { borderRadius: 7 },
  count: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: m.ink, alignItems: 'center', justifyContent: 'center',
  },
  countMine: { backgroundColor: m.gold },
  countText: { color: m.white, fontSize: 10, ...mFont(500) },
  countTextMine: { color: m.ink },
  more: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: mRadius.sm } as ViewStyle,
  moreText: { fontSize: 12, color: m.ink, ...mFont(500) },
});
