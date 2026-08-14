import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { LandingCategoryCardDef } from '../../constants/landingAudiences';
import type { MainStackParamList } from '../../navigation/types';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { HorizontalDragScrollView } from '../home/HorizontalDragScrollView';
import {
  horizontalRailContentStyle,
  horizontalRailGutterPadding,
  horizontalRailOuterStyle,
  horizontalRailScrollStyle,
} from '../home/CatalogProductRail';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  heading?: string;
  body?: string;
  cards: LandingCategoryCardDef[];
};

/**
 * Large photo category cards in a horizontal rail → filtered category PLP.
 * Inspired by Pottery Barn Halloween “shop the look” section tiles.
 */
export function LandingCategoryRail({ heading, body, cards }: Props) {
  const navigation = useNavigation<Nav>();
  const { width: windowWidth } = useWindowDimensions();

  /** Big cards with a peek of the next — ~72% viewport on phone, capped on desktop. */
  const cardWidth = useMemo(() => {
    if (windowWidth < 768) return Math.round(Math.min(300, windowWidth * 0.72));
    if (windowWidth < 1100) return 320;
    return 360;
  }, [windowWidth]);

  if (!cards.length) return null;

  return (
    <View style={styles.root}>
      {heading ? (
        <View style={styles.intro}>
          <Text style={styles.heading}>{heading}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>
      ) : null}
      <View style={horizontalRailOuterStyle()}>
        <HorizontalDragScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          nestedScrollEnabled
          style={horizontalRailScrollStyle()}
          contentContainerStyle={horizontalRailContentStyle({
            gap: spacing.md,
            alignItems: 'stretch',
            ...horizontalRailGutterPadding(MOBILE_GUTTER),
          })}
        >
          {cards.map((card) => (
            <TouchableOpacity
              key={card.category}
              style={[styles.card, { width: cardWidth }]}
              onPress={() => navigation.navigate('StorefrontCategory', { category: card.category })}
              accessibilityRole="link"
              accessibilityLabel={`Shop ${card.label}`}
              activeOpacity={0.9}
            >
              <Image source={card.image} style={styles.image} resizeMode="cover" />
              <View style={styles.scrim} pointerEvents="none" />
              <Text style={styles.label}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </HorizontalDragScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  intro: {
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.md,
    gap: spacing.xs,
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  heading: {
    ...typeface('medium'),
    fontSize: typography.xl,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  body: {
    ...typeface('light'),
    fontSize: typography.lg,
    lineHeight: 24,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  card: {
    aspectRatio: 4 / 5,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
    justifyContent: 'flex-end',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 2, 34, 0.28)',
  },
  label: {
    ...typeface('medium'),
    fontSize: 22,
    lineHeight: 28,
    color: semanticColors.textInverse,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
    zIndex: 1,
    letterSpacing: -0.3,
  },
});
