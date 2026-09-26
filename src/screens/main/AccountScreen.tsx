import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  createPartnerInvite,
  listPartnerInvites,
  acceptPartnerInvite,
} from '../../services/householdInvites';
import type { PartnerInvite, Household, UserProfile, ChildProfile } from '../../types/pilot';
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
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { AccountHubHeader } from '../../components/account/AccountHubHeader';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import {
  type ChildDraft,
  defaultFamilyMembers,
  ensureAdultLead,
  familyMembersComplete,
  familyMembersFingerprint,
  makeAdultDraft,
  makeKidDraft,
  normalizeFamilyDraft,
} from '../../components/family/familyDraft';
import {
  rebuildBoxFromFamily,
  saveFamilyMembers,
} from '../../services/box/rebuildBoxFromFamily';
import { representativeAgeForBand, type IntakeAgeGroup } from '../../services/box/boxRules';
import { firstNameFromDisplayName } from '../../utils/personName';
import { useWebLayout } from '../../hooks/useWebLayout';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import { usersService } from '../../services/firestore/users';
import { isOpsAdmin } from '../../constants/admin';

type Nav = StackNavigationProp<MainStackParamList>;

const PREVIEW_SIGNED_IN_USER = {
  uid: 'preview-user',
  email: 'alex@example.com',
  emails: ['alex@example.com'],
  displayName: 'Alex',
  photoURL: null as string | null,
  hasPasswordProvider: true,
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

function childProfilesToDrafts(
  kids: ChildProfile[],
  guestDrafts: ChildDraft[],
  defaultName?: string | null
): ChildDraft[] {
  const guestAdults = guestDrafts
    .filter((d) => d.role === 'adult')
    .map(normalizeFamilyDraft);
  const guestKids = guestDrafts
    .filter((d) => d.role !== 'adult')
    .map(normalizeFamilyDraft);

  let kidDrafts: ChildDraft[];
  if (kids.length) {
    kidDrafts = kids.map((c, i) => {
      const fromGuest = guestKids[i];
      const age =
        typeof c.plannerAge === 'number' && Number.isFinite(c.plannerAge)
          ? c.plannerAge
          : typeof fromGuest?.plannerAge === 'number'
            ? fromGuest.plannerAge
            : representativeAgeForBand(c.ageGroup as IntakeAgeGroup);
      return {
        ...makeKidDraft(c.name ?? '', age),
        name: c.name ?? '',
        birthdate: c.birthdate,
        ageGroup: c.ageGroup,
        plannerAge: age,
        interests: fromGuest?.interests,
        customInterests: fromGuest?.customInterests,
      };
    });
  } else if (guestKids.length) {
    kidDrafts = guestKids;
  } else {
    kidDrafts = [];
  }

  const adults = guestAdults.length
    ? guestAdults
    : [makeAdultDraft(firstNameFromDisplayName(defaultName) || '')];

  if (!kidDrafts.length && !guestDrafts.length) {
    return defaultFamilyMembers(defaultName ?? undefined);
  }
  return ensureAdultLead([...adults, ...kidDrafts], defaultName ?? undefined);
}

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

  const user = fakeSignedIn ? PREVIEW_SIGNED_IN_USER : authUser;
  const household = fakeSignedIn ? PREVIEW_HOUSEHOLD : sessionHousehold;
  const profile = fakeSignedIn ? PREVIEW_PROFILE : sessionProfile;

  const [invites, setInvites] = useState<PartnerInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordLocalError, setPasswordLocalError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [familyMembers, setFamilyMembers] = useState<ChildDraft[]>(() =>
    defaultFamilyMembers(profile?.displayName ?? user?.displayName)
  );
  const [familyBaseline, setFamilyBaseline] = useState(() =>
    familyMembersFingerprint(defaultFamilyMembers(profile?.displayName ?? user?.displayName))
  );
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [familySaved, setFamilySaved] = useState(false);
  const [rebuildModalOpen, setRebuildModalOpen] = useState(false);
  const [hasOwnBox, setHasOwnBox] = useState(false);

  const hiddenHolidays = profile?.hiddenHolidays ?? guestHidden;
  const familyDirty = familyMembersFingerprint(familyMembers) !== familyBaseline;
  const familyComplete = familyMembersComplete(familyMembers);
  const cardOnFile = Boolean(household?.cardOnFileAt);

  const load = useCallback(async () => {
    if (fakeSignedIn) {
      setInvites([]);
      const previewFamily = defaultFamilyMembers('Alex');
      setFamilyMembers(previewFamily);
      setFamilyBaseline(familyMembersFingerprint(previewFamily));
      setHasOwnBox(true);
      setLoading(false);
      return;
    }
    if (!household?.id) {
      setInvites([]);
      const fromGuest = childProfilesToDrafts(
        [],
        useGuestSessionStore.getState().childDrafts,
        profile?.displayName ?? authUser?.displayName
      );
      setFamilyMembers(fromGuest);
      setFamilyBaseline(familyMembersFingerprint(fromGuest));
      setHasOwnBox(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const guestDrafts = useGuestSessionStore.getState().childDrafts;
      const [nextInvites, kids, draft] = await Promise.all([
        listPartnerInvites({ householdId: household.id }),
        authUser?.uid ? childrenService.list(authUser.uid) : Promise.resolve([]),
        boxDraftService.get(household.id),
      ]);
      setInvites(nextInvites);
      setHasOwnBox(Boolean(draft?.lineItems?.length));
      const nextFamily = childProfilesToDrafts(
        kids,
        guestDrafts,
        profile?.displayName ?? authUser?.displayName
      );
      setFamilyMembers(nextFamily);
      setFamilyBaseline(familyMembersFingerprint(nextFamily));
    } finally {
      setLoading(false);
    }
  }, [
    household?.id,
    fakeSignedIn,
    authUser?.uid,
    authUser?.displayName,
    profile?.displayName,
  ]);

  useEffect(() => {
    load();
  }, [load]);

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
      await load();
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
      await load();
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
      setHasOwnBox(true);
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

  if (!fakeSignedIn && (sessionLoading || loading)) {
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
    return (
      <WebContentPanel {...panelProps}>
        <GuestAuthPrompt returnTo="Account" />
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel {...panelProps}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {fakeSignedIn ? (
          <Text style={styles.previewBanner}>Preview — signed-in account (mock data)</Text>
        ) : null}
        <AccountHubHeader
          page="account"
          email={user?.email ?? 'Exploring as guest'}
          displayName={profile?.displayName}
        />

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Your Household</Text>
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

        {household?.id ? (
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
          {cardOnFile
            ? 'A card is saved for your household box and checkout.'
            : 'No card on file yet. Add one to commit your box or check out faster.'}
        </Text>
        <GrapejuiceButton
          label={cardOnFile ? 'Update payment' : 'Add payment'}
          variant="filled"
          onPress={goUpdatePayment}
          disabled={fakeSignedIn || !household?.id}
          style={styles.actionBtn}
          textStyle={styles.primaryBtnText}
        />

        <View style={styles.sectionDivider} />
        <Text style={styles.section}>Reset Password</Text>
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
          <Text style={styles.hint}>
            You sign in with Google or Apple on this account, so there’s no password to change
            here. Use “Forgot password?” on email sign-in if you also created an email password.
          </Text>
        )}

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

        {isOpsAdmin(user) ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Ops</Text>
            <Text style={styles.hint}>Add or edit Hanukkah catalog SKUs (books, menorahs, etc.).</Text>
            <GrapejuiceButton
              label="Catalog admin"
              variant="filled"
              onPress={() => navigation.navigate('AdminCatalog')}
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
