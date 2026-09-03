import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { FirebaseError } from 'firebase/app';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { claimGiftInvite, peekGiftInvite } from '../../services/gift/giftFlow';
import { useSession } from '../../hooks/useSession';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { MainStackParamList } from '../../navigation/types';
import { spacing, typography, borderRadius, typeface, MOBILE_GUTTER } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import {
  CURATED_GIFT_BOX_LABEL,
  GIFT_CREDIT_LABEL,
  GIFT_CREDIT_SPEND_HINT,
  giftCreditClaimTitle,
} from '../../constants/giftCopy';

type Route = RouteProp<MainStackParamList, 'GiftClaim'>;

type ClaimSurface =
  | 'checking'
  | 'claimable'
  | 'claiming'
  | 'already_claimed'
  | 'not_found'
  | 'unpaid'
  | 'error';

type GiftKind = 'credit' | 'box';

function claimErrorMessage(e: unknown): string {
  if (e instanceof FirebaseError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Try again or contact support.';
}

function isAlreadyClaimedError(e: unknown): boolean {
  const msg = claimErrorMessage(e).toLowerCase();
  return msg.includes('already been claimed') || msg.includes('already claimed');
}

function isNotFoundError(e: unknown): boolean {
  if (e instanceof FirebaseError && e.code === 'functions/not-found') return false;
  const msg = claimErrorMessage(e).toLowerCase();
  return msg.includes('invite not found') || msg.includes('gift invite not found');
}

function giftKindLabel(kind: GiftKind): string {
  return kind === 'box' ? CURATED_GIFT_BOX_LABEL : GIFT_CREDIT_LABEL;
}

/** Recipient claim — magic link lands with ?token=… */
function GiftClaimBody() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const route = useRoute<Route>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const storeToken = useAuthFlowStore((s) => s.pendingGiftClaimToken);
  const token = route.params?.token ?? storeToken ?? '';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { refresh } = useSession();
  const [surface, setSurface] = useState<ClaimSurface>(token ? 'checking' : 'not_found');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [giverName, setGiverName] = useState<string | null>(null);
  const [giftKind, setGiftKind] = useState<GiftKind>('credit');
  const [creditCents, setCreditCents] = useState(0);
  const [peekNonce, setPeekNonce] = useState(0);

  const goHome = () => navigation.navigate('StorefrontHome');

  const claim = useCallback(async () => {
    if (!token || !isAuthenticated) return;
    setSurface('claiming');
    setErrorMessage(null);
    try {
      const result = await claimGiftInvite(token);
      await refresh();
      useAuthFlowStore.getState().setPendingGiftClaimToken(null);
      if (result.giftKind === 'credit') {
        navigation.replace('GiftRecipientReveal', {
          giftInviteId: result.giftInviteId,
          giverName: result.giverName ?? 'Someone who loves you',
          message: result.message,
          giftCreditCents: result.giftCreditCents,
          hasGiverDraft: false,
        });
        return;
      }
      navigation.replace('GiftRecipientReveal', {
        giftInviteId: result.giftInviteId,
        giverName: result.giverName ?? 'Someone who loves you',
        message: result.message,
        giftCreditCents: 0,
        hasGiverDraft: result.hasGiverDraft,
      });
    } catch (e) {
      if (isAlreadyClaimedError(e)) {
        setSurface('already_claimed');
        return;
      }
      if (isNotFoundError(e)) {
        setSurface('not_found');
        return;
      }
      setSurface('error');
      setErrorMessage(claimErrorMessage(e));
    }
  }, [token, isAuthenticated, refresh, navigation]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSurface('checking');
    void (async () => {
      try {
        const peek = await peekGiftInvite(token);
        if (cancelled) return;
        if (peek.status === 'not_found') {
          setSurface('not_found');
          return;
        }
        if (peek.status === 'claimed') {
          setGiverName(peek.giverName ?? null);
          setGiftKind(peek.giftKind ?? 'credit');
          setSurface('already_claimed');
          return;
        }
        if (peek.status === 'unpaid') {
          setGiverName(peek.giverName ?? null);
          setSurface('unpaid');
          return;
        }
        setGiverName(peek.giverName ?? null);
        setGiftKind(peek.giftKind ?? (peek.hasGiverDraft ? 'box' : 'credit'));
        setCreditCents(peek.creditCents ?? 0);
        setSurface('claimable');
      } catch (e) {
        if (cancelled) return;
        setSurface('error');
        setErrorMessage(claimErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, peekNonce]);

  const claiming = surface === 'claiming';
  const fromName = giverName ?? 'Someone special';

  const shell = (content: React.ReactNode) => (
    <WebContentPanel flush centerDesktop omitDesktopTopPadding gutter={!isDesktop} style={styles.panel}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>{content}</View>
      </ScrollView>
    </WebContentPanel>
  );

  if (surface === 'checking') {
    return shell(
      <>
        <ActivityIndicator color={colors.brand} />
        <Text style={[styles.body, styles.checkingBody]}>Checking your gift link…</Text>
      </>
    );
  }

  if (surface === 'not_found' || !token) {
    return shell(
      <>
        <Text style={styles.kicker}>Invalid link</Text>
        <Text style={styles.title}>This isn’t a valid gift link</Text>
        <Text style={styles.body}>
          The link may be incomplete or mistyped. Open the claim button from the gift email, or ask
          the giver to send a new one.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={goHome}>
          <Text style={styles.ctaText}>Go home</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (surface === 'already_claimed') {
    return shell(
      <>
        <Text style={styles.kicker}>Already claimed</Text>
        <Text style={styles.title}>This gift has already been claimed</Text>
        <Text style={styles.body}>
          {giverName
            ? `${fromName}’s gift was added to the family account that claimed it.`
            : 'This gift was already added to a family account.'}{' '}
          {isAuthenticated
            ? 'Open My Gifts to manage it, or browse the store to spend gift credit.'
            : 'Sign in with that account to open My Gifts.'}
        </Text>
        {isAuthenticated ? (
          <>
            <TouchableOpacity style={styles.cta} onPress={() => navigation.replace('MyGifts')}>
              <Text style={styles.ctaText}>Open My Gifts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryCta} onPress={() => navigation.replace('StorefrontHome')}>
              <Text style={styles.secondaryCtaText}>Browse the store</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.cta}
            onPress={() => useAuthFlowStore.getState().startAuthFromGuest('GiftClaim', 'signin')}
          >
            <Text style={styles.ctaText}>Sign in</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryCta} onPress={goHome}>
          <Text style={styles.secondaryCtaText}>Go home</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (surface === 'unpaid') {
    return shell(
      <>
        <Text style={styles.kicker}>Not ready yet</Text>
        <Text style={styles.title}>This gift isn’t ready to claim</Text>
        <Text style={styles.body}>
          {giverName
            ? `${fromName}’s payment hasn’t finished yet.`
            : 'The giver’s payment hasn’t finished yet.'}{' '}
          Ask them to complete checkout, then try this link again.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={goHome}>
          <Text style={styles.ctaText}>Go home</Text>
        </TouchableOpacity>
      </>
    );
  }

  if (surface === 'error' && errorMessage) {
    return shell(
      <>
        <Text style={styles.title}>Could not open gift</Text>
        <Text style={styles.body}>{errorMessage}</Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => {
            setErrorMessage(null);
            setPeekNonce((n) => n + 1);
          }}
        >
          <Text style={styles.ctaText}>Try again</Text>
        </TouchableOpacity>
      </>
    );
  }

  const giftDescription =
    giftKind === 'box'
      ? `${fromName} picked a ${CURATED_GIFT_BOX_LABEL.toLowerCase()} for your family. Gift boxes stay separate from your own box — manage them in My Gifts.`
      : `${fromName} sent ${giftCreditClaimTitle(creditCents)}. ${GIFT_CREDIT_SPEND_HINT}`;

  return shell(
    <>
      <Text style={styles.kicker}>You received a gift</Text>
      <Text style={styles.title}>{giftKindLabel(giftKind)}</Text>
      <Text style={styles.body}>{giftDescription}</Text>
      {!isAuthenticated ? (
        <>
          <Text style={styles.authNote}>
            Create an account to redeem this gift. We won’t mark it claimed until you’re signed in
            and tap Claim.
          </Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => {
              useAuthFlowStore.getState().setPendingGiftClaimToken(token);
              useAuthFlowStore.getState().startAuthFromGuest('GiftClaim', 'signup');
            }}
          >
            <Text style={styles.ctaText}>Sign up to claim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={() => {
              useAuthFlowStore.getState().setPendingGiftClaimToken(token);
              useAuthFlowStore.getState().startAuthFromGuest('GiftClaim', 'signin');
            }}
          >
            <Text style={styles.secondaryCtaText}>Sign in</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.authNote}>
            Claiming adds this gift to your family account
            {giftKind === 'credit' ? ' as spendable credit' : ' in My Gifts'}.
          </Text>
          <TouchableOpacity style={styles.cta} onPress={() => void claim()} disabled={claiming}>
            {claiming ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.ctaText}>Claim gift</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

export function GiftClaimScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <GiftClaimBody />
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', minHeight: 0 },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: spacing.xl,
      ...(isDesktop ? { alignItems: 'center' as const } : {}),
    },
    shell: {
      width: '100%',
      maxWidth: isDesktop ? 560 : undefined,
      paddingHorizontal: isDesktop ? 0 : MOBILE_GUTTER,
      alignItems: 'center',
    },
    kicker: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    title: {
      fontSize: 26,
      ...typeface('bold'),
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      color: colors.textPrimary,
    },
    body: {
      fontSize: typography.lg,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
      ...typeface('regular'),
    },
    authNote: {
      fontSize: typography.sm,
      lineHeight: 20,
      color: colors.textTertiary,
      textAlign: 'center',
      marginBottom: spacing.lg,
      maxWidth: 400,
    },
    checkingBody: {
      marginTop: spacing.md,
      marginBottom: 0,
    },
    cta: {
      backgroundColor: colors.brand,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.pill,
      minWidth: 220,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    ctaText: { color: colors.textInverse, fontWeight: '700', fontSize: typography.lg },
    secondaryCta: {
      marginTop: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    secondaryCtaText: {
      color: colors.brand,
      fontWeight: '600',
      fontSize: typography.md,
    },
  });
}
