import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import {
  ONBOARDING_WIZARD_NAV_STEPS,
  type OnboardingWizardNavStepId,
} from '../../navigation/onboardingSteps';
import { STOREFRONT_H_SCROLL_CLASS } from '../storefront/storefrontScroll';
import {
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  activeStep: OnboardingWizardNavStepId;
  /** Highest step index the household has reached (0-based in ONBOARDING_WIZARD_NAV_STEPS). */
  maxReachedIndex: number;
  onPress: (step: OnboardingWizardNavStepId) => void;
};

/**
 * Dark secondary bar for the box-builder wizard — same chrome as StorefrontCategoryNav,
 * but lists intake steps instead of product aisles.
 */
export function OnboardingWizardNav({ activeStep, maxReachedIndex, onPress }: Props) {
  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // @ts-expect-error web className
        className={Platform.OS === 'web' ? STOREFRONT_H_SCROLL_CLASS : undefined}
      >
        {ONBOARDING_WIZARD_NAV_STEPS.map((step, index) => {
          const active = step.id === activeStep;
          const reachable = index <= maxReachedIndex;
          const isAccent = step.navStyle === 'accent';
          return (
            <React.Fragment key={step.id}>
              {step.separatorBefore ? (
                <Text
                  style={styles.separator}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  |
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.linkHit, active && styles.linkHitActive]}
                onPress={() => {
                  if (!reachable || active) return;
                  onPress(step.id);
                }}
                disabled={!reachable}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !reachable }}
                accessibilityLabel={`Step ${index + 1}: ${step.label}`}
              >
                <Text
                  style={[
                    styles.link,
                    isAccent && styles.linkAccent,
                    active && styles.linkActive,
                    !reachable && !isAccent && styles.linkLocked,
                    !reachable && isAccent && styles.linkAccentLocked,
                  ]}
                >
                  {step.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: semanticColors.logoDark,
    borderBottomWidth: 0,
    borderTopWidth: 0,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0,
  },
  separator: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
    opacity: 0.35,
    flexShrink: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  linkHit: {
    flexShrink: 0,
    // Active underline offset under label.
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  linkHitActive: {
    borderBottomColor: semanticColors.brand,
  },
  link: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
    opacity: 0.85,
  },
  linkAccent: {
    color: semanticColors.brand,
    opacity: 1,
  },
  linkActive: {
    opacity: 1,
  },
  linkLocked: {
    opacity: 0.35,
  },
  linkAccentLocked: {
    opacity: 0.45,
  },
});
