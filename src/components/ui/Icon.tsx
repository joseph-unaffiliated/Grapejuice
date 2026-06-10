import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { icons } from '../../constants/icons';

type AppIconDefinition = (typeof icons)[keyof typeof icons];

export interface IconProps {
  icon: AppIconDefinition;
  size?: number;
  color?: string;
  style?: object;
}

export const Icon: React.FC<IconProps> = ({ icon, size = 16, color = '#111827', style }) => {
  return <FontAwesomeIcon icon={icon as never} size={size} color={color} style={style} />;
};
