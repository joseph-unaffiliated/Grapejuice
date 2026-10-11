import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { TaskHeader } from './TaskHeader';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { m, mFont } from './mobileTheme';

type Props = {
  back: { label: string; onPress: () => void };
  /** "New chat" in a thread, "History" on the welcome; omit for nothing. */
  action?: { label: string; onPress: () => void } | null;
};

/** The phone Rav header — shared by the Rav tab and the storefront Rav sheet. */
export function RavTaskHeader({ back, action }: Props) {
  return (
    <TaskHeader
      back={back}
      title="Rav"
      mark={
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon={icons.childReaching} size={15} color={m.ink} />
        </View>
      }
      right={
        action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 13, color: m.goldDark, ...mFont(400) }}>{action.label}</Text>
          </Pressable>
        ) : null
      }
    />
  );
}
