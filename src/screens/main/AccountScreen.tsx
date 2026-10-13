import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { MobileCodeSignIn } from '../../components/mobile/MobileCodeSignIn';
import { MobileAccountHub } from '../mobile/MobileAccountHub';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useDevPreviewStore } from '../../stores/devPreviewStore';
import { clearDevPreview } from '../../navigation/devPreview';
import { childrenService } from '../../services/firestore/children';
import { boxDraftService } from '../../services/firestore/boxDraft';
import { peekBoxDraftCache } from '../../hooks/useBoxDraft';
import { createPartnerInvite, acceptPartnerInvite } from '../../services/householdInvites';
import type { PartnerInvite, Household, UserProfile } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import {
  spacing,
  typography,
  borderRadius,
  typeface,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { GuestAuthPrompt } from '../../components/auth/GuestAuthPrompt';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { loadPartnerInvites, peekPartnerInvites } from '../../services/account/accountPrefetch';
import { getSavedCardSummary } from '../../services/checkout/createMarketplaceCheckout';
import { peekSavedCard } from '../../services/checkout/checkoutPrefetch';
import { savedCardLabel } from '../storefront/MarketplacePaymentPanel.web';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { AccountHubHeader } from '../../components/account/AccountHubHeader';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import {
  type ChildDraft,
  childProfilesToDrafts,
  defaultFamilyMembers,
  familyMembersComplete,
  familyMembersFingerprint,
} from '../../components/family/familyDraft';
import {
  rebuildBoxFromFamily,
  saveFamilyMembers,
} from '../../services/box/rebuildBoxFromFamily';
import { useWebLayout } from '../../hooks/useWebLayout';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import { usersService } from '../../services/firestore/users';
import { isListedAdmin, isOpsAdmin } from '../../constants/admin';
import { InfluencerDashboard } from '../../components/account/InfluencerDashboard';
import { formatDollars } from '../../services/box/buildDefaultBox';

type Nav = StackNavigationProp<MainStackParamList>;

const PREVIEW_SIGNED_IN_USER = {
  uid: 'preview-user',
  email: 'alex@example.com',
  emails: ['alex@example.com'],
  displayName: 'Alex',
  photoURL: null as string | null,
  hasPasswordProvider: true,
  hasGoogleProvider: false,
  emailVerified: true,
};

const PREVIEW_HOUSEHOLD: Household = {
  id: 'preview-household',
  name: 'Fox family',
  ownerId: 'preview-user',
  memberIds: ['preview-user'],
  childUserIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PREVIEW_PROFILE: UserProfile = {
  uid: 'preview-user',
  email: 'alex@example.com',
  displayName: 'Alex',
  role: 'parent',
  householdId: 'preview-household',
  onboardingComplete: true,
  boxRevealComplete: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function AccountScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <AccountScreenBody />
    </StorefrontChrome>
  );
}

function AccountScreenBody() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createAccountStyles(colors, isDesktop), [colors, isDesktop]);
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  /** A password or Google attempt flips auth loading; keep the phone sign-in form mounted through it. */
  const mobileSignInShown = useRef(false);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);
  const authError = useAuthStore((s) => s.error);
  const clearAuthError = useAuthStore((s) => s.clearError);
  const { household: sessionHousehold, profile: sessionProfile, loading: sessionLoading, refresh } =
    useSession();
  const guestHidden = useGuestSessionStore((s) => s.hiddenHolidays);
  const toggleGuestHidden = useGuestSessionStore((s) => s.toggleHiddenHoliday);
  const previewKey = useDevPreviewStore((s) => s.previewKey);
  const fakeSignedIn = previewKey === 'account-signed-in';
  const mobileLayout = useMobileLayout();

  const user = fakeSignedIn ? PREVIEW_SIGNED_IN_USER : authUser;
  const household = fakeSignedIn ? PREVIEW_HOUSEHOLD : sessionHousehold;
  const profile = fakeSignedIn ? PREVIEW_PROFILE : sessionProfile;
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const familyName = profile?.displayName ?? user?.displayName;
  const appliedFamilySource = React.useRef<string | null>(null);

  const [invites, setInvites] = useState<PartnerInvite[]>(() => peekPartnerInvites(household?.id) ?? []);
  const [invitesSettled, setInvitesSettled] = useState(
    () => fakeSignedIn || peekPartnerInvites(household?.id) != null
  );
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordLocalError, setPasswordLocalError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [familyMembers, setFamilyMembers] = useState<ChildDraft[]>(() => {
    if (fakeSignedIn) return defaultFamilyMembers('Alex');
    const cached = peekBoxDraftCache(household?.id);
    if (!cached) return defaultFamilyMembers(familyName);
    return childProfilesToDrafts(cached.children, useGuestSessionStore.getState().childDrafts, familyName);
  });
  const [familyBaseline, setFamilyBaseline] = useState(() => familyMembersFingerprint(familyMembers));
  const [familySynced, setFamilySynced] = useState(
    () => fakeSignedIn || peekBoxDraftCache(household?.id) != null
  );
  const [boxChildren, setBoxChildren] = useState(() => peekBoxDraftCache(household?.id)?.children ?? []);
  const [hasOwnBox, setHasOwnBox] = useState(
    () => fakeSignedIn || (peekBoxDraftCache(household?.id)?.lineItems.length ?? 0) > 0
  );
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [familySaved, setFamilySaved] = useState(false);
  const [rebuildModalOpen, setRebuildModalOpen] = useState(false);

  const hiddenHolidays = profile?.hiddenHolidays ?? guestHidden;
  const familyDirty = familyMembersFingerprint(familyMembers) !== familyBaseline;
  const familyComplete = familyMembersComplete(familyMembers);
  const paymentKnown = fakeSignedIn || !sessionLoading || Boolean(household);
  const cardOnFile = Boolean(household?.cardOnFileAt);
  const [cardLabel, setCardLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!mobileLayout || !cardOnFile || !household?.id || fakeSignedIn) {
      setCardLabel(null);
      return;
    }
    let alive = true;
    const pending = peekSavedCard(household.id);
    void (pending ?? getSavedCardSummary(household.id))
      .then((card) => {
        if (alive) setCardLabel(card ? savedCardLabel(card) : null);
      })
      .catch(() => {
        if (alive) setCardLabel(null);
      });
    return () => {
      alive = false;
    };
  }, [mobileLayout, cardOnFile, household?.id, fakeSignedIn]);
  const creditCents = (household?.giftCreditCents ?? 0) + (household?.platformCreditCents ?? 0);

  useEffect(() => {
    if (fakeSignedIn) return;
    if (sessionLoading && !household?.id) return;
    let alive = true;
    if (!household?.id || !authUser?.uid) {
      setFamilySynced(true);
      setHasOwnBox(false);
      return;
    }
    const seeded = peekBoxDraftCache(household.id);
    if (seeded) {
      setBoxChildren(seeded.children);
      setHasOwnBox(seeded.lineItems.length > 0);
      setFamilySynced(true);
    }
    void childrenService
      .list(authUser.uid)
      .then((kids) => {
        if (!alive) return;
        setBoxChildren(kids);
        setFamilySynced(true);
      })
      .catch(() => {
        if (alive) setFamilySynced(true);
      });
    void boxDraftService
      .get(household.id)
      .then((draft) => {
        if (!alive) return;
        setHasOwnBox(Boolean(draft?.lineItems?.length));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fakeSignedIn, sessionLoading, household?.id, authUser?.uid]);

  useEffect(() => {
    if (fakeSignedIn) return;
    if (sessionLoading && !household?.id) return;
    if (household?.id && !familySynced && !peekBoxDraftCache(household.id)) return;
    setFamilySynced(true);
    const next = childProfilesToDrafts(household?.id ? boxChildren : [], guestDrafts, familyName);
    const key = `${household?.id ?? ''}|${familyMembersFingerprint(next)}`;
    if (appliedFamilySource.current === key) return;
    if (familyDirty && appliedFamilySource.current != null) return;
    appliedFamilySource.current = key;
    setFamilyMembers(next);
    setFamilyBaseline(familyMembersFingerprint(next));
  }, [
    fakeSignedIn,
    sessionLoading,
    household?.id,
    boxChildren,
    guestDrafts,
    familyName,
    familyDirty,
    familySynced,
  ]);

  useEffect(() => {
    let alive = true;
    if (fakeSignedIn || !household?.id) {
      setInvites([]);
      setInvitesSettled(!sessionLoading);
      return;
    }
    const cached = peekPartnerInvites(household.id);
    if (cached) {
      setInvites(cached);
      setInvitesSettled(true);
    }
    void loadPartnerInvites(household.id).then((rows) => {
      if (!alive) return;
      setInvites(rows);
      setInvitesSettled(true);
    });
    return () => {
      alive = false;
    };
  }, [fakeSignedIn, household?.id, sessionLoading]);

  const sendInvite = async () => {
    if (fakeSignedIn || !household?.id || !inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      await createPartnerInvite({
        householdId: household.id,
        email: inviteEmail.trim(),
        invitedByName: profile?.displayName ?? user?.displayName ?? 'Partner',
      });
      setInviteEmail('');
      setInvites(await loadPartnerInvites(household.id, { fresh: true }));
      setInvitesSettled(true);
    } finally {
      setInviteSending(false);
    }
  };

  const acceptInvite = async () => {
    if (fakeSignedIn || !inviteCode.trim()) return;
    setInviteSending(true);
    try {
      await acceptPartnerInvite({ inviteId: inviteCode.trim() });
      setInviteCode('');
      if (household?.id) {
        setInvites(await loadPartnerInvites(household.id, { fresh: true }));
        setInvitesSettled(true);
      }
    } finally {
      setInviteSending(false);
    }
  };

  const restoreHidden = async (holidayId: string) => {
    toggleGuestHidden(holidayId);
    if (authUser?.uid) {
      const next = hiddenHolidays.filter((id) => id !== holidayId);
      await usersService.upsert(authUser.uid, { hiddenHolidays: next });
      await refresh();
    }
  };

  const onSignOut = () => {
    if (fakeSignedIn) {
      clearDevPreview();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/store?preview=account';
      }
      return;
    }
    void logout();
  };

  const onChangePassword = async () => {
    clearAuthError();
    setPasswordLocalError(null);
    setPasswordSuccess(false);
    if (fakeSignedIn) {
      setPasswordLocalError('Preview mode — password changes are disabled.');
      return;
    }
    if (!currentPassword || !nextPassword) {
      setPasswordLocalError('Enter your current password and a new password.');
      return;
    }
    if (nextPassword.length < 6) {
      setPasswordLocalError('New password must be at least 6 characters.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordLocalError('New password and confirmation do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    } catch {
      /* store surfaces error */
    } finally {
      setPasswordBusy(false);
    }
  };

  const persistFamilyOnly = async () => {
    await saveFamilyMembers({
      uid: fakeSignedIn ? null : authUser?.uid,
      members: familyMembers,
    });
    setFamilyBaseline(familyMembersFingerprint(familyMembers));
    setFamilySaved(true);
  };

  const onSaveFamilyPress = () => {
    setFamilyError(null);
    setFamilySaved(false);
    if (!familyComplete) {
      setFamilyError('Add a name for each person.');
      return;
    }
    if (fakeSignedIn) {
      setFamilyBaseline(familyMembersFingerprint(familyMembers));
      setFamilySaved(true);
      return;
    }
    if (hasOwnBox) {
      setRebuildModalOpen(true);
      return;
    }
    setFamilyBusy(true);
    void persistFamilyOnly()
      .catch((err) => {
        setFamilyError(err instanceof Error ? err.message : 'Could not save family.');
      })
      .finally(() => setFamilyBusy(false));
  };

  const onLeaveBoxAsIs = async () => {
    if (familyBusy) return;
    setFamilyBusy(true);
    setFamilyError(null);
    try {
      await persistFamilyOnly();
      setRebuildModalOpen(false);
    } catch (err) {
      setFamilyError(err instanceof Error ? err.message : 'Could not save family.');
    } finally {
      setFamilyBusy(false);
    }
  };

  const onRebuildBox = async () => {
    if (familyBusy || fakeSignedIn) return;
    if (!authUser?.uid || !household?.id) {
      setFamilyError('Sign in with a household to rebuild your box.');
      return;
    }
    setFamilyBusy(true);
    setFamilyError(null);
    try {
      const draft = await boxDraftService.get(household.id);
      await rebuildBoxFromFamily({
        uid: authUser.uid,
        householdId: household.id,
        members: familyMembers,
        familiarityLevel: profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate',
        childInterests: draft?.childInterests,
        ravNotes: profile?.ravNotes,
      });
      setFamilyBaseline(familyMembersFingerprint(familyMembers));
      setFamilySaved(true);
      setRebuildModalOpen(false);
      await refresh({ silent: true });
      navigateMainStack('MyBox');
    } catch (err) {
      setFamilyError(err instanceof Error ? err.message : 'Could not rebuild your box.');
    } finally {
      setFamilyBusy(false);
    }
  };

  const goUpdatePayment = () => navigation.navigate('UpdatePayment');

  if (!fakeSignedIn && !user && (authLoading || sessionLoading) && !(mobileLayout && mobileSignInShown.current)) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!user) {
    if (mobileLayout) {
      mobileSignInShown.current = true;
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#FFFFFF' }} keyboardShouldPersistTaps="handled">
          <MobileCodeSignIn title="Sign in" lead="Enter the email you used for your box." alternatives={{ googleReturnTo: 'Account' }} />
        </ScrollView>
      );
    }
    return (
      <WebContentPanel {...panelProps}>
        <GuestAuthPrompt returnTo="Account" />
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel {...panelProps}>
      {mobileLayout ? (
        <MobileAccountHub
          email={user?.email ?? 'Exploring as guest'}
          displayName={profile?.displayName ?? user?.displayName}
          cardOnFile={cardOnFile}
          paymentKnown={paymentKnown}
          cardLabel={cardLabel}
          creditLabel={creditCents > 0 ? formatDollars(creditCents) : null}
          previewBanner={fakeSignedIn ? 'Preview — signed-in account (mock data)' : null}
          family={{
            members: familyMembers,
            onChange: (next) => {
              setFamilyMembers(next);
              setFamilySaved(false);
              setFamilyError(null);
            },
            onSave: onSaveFamilyPress,
            busy: familyBusy,
            dirty: familyDirty,
            complete: familyComplete,
            error: familyError,
            saved: familySaved,
            loading: !familySynced,
          }}
          helpers={
            household?.id || !paymentKnown
              ? {
                  invites: invites.map((inv) => ({ id: inv.id, email: inv.invitedEmail, status: inv.status })),
                  email: inviteEmail,
                  onEmail: setInviteEmail,
                  onSend: () => void sendInvite(),
                  code: inviteCode,
                  onCode: setInviteCode,
                  onAccept: () => void acceptInvite(),
                  busy: inviteSending || fakeSignedIn,
                  loading: !household?.id || !invitesSettled,
                }
              : null
          }
          signIn={{
            hasPassword: !!user.hasPasswordProvider,
            hasGoogle: !!user.hasGoogleProvider,
            onSetPassword: () => navigation.navigate('SetPassword'),
            onConnectGoogle: Platform.OS === 'web' && !fakeSignedIn ? () => navigation.navigate('ConnectGoogle') : undefined,
            password: {
              current: currentPassword,
              next: nextPassword,
              confirm: confirmPassword,
              onCurrent: setCurrentPassword,
              onNext: setNextPassword,
              onConfirm: setConfirmPassword,
              onSubmit: () => void onChangePassword(),
              busy: passwordBusy,
              error: passwordLocalError || authError || null,
              success: passwordSuccess,
            },
          }}
          onOpenBox={() => navigateMainStack('MyBox')}
          onBuildBox={() => navigateMainStack('MyBox')}
          onCheckout={() => navigateMainStack('Checkout')}
          onOrders={() => navigation.navigate('Orders')}
          onGifts={() => navigation.navigate('MyGifts')}
          onPayment={goUpdatePayment}
          onFavorites={() => navigation.navigate('StorefrontFavorites')}
          onHistory={() => navigation.navigate('History')}
          onSendGift={() => navigation.navigate('GiftGive')}
          influencerEnabled={!fakeSignedIn && Boolean(user.emailVerified)}
          ops={
            isListedAdmin(user)
              ? [
                  { label: 'Catalog', sub: 'Hanukkah SKUs', onPress: () => navigation.navigate('AdminCatalog') },
                  { label: 'Boxes and Orders', sub: 'Live boxes, shop orders, gifts and inventory', onPress: () => navigation.navigate('AdminBoxes') },
                  { label: 'Promotions', sub: 'Discount codes, credit and influencer links', onPress: () => navigation.navigate('AdminPromotions') },
                ]
              : undefined
          }
          signOutLabel={fakeSignedIn ? 'Exit preview' : 'Sign out'}
          onSignOut={onSignOut}
        />
      ) : (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {fakeSignedIn ? (
          <Text style={styles.previewBanner}>Preview — signed-in account (mock data)</Text>
        ) : null}
        <AccountHubHeader
          page="account"
          email={user?.email ?? 'Exploring as guest'}
          displayName={profile?.displayName ?? user?.displayName}
        />

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Your Household</Text>
        {familySynced ? (
          <>
            <View style={styles.familyForm}>
              <FamilyMembersForm
                members={familyMembers}
                onChange={(next) => {
                  setFamilyMembers(next);
                  setFamilySaved(false);
                  setFamilyError(null);
                }}
                sectionLead=""
              />
            </View>
            <GrapejuiceButton
              label={familyBusy ? 'Saving…' : 'Save changes'}
              variant="filled"
              onPress={onSaveFamilyPress}
              disabled={!familyDirty || !familyComplete || familyBusy}
              loading={familyBusy && !rebuildModalOpen}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
            {familyError ? <Text style={styles.passwordError}>{familyError}</Text> : null}
            {familySaved && !familyDirty ? (
              <Text style={styles.passwordSuccess}>Family saved.</Text>
            ) : null}
          </>
        ) : (
          <View style={styles.familyForm}>
            <BrandLoadingMark large={false} color={colors.brand} />
          </View>
        )}

        {!paymentKnown ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Invite a Collaborator</Text>
            <Text style={styles.hint}>Loading collaborators.</Text>
          </>
        ) : household?.id ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Invite a Collaborator</Text>
            <Text style={styles.hint}>Invite a collaborator to edit the same box.</Text>
            <View style={styles.inviteFieldRow}>
              <TextInput
                style={styles.inviteInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="partner@email.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!fakeSignedIn}
              />
              <GrapejuiceButton
                label={inviteSending ? 'Sending…' : 'Send invite'}
                variant="filled"
                onPress={() => void sendInvite()}
                disabled={inviteSending || fakeSignedIn}
                style={styles.inviteBtn}
                textStyle={styles.inviteBtnText}
              />
            </View>
            <View style={styles.inviteFieldRow}>
              <TextInput
                style={styles.inviteInput}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Paste invite code to join"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                editable={!fakeSignedIn}
              />
              <GrapejuiceButton
                label={inviteSending ? 'Joining…' : 'Accept invite'}
                variant="filled"
                onPress={() => void acceptInvite()}
                disabled={inviteSending || fakeSignedIn}
                style={styles.inviteBtn}
                textStyle={styles.inviteBtnText}
              />
            </View>
            {invites.map((inv) => (
              <Text key={inv.id} style={styles.inviteRow}>
                {inv.invitedEmail} — {inv.status}
              </Text>
            ))}
          </>
        ) : (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Invite a Collaborator</Text>
            <Text style={styles.hint}>Sign in to invite a collaborator and share your box.</Text>
          </>
        )}

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Payment Information</Text>
        <Text style={styles.hint}>
          {!paymentKnown
            ? 'Checking the card on file.'
            : cardOnFile
              ? 'A card is saved for your household box and checkout.'
              : 'No card on file yet. Add one to commit your box or check out faster.'}
        </Text>
        {creditCents > 0 ? (
          <Text style={[styles.hint, styles.creditLine]}>
            {`You have ${formatDollars(creditCents)} in credit. It comes off your next box, order or gift at checkout.`}
          </Text>
        ) : null}
        <GrapejuiceButton
          label={cardOnFile ? 'Update payment' : 'Add payment'}
          variant="filled"
          onPress={goUpdatePayment}
          disabled={fakeSignedIn || !household?.id}
          style={styles.actionBtn}
          textStyle={styles.primaryBtnText}
        />

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>
          {user.hasPasswordProvider ? 'Reset Password' : 'Set a Password'}
        </Text>
        {user.hasPasswordProvider ? (
          <>
            <Text style={styles.hint}>Change the password for {user.email ?? 'your account'}.</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              editable={!fakeSignedIn && !passwordBusy}
            />
            <TextInput
              style={styles.input}
              value={nextPassword}
              onChangeText={setNextPassword}
              placeholder="New password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!fakeSignedIn && !passwordBusy}
            />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!fakeSignedIn && !passwordBusy}
              onSubmitEditing={() => void onChangePassword()}
            />
            <GrapejuiceButton
              label={passwordBusy ? 'Updating…' : 'Update password'}
              variant="filled"
              onPress={() => void onChangePassword()}
              disabled={passwordBusy || fakeSignedIn}
              loading={passwordBusy}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
            {passwordLocalError || authError ? (
              <Text style={styles.passwordError}>{passwordLocalError || authError}</Text>
            ) : null}
            {passwordSuccess ? (
              <Text style={styles.passwordSuccess}>Password updated.</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {user.hasGoogleProvider
                ? `You log in with Google. Add a password to also log in to ${user.email ?? 'your account'} with email.`
                : `You log in with emailed links. Add a password to log in to ${user.email ?? 'your account'} directly.`}
            </Text>
            <GrapejuiceButton
              label="Set a password"
              variant="filled"
              onPress={() => navigation.navigate('SetPassword')}
              disabled={fakeSignedIn}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
          </>
        )}
        {!user.hasGoogleProvider && Platform.OS === 'web' ? (
          <GrapejuiceButton
            label="Log in with Google"
            variant="pillOutline"
            onPress={() => navigation.navigate('ConnectGoogle')}
            disabled={fakeSignedIn}
            style={styles.actionBtn}
            textStyle={styles.primaryBtnText}
          />
        ) : null}

        {hiddenHolidays.length ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Hidden holidays</Text>
            {hiddenHolidays.map((id) => (
              <GrapejuiceButton
                key={id}
                label={`Show ${id} again`}
                variant="pillOutline"
                onPress={() => void restoreHidden(id)}
                style={styles.actionBtn}
                textStyle={styles.primaryBtnText}
              />
            ))}
          </>
        ) : null}

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Gift a box</Text>
        <Text style={styles.hint}>Send gift credit or a curated gift box to another family.</Text>
        <GrapejuiceButton
          label="Send a gift"
          variant="filled"
          onPress={() => navigation.navigate('GiftGive')}
          style={styles.actionBtn}
          textStyle={styles.primaryBtnText}
        />

        <InfluencerDashboard
          enabled={!fakeSignedIn && Boolean(user.emailVerified)}
          sectionStyle={styles.section}
          dividerStyle={styles.sectionDivider}
        />

        {isOpsAdmin(user) ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Ops</Text>
            <Text style={styles.hint}>Edit Hanukkah catalog SKUs, see live boxes, shop orders, gifts and inventory, or manage discount codes, credit and influencer links.</Text>
            <GrapejuiceButton
              label="Catalog admin"
              variant="filled"
              onPress={() => navigation.navigate('AdminCatalog')}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
            <GrapejuiceButton
              label="Orders and Inventory"
              variant="filled"
              onPress={() => navigation.navigate('AdminBoxes')}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
            <GrapejuiceButton
              label="Promotions"
              variant="filled"
              onPress={() => navigation.navigate('AdminPromotions')}
              style={styles.actionBtn}
              textStyle={styles.primaryBtnText}
            />
          </>
        ) : null}

        <View style={styles.sectionDivider} />
        <GrapejuiceButton
          label={fakeSignedIn ? 'Exit preview' : 'Sign out'}
          variant="filled"
          onPress={onSignOut}
          style={styles.logoutBtn}
          textStyle={styles.logoutBtnText}
        />
      </ScrollView>
      )}

      <Modal
        visible={rebuildModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!familyBusy) setRebuildModalOpen(false);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!familyBusy) setRebuildModalOpen(false);
            }}
            accessibilityLabel="Close"
          />
          <View
            style={styles.modalCard}
            accessibilityRole="summary"
            accessibilityLabel="Rebuild your box?"
          >
            <Text style={styles.modalHeadline}>
              Do you want to rebuild your box to account for these changes?
            </Text>
            <Text style={styles.modalBody}>
              If you do, you will lose all customizations and some items you&apos;d selected may no
              longer be available.
            </Text>
            <View style={styles.modalActions}>
              <GrapejuiceButton
                label="Leave it as is"
                variant="filled"
                onPress={() => void onLeaveBoxAsIs()}
                disabled={familyBusy}
                loading={familyBusy}
                style={styles.modalBtn}
                textStyle={styles.primaryBtnText}
              />
              <GrapejuiceButton
                label="Yes, rebuild my box"
                variant="filled"
                onPress={() => void onRebuildBox()}
                disabled={familyBusy}
                style={styles.modalBtn}
                textStyle={styles.primaryBtnText}
              />
            </View>
          </View>
        </View>
      </Modal>
    </WebContentPanel>
  );
}

function createAccountStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xxl + spacing.md,
      paddingBottom: 120,
      maxWidth: isDesktop ? 560 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewBanner: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginBottom: spacing.md,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
    section: {
      ...typeface('medium'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.logoDark,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionDivider: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      letterSpacing: -0.22,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    familyForm: {
      marginTop: spacing.sm,
    },
    creditLine: {
      marginTop: spacing.sm,
      color: colors.textPrimary,
    },
    input: {
      ...typeface('regular'),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
      fontSize: Platform.OS === 'web' ? 14 : 16,
      color: colors.textPrimary,
      minHeight: 44,
    },
    actionBtn: {
      marginTop: spacing.sm,
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: borderRadius.xl,
    },
    primaryBtnText: {
      ...typeface('regular'),
      color: colors.logoDark,
    },
    inviteFieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    inviteInput: {
      ...typeface('regular'),
      flex: 1,
      minWidth: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: Platform.OS === 'web' ? 14 : 16,
      color: colors.textPrimary,
      minHeight: 44,
    },
    inviteBtn: {
      flexGrow: 0,
      flexShrink: 0,
      width: 'auto',
      alignSelf: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      minHeight: 44,
      borderRadius: borderRadius.xl,
    },
    inviteBtnText: {
      ...typeface('regular'),
      color: colors.logoDark,
      fontSize: typography.md,
    },
    inviteRow: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    passwordError: {
      marginTop: spacing.sm,
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.error,
    },
    passwordSuccess: {
      marginTop: spacing.sm,
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    logoutBtn: {
      marginTop: spacing.md,
      alignSelf: 'stretch',
      width: '100%',
      backgroundColor: colors.logoDark,
      borderRadius: borderRadius.xl,
    },
    logoutBtnText: {
      ...typeface('regular'),
      color: colors.brand,
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
    modalCard: {
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
    modalHeadline: {
      ...typeface('medium'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.logoDark,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    modalBody: {
      ...typeface('regular'),
      fontSize: typography.md,
      lineHeight: 18,
      letterSpacing: -0.2,
      color: colors.textSecondary,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
    },
    modalActions: {
      gap: spacing.sm,
      marginTop: spacing.sm,
      width: '100%',
    },
    modalBtn: {
      borderRadius: borderRadius.xl,
    },
  });
}
