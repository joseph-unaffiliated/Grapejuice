import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { GrapejuiceButton } from '../ui/GrapejuiceButton';
import { useThemeMode } from '../../context/ThemeContext';
import { useSession } from '../../hooks/useSession';
import { abandonOwnBox, startOwnBoxBuild } from '../../navigation/boxEntry';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import {
  borderRadius,
  spacing,
  typography,
  typeface,
} from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  /** Hide while the box is locked or view-only. */
  disabled?: boolean;
};

/**
 * “Reset my box” under the My Box summary heading — confirm before wiping
 * curation (start the questionnaire again, or abandon and browse with no box).
 */
export function ResetMyBoxControl({ disabled = false }: Props) {
  const { colors } = useThemeMode();
  const styles = createStyles(colors);
  const { household, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
  };

  const onStartFresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await startOwnBoxBuild((opts) => refresh(opts), household?.id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const onAbandon = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await abandonOwnBox(household?.id, (opts) => refresh(opts));
      setOpen(false);
      navigateMainStack('StorefrontHome');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Reset my box"
        style={({ pressed }) => [
          styles.trigger,
          disabled && styles.triggerDisabled,
          pressed && !disabled && styles.triggerPressed,
        ]}
      >
        <Text style={styles.triggerLabel}>Reset my box</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={close}
            accessibilityLabel="Cancel and keep my box"
          />
          <View
            style={styles.card}
            accessibilityRole="summary"
            accessibilityLabel="Reset my box"
          >
            <Text style={styles.headline}>Are you sure?</Text>
            <Text style={styles.body}>
              Some items you&apos;ve selected may no longer be available once reset.
            </Text>
            <View style={styles.actions}>
              <GrapejuiceButton
                label="Cancel (keep my box)"
                variant="filled"
                onPress={close}
                disabled={busy}
                textStyle={{ color: colors.logoDark }}
              />
              <GrapejuiceButton
                label="Start fresh"
                variant="pillOutline"
                onPress={() => void onStartFresh()}
                loading={busy}
                disabled={busy}
              />
              <GrapejuiceButton
                label="I don't want a box"
                variant="pillOutline"
                onPress={() => void onAbandon()}
                disabled={busy}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    trigger: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    triggerPressed: { opacity: 0.7 },
    triggerDisabled: { opacity: 0.4 },
    triggerLabel: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      letterSpacing: -0.2,
      textDecorationLine: 'underline',
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(17, 2, 34, 0.45)',
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.bgPrimary,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      gap: spacing.md,
      zIndex: 1,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 16px 48px rgba(17, 2, 34, 0.28)' } as object)
        : {
            shadowColor: '#110222',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.28,
            shadowRadius: 24,
            elevation: 16,
          }),
    },
    headline: {
      ...typeface('medium'),
      fontSize: 24,
      lineHeight: 28,
      letterSpacing: -0.4,
      color: colors.logoDark,
      textAlign: 'center',
    },
    body: {
      ...typeface('regular'),
      fontSize: typography.md,
      lineHeight: 18,
      letterSpacing: -0.2,
      color: colors.textSecondary,
      textAlign: 'center',
      ...(Platform.OS === 'web'
        ? ({ textWrap: 'balance' } as object)
        : null),
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.sm,
      width: '100%',
    },
  });
}
