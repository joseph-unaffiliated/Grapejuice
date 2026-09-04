import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../../stores/authStore';
import { useAuthFlowStore } from '../../../stores/authFlowStore';
import { spacing, typography, typeface } from '../../../constants/theme';
import { useThemeMode } from '../../../context/ThemeContext';
import type { SemanticColors } from '../../../constants/themeMode';
import type { MainStackParamList } from '../../../navigation/types';
import { GrapejuiceButton } from '../../../components/ui/GrapejuiceButton';
import { WebContentPanel } from '../../../components/layout/WebContentPanel';
import { useWebLayout } from '../../../hooks/useWebLayout';

type Nav = StackNavigationProp<MainStackParamList, 'Checkout'>;

export function CheckoutAuthGate() {
  const navigation = useNavigation<Nav>();
  const startAuthForCheckout = useAuthFlowStore((s) => s.startAuthForCheckout);
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);

  const body = (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Save your box to checkout</Text>
      <Text style={styles.body}>
        You built a great box. Create a free account to place your order — we will keep everything you
        picked.
      </Text>

      <GrapejuiceButton
        label="Create account"
        variant="filled"
        onPress={() => startAuthForCheckout('signup')}
        style={styles.btn}
      />

      <GrapejuiceButton
        label="Log in"
        variant="pillOutline"
        onPress={() => startAuthForCheckout('signin')}
        style={styles.btn}
      />
    </ScrollView>
  );

  if (Platform.OS === 'web') {
    return (
      <WebContentPanel
        flush={isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        {body}
      </WebContentPanel>
    );
  }

  return body;
}

export function CheckoutAuthGateWithAuthCheck() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return null;
  return <CheckoutAuthGate />;
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: isDesktop ? spacing.xxl : spacing.xxl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    backRow: { marginBottom: spacing.md },
    backLink: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
    },
    title: {
      fontSize: 28,
      color: colors.textPrimary,
      letterSpacing: -0.4,
      marginBottom: spacing.md,
      ...typeface('medium'),
    },
    body: {
      fontSize: typography.lg,
      color: colors.textSecondary,
      lineHeight: typography.lg * 1.4,
      marginBottom: spacing.xl,
      ...typeface('regular'),
    },
    btn: { alignSelf: 'stretch', marginBottom: spacing.md },
  });
}
