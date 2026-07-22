import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CapacityRing } from './CapacityRing';
import { useInViewOnce } from '../../hooks/useInViewOnce';
import { spacing, typography, shadows, shadowsWeb, borderRadius, colors as palette } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainTabsParamList } from '../../navigation/types';

type Nav = BottomTabNavigationProp<MainTabsParamList>;

export const PASSOVER_RAV_PROMPT = "I'd like to start thinking about Passover";

/** Pause after the card enters view so attention lands before the ring fills. */
const RING_ANIM_DELAY_MS = 550;

type Props = {
  capacityPercent: number;
  onRegister: () => void;
  registered?: boolean;
};

/** Figma 370:3396 — ring when open; centered copy + Rav CTA when pre-registered. */
export function PassoverPreregisterCard({ capacityPercent, onRegister, registered }: Props) {
  const navigation = useNavigation<Nav>();
  const { colors: themeColors } = useThemeMode();
  const styles = useMemo(() => createPassoverCardStyles(themeColors), [themeColors]);
  const { ref: inViewRef, inView } = useInViewOnce(0.4);
  const [animateRing, setAnimateRing] = useState(false);

  useEffect(() => {
    if (!inView || animateRing) return;
    const timer = setTimeout(() => setAnimateRing(true), RING_ANIM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inView, animateRing]);

  const cardStyle = [
    styles.card,
    registered ? styles.cardRegistered : styles.cardOpen,
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow,
  ];

  if (registered) {
    return (
      <View style={cardStyle}>
        <View style={styles.copyRegistered}>
          <Text style={[styles.title, styles.textCenter]}>You&apos;re pre-registered for Passover 2027</Text>
          <Text style={[styles.sub, styles.textCenter]}>
            You&apos;ll see what your box has in it in February
          </Text>
          <TouchableOpacity
            style={styles.ctaRegistered}
            onPress={() => navigation.navigate('Rav', { newChat: true, initialMessage: PASSOVER_RAV_PROMPT })}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{PASSOVER_RAV_PROMPT}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View ref={inViewRef} collapsable={false}>
      <TouchableOpacity style={cardStyle} onPress={onRegister} activeOpacity={0.9}>
        <View style={styles.copyOpen}>
          <Text style={styles.title}>Pre-register for Passover 2027</Text>
          <Text style={styles.sub}>Spots are filling up. Sign up soon.</Text>
        </View>
        <CapacityRing percent={capacityPercent} animate={animateRing} deferUntilAnimate />
      </TouchableOpacity>
    </View>
  );
}

function createPassoverCardStyles(colors: SemanticColors) {
  return StyleSheet.create({
    card: {
      paddingVertical: 21,
      paddingHorizontal: spacing.lg,
      borderRadius: 16,
      backgroundColor: colors.bgPrimary,
    },
    cardOpen: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    cardRegistered: {
      flexDirection: 'column',
      alignItems: 'center',
    },
    copyOpen: { flex: 1, minWidth: 0 },
    copyRegistered: {
      width: '100%',
      alignItems: 'center',
      gap: 0,
    },
    title: { fontSize: typography.lg, fontWeight: '400', color: colors.textPrimary, letterSpacing: -0.26 },
    sub: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textSecondary,
      marginTop: spacing.xs,
      lineHeight: 18,
    },
    textCenter: { textAlign: 'center' },
    ctaRegistered: {
      marginTop: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: palette.warm[200],
      alignSelf: 'stretch',
    },
    ctaText: {
      fontSize: typography.sm,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.22,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}
