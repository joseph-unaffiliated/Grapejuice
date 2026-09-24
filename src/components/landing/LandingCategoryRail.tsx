import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { LandingCategoryCardDef } from '../../constants/landingAudiences';
import type { MainStackParamList } from '../../navigation/types';
import { StorefrontCategoryRail } from '../storefront/StorefrontCategoryRail';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  heading?: string;
  body?: string;
  cards: LandingCategoryCardDef[];
};

/**
 * Landing wrapper around {@link StorefrontCategoryRail} — navigates to category PLPs.
 */
export function LandingCategoryRail({ heading, body, cards }: Props) {
  const navigation = useNavigation<Nav>();

  return (
    <StorefrontCategoryRail
      heading={heading}
      body={body}
      cards={cards}
      onCategoryPress={(category) =>
        navigation.navigate('StorefrontCategory', { category })
      }
    />
  );
}
