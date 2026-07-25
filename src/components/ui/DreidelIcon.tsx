import React from 'react';
import { Image } from 'react-native';

type Props = {
  size?: number;
  color?: string;
};

/** Dreidel from Noun Project (CC BY) — Vectors Point, https://thenounproject.com/icon/dreidel-2577624/ */
const DREIDEL_ICON = require('../../../assets/icons/dreidel-noun-project-2577624.png');

export function DreidelIcon({ size = 16, color = '#111827' }: Props) {
  return (
    <Image
      source={DREIDEL_ICON}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessibilityElementsHidden
    />
  );
}
