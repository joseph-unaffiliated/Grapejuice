import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { BrandLoadingMark } from './BrandLoadingMark';

type Props = {
  label: string;
  loading?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  /** Loader color — gold on dark CTAs, brand on light. */
  loaderColor?: string;
};

/**
 * Button label that reserves its own layout while loading.
 * The grape overlays the (invisible) label so height never jumps on desktop or mobile.
 */
export function ButtonLoadingLabel({ label, loading = false, labelStyle, loaderColor }: Props) {
  return (
    <View style={styles.slot}>
      <Text style={[labelStyle, loading && styles.hidden]}>{label}</Text>
      {loading ? (
        <View style={styles.overlay} pointerEvents="none">
          <BrandLoadingMark large={false} color={loaderColor} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  hidden: {
    opacity: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
