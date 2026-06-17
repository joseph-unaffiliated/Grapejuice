import React from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HanukkahPracticesOverview } from '../../components/holiday/HanukkahPracticesOverview';
import { semanticColors, spacing, typography } from '../../constants/theme';

/** Light in-app primer (panel Jun 10/17) — print guide still ships in box. */
export function AboutHanukkahScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { marginBottom: spacing.md },
  backText: { fontSize: typography.lg, color: semanticColors.goldMuted },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md },
  lead: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, marginBottom: spacing.lg },
  tip: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: semanticColors.accentCream,
    gap: spacing.xs,
  },
  tipTitle: { fontWeight: '700', fontSize: typography.lg },
  tipBody: { fontSize: typography.md, lineHeight: 18, color: semanticColors.textSecondary },
});
