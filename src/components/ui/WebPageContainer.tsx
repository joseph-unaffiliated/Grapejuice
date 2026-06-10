import React, { type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewStyle } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useWebScreenFrame } from '../../constants/webLayout';
import { spacing, borderRadius, shadowsWeb, LAYOUT } from '../../constants/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Centered card on tablet/desktop web (auth flows). */
  authCard?: boolean;
};

/** Responsive web page wrapper — full width on native. */
export function WebPageContainer({ children, style, authCard = false }: Props) {
  const frame = useWebScreenFrame();
  const { isDesktop } = useWebLayout();

  return (
    <View
      style={[
        styles.root,
        frame,
        authCard && isDesktop && styles.authCard,
        authCard && isDesktop && Platform.OS === 'web' ? { boxShadow: shadowsWeb.card } : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  authCard: {
    maxWidth: LAYOUT.WEB_AUTH_CARD_MAX_WIDTH,
    alignSelf: 'center',
    width: '100%',
    marginTop: spacing.xxl,
    padding: spacing.xl,
    borderRadius: borderRadius.xxl,
    backgroundColor: '#FFFFFF',
  },
});
