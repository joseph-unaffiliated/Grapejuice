import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { semanticColors, typography } from '../../constants/theme';
import type { IconName } from '../../constants/icons';

type Props = {
  icon: (typeof icons)[IconName];
  color: string;
  size: number;
  badge?: number;
};

export function TabBarIconWithBadge({ icon, color, size, badge }: Props) {
  return (
    <View style={styles.wrap}>
      <Icon icon={icon} size={size} color={color} />
      {badge != null && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: semanticColors.textInverse,
  },
});
