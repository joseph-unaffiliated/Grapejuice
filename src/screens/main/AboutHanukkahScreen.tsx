import React, { useMemo } from 'react';
import { Platform, ScrollView, Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HanukkahPracticesOverview } from '../../components/holiday/HanukkahPracticesOverview';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { spacing, typography, MOBILE_GUTTER } from '../../constants/theme';

/** Match Home / My Box desktop top inset. */
const DESKTOP_CONTENT_TOP = 41;

/** Light in-app primer (panel Jun 10/17) — print guide still ships in box. */
export function AboutHanukkahScreen() {
  const navigation = useNavigation();
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const styles = useMemo(() => createAboutStyles(colors, isDesktop), [colors, isDesktop]);

  const body = (
    <>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button">
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>About Hanukkah</Text>
      <Text style={styles.lead}>
        Hanukkah is an eight-night festival of light. Families light candles, play dreidel, eat fried foods,
        give small gifts, and tell the story of the Maccabees. You do not need to do everything — pick what
        feels right for your home.
      </Text>
      <HanukkahPracticesOverview layout="stack" showIntro={false} />
      <View style={styles.tip}>
        <Text style={styles.tipTitle}>Your box</Text>
        <Text style={styles.tipBody}>
          Everything in your Grapejuice box maps to one of these practices. Swap items in My Box until the
          customization deadline.
        </Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={Platform.OS === 'web' ? [] : ['top']}>
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={[styles.contentColumn, { maxWidth: layoutWidth }]}>{body}</View>
          ) : (
            body
          )}
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

function createAboutStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgPrimary },
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary, width: '100%' },
    scrollContent: {
      paddingTop: isDesktop ? DESKTOP_CONTENT_TOP : spacing.lg,
      paddingBottom: spacing.xxl,
      width: '100%',
      ...(isDesktop ? { alignItems: 'stretch' as const } : null),
    },
    contentColumn: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: MOBILE_GUTTER,
    },
    back: { marginBottom: spacing.md },
    backText: { fontSize: typography.lg, color: colors.goldMuted },
    title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md, color: colors.textPrimary },
    lead: {
      fontSize: typography.lg,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    tip: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: 8,
      backgroundColor: colors.accentCream,
      gap: spacing.xs,
    },
    tipTitle: { fontWeight: '700', fontSize: typography.lg, color: colors.textPrimary },
    tipBody: { fontSize: typography.md, lineHeight: 18, color: colors.textSecondary },
  });
}
