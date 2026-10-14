import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { clearPersistedPilotToken, readPersistedPilotToken } from '../../navigation/pilotLink';
import { getPilotInvite, type PilotInviteView } from '../../services/pilot/pilotApi';
import { isPilotPreviewToken, pilotPreviewView } from '../../services/pilot/pilotPreview';
import { MobileButton } from '../mobile/MobileButton';
import { m, mFont, mRadius } from '../mobile/mobileTheme';
import type { MainStackParamList } from '../../navigation/types';

/** `wrapperStyle` only renders with the banner, so hidden means no layout at all. */
type Props = { style?: StyleProp<ViewStyle>; wrapperStyle?: StyleProp<ViewStyle> };

/**
 * My Box nudge for someone who opened a Pilot Participants invite on this device and still has
 * picks to make, e.g. after "Build my box" sent them here. Renders nothing otherwise.
 */
export function PilotReturnBanner({ style, wrapperStyle }: Props) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const [token, setToken] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const saved = readPersistedPilotToken();
      if (!uid || !saved) {
        setToken(null);
        return undefined;
      }
      let cancelled = false;
      const load: Promise<PilotInviteView> = isPilotPreviewToken(saved)
        ? Promise.resolve(pilotPreviewView(saved))
        : getPilotInvite(saved);
      load
        .then((view) => {
          if (cancelled) return;
          if (view.state === 'unavailable' || view.state === 'closed' || view.state === 'joined') {
            if (!isPilotPreviewToken(saved)) clearPersistedPilotToken();
          }
          setToken(view.state === 'ready' ? saved : null);
        })
        .catch(() => {
          if (!cancelled) setToken(null);
        });
      return () => {
        cancelled = true;
      };
    }, [uid])
  );

  if (!token) return null;
  return (
    <View style={wrapperStyle}>
      <View style={[styles.card, style]}>
        <View style={styles.copy}>
          <Text style={styles.title}>Pilot Participants</Text>
          <Text style={styles.body}>You have a box. Now pick your three free items to ship inside it.</Text>
        </View>
        <MobileButton
          label="Pick my three"
          height={40}
          style={styles.button}
          onPress={() => navigation.navigate('PilotInvite', { token })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    backgroundColor: m.beige,
    borderRadius: mRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  copy: { flex: 1, minWidth: 200, gap: 2 },
  title: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: m.goldDark, ...mFont(500) },
  body: { fontSize: 14.5, lineHeight: 20, color: m.ink, ...mFont(400) },
  button: { width: 'auto', alignSelf: 'center' },
});
