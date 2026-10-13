import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type ProductNoteCopy = { before: string; link: { label: string; slug: string }; after: string };

const PRODUCT_NOTES: Record<string, ProductNoteCopy> = {
  'electric-candles': {
    before:
      'These candles are much too thick to fit in traditional hanukkiahs, including ours. If you want a hanukkiah for these Electric Candles, make your own with the ',
    link: { label: 'Airdry Clay Menorah', slug: 'airdry-clay-menorah' },
    after: '.',
  },
};

/** Item-specific caveat shown under the description, with a link to the related product. */
export function ProductNote({
  itemId,
  style,
  linkStyle,
  onOpenProduct,
}: {
  itemId: string;
  style: StyleProp<TextStyle>;
  linkStyle: StyleProp<TextStyle>;
  onOpenProduct: (slug: string) => void;
}) {
  const note = PRODUCT_NOTES[itemId];
  if (!note) return null;
  return (
    <Text style={style}>
      {note.before}
      <Text style={linkStyle} onPress={() => onOpenProduct(note.link.slug)} accessibilityRole="link">
        {note.link.label}
      </Text>
      {note.after}
    </Text>
  );
}
