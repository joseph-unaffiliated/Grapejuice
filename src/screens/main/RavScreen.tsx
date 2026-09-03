import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { PilotAIChatSheet, type PilotAIChatSheetRef } from '../../components/chat/PilotAIChatSheet';
import { RavCompanionDrawer } from '../../components/chat/RavCompanionDrawer';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { catalogService } from '../../services/firestore/catalog';
import { applyRavDraftActions } from '../../services/rav/applyRavDraftActions';
import {
  actionForSlotAltPick,
  actionsForTreatPath,
  buildSwapReviewFromActions,
  keepItemIdsForTreatPath,
} from '../../services/rav/ravCompanionIntent';
import type { MainTabsParamList } from '../../navigation/types';
import type { CatalogItem, RavDraftAction } from '../../types/pilot';
import {
  CLOSED_RAV_COMPANION_PANE,
  type OpenRavCompanionPaneInput,
  type RavCompanionPaneState,
  type RavTreatPathOption,
} from '../../types/ravPane';
import { LAYOUT, tabBarTotalHeight } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';

type RavRoute = RouteProp<MainTabsParamList, 'Rav'>;

export function RavScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <RavScreenBody />
    </StorefrontChrome>
  );
}

function RavScreenBody() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabsParamList>>();
  const { isDesktop, tier } = useWebLayout();
  const { colors } = useThemeMode();
  const styles = useMemo(() => createRavStyles(colors), [colors]);
  const route = useRoute<RavRoute>();
  const ref = useRef<PilotAIChatSheetRef>(null);
  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomInset = isDesktop ? spacingBottomDesktop : tabBarHeight;
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);
  const { lineItems, persist } = useBoxDraft();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [companionPane, setCompanionPane] = useState<RavCompanionPaneState>(CLOSED_RAV_COMPANION_PANE);
  const [reviewBusy, setReviewBusy] = useState(false);
  const view = route.params?.view;
  const newChat = route.params?.newChat;
  const threadId = route.params?.threadId;
  const initialMessage = route.params?.initialMessage;
  const openingAssistantMessage = route.params?.openingAssistantMessage;

  useEffect(() => {
    recordGuestRavPrompt();
  }, [recordGuestRavPrompt]);

  useEffect(() => {
    void catalogService.getAll().then(setCatalog);
  }, []);

  const openCompanionPane = useCallback((input: OpenRavCompanionPaneInput) => {
    setCompanionPane({ ...input, open: true });
  }, []);

  const closeCompanionPane = useCallback(() => {
    setCompanionPane((prev) => ({ ...prev, open: false, payload: undefined }));
  }, []);

  const confirmReview = useCallback(async () => {
    const pending = companionPane.payload?.pendingActions;
    if (!pending?.length) {
      closeCompanionPane();
      return;
    }
    setReviewBusy(true);
    try {
      // Brief pause so Apply feels intentional before confirmation.
      await new Promise((r) => setTimeout(r, 450));
      const { lineItems: next, applied } = applyRavDraftActions(pending, lineItems, catalog);
      if (applied.length) await persist(next);
      setCompanionPane((prev) => ({
        open: true,
        kind: 'swap_review',
        source: prev.source,
        title: 'Box updated',
        subtitle: 'Your swap is in your box.',
        payload: {
          kind: 'swap_review',
          proposals: prev.payload?.proposals ?? [],
          replacingWithItemIds: prev.payload?.replacingWithItemIds,
          reviewStatus: 'applied',
        },
      }));
    } finally {
      setReviewBusy(false);
    }
  }, [companionPane.payload?.pendingActions, lineItems, catalog, persist]);

  const dismissReview = useCallback(() => {
    closeCompanionPane();
  }, [closeCompanionPane]);

  const onReviewAppliedDone = useCallback(() => {
    setCompanionPane({
      open: true,
      kind: 'box',
      source: 'user',
      title: 'Your box',
      subtitle: 'Updated with your latest swap',
    });
  }, []);

  const stagePendingActions = useCallback(
    (
      pendingActions: RavDraftAction[],
      title: string,
      subtitle: string,
      opts?: { replacingWithItemIds?: string[] }
    ) => {
      const { proposals, pendingActions: pending } = buildSwapReviewFromActions(
        pendingActions,
        lineItems,
        catalog
      );
      const finalPending = pending.length ? pending : pendingActions;
      if (!finalPending.length) return;
      const finalProposals =
        proposals.length > 0
          ? proposals
          : finalPending.map((a) => ({
              actionType: a.type,
              slotId: a.slotId,
              fromItemId: a.type === 'remove' || a.type === 'swap' ? a.itemId : undefined,
              toItemId: a.type === 'add' || a.type === 'swap' ? a.itemId : undefined,
            }));
      const replacingFromActions = finalProposals
        .flatMap((p) => (p.toItemId ? [p.toItemId] : []))
        .filter(Boolean);
      const replacingWithItemIds = [
        ...(opts?.replacingWithItemIds ?? []),
        ...replacingFromActions,
      ].filter((id, i, arr) => arr.indexOf(id) === i);
      setCompanionPane({
        open: true,
        kind: 'swap_review',
        source: 'user',
        title,
        subtitle,
        payload: {
          kind: 'swap_review',
          proposals: finalProposals,
          pendingActions: finalPending,
          replacingWithItemIds,
          reviewStatus: 'pending',
        },
      });
    },
    [lineItems, catalog]
  );

  const onPickOption = useCallback(
    (itemId: string) => {
      const action = actionForSlotAltPick(
        itemId,
        companionPane.payload?.focusSlotId,
        companionPane.payload?.currentItemId,
        lineItems,
        catalog
      );
      if (!action) return;
      stagePendingActions([action], 'Review swap', 'Confirm before updating your box');
    },
    [companionPane.payload, lineItems, catalog, stagePendingActions]
  );

  const onPickTreatPath = useCallback(
    (path: RavTreatPathOption) => {
      const actions = actionsForTreatPath(path, lineItems, catalog);
      if (!actions.length) {
        setCompanionPane({
          open: true,
          kind: 'box',
          source: 'user',
          title: 'Your box',
          subtitle: `${path.label} is already your treat path`,
        });
        return;
      }
      stagePendingActions(actions, `Choose ${path.label}`, 'Review this swap before it goes into your box', {
        replacingWithItemIds: keepItemIdsForTreatPath(path, lineItems, catalog),
      });
    },
    [lineItems, catalog, stagePendingActions]
  );

  /** Figma 366:1388 — re-tap Rav tab while in chat returns to Rav welcome home. */
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        ref.current?.showWelcome();
      }
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    const hasIntent = Boolean(
      view || newChat || threadId || initialMessage || openingAssistantMessage
    );
    if (!hasIntent) return;

    let cancelled = false;
    let attempts = 0;

    const apply = () => {
      if (cancelled) return;
      const sheet = ref.current;
      if (!sheet) {
        if (attempts++ < 20) {
          requestAnimationFrame(apply);
        }
        return;
      }

      if (view === 'recent') {
        sheet.showRecentChats();
      } else if (threadId) {
        sheet.openThread(threadId, true);
      } else if (openingAssistantMessage) {
        sheet.startChatWithOpeningAssistant(openingAssistantMessage);
      } else if (newChat || initialMessage) {
        sheet.startNewChat(initialMessage);
      } else if (view === 'welcome') {
        sheet.showWelcome();
      }

      navigation.setParams({
        view: undefined,
        newChat: undefined,
        threadId: undefined,
        initialMessage: undefined,
        openingAssistantMessage: undefined,
      });
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [view, newChat, threadId, initialMessage, openingAssistantMessage, navigation]);

  const pushDrawer = tier === 'desktop-web';

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/*
        Drawer is a sibling of the content panel so it docks to the main-area
        right edge — not inside WebContentPanel gutters/max-width.
      */}
      <View style={styles.shell}>
        <View style={styles.chatArea}>
          <WebContentPanel
            flush
            desktopContentMaxWidth={LAYOUT.WEB_TABLET_MAX_WIDTH}
            style={[styles.panel, isDesktop ? styles.panelDesktop : null]}
          >
            <PilotAIChatSheet
              ref={ref}
              embedded
              bottomInset={bottomInset}
              onOpenCompanionPane={openCompanionPane}
              overlay="tab"
            />
          </WebContentPanel>
        </View>
        <RavCompanionDrawer
          open={companionPane.open}
          onClose={closeCompanionPane}
          push={pushDrawer}
          kind={companionPane.kind}
          title={companionPane.title}
          subtitle={companionPane.subtitle}
          payload={companionPane.payload}
          lineItems={lineItems}
          catalog={catalog}
          onConfirmReview={() => void confirmReview()}
          onDismissReview={dismissReview}
          onReviewAppliedDone={onReviewAppliedDone}
          reviewBusy={reviewBusy}
          onPickOption={onPickOption}
          onPickTreatPath={onPickTreatPath}
        />
      </View>
    </SafeAreaView>
  );
}

const spacingBottomDesktop = 24;

function createRavStyles(colors: SemanticColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    shell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      width: '100%',
      minWidth: 0,
      overflow: 'visible' as const,
    },
    chatArea: {
      flex: 1,
      minWidth: 0,
      zIndex: 0,
    },
    panel: { overflow: 'visible' as const },
    panelDesktop: {
      alignItems: 'center',
    },
  });
}
