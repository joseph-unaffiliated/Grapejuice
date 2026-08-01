import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { aiChatService } from '../../services/firestore/aiChat';
import { kidRavChatService } from '../../services/firestore/kidRavChat';
import { askRav } from '../../services/rav/askRav';
import { summarizeLineItemsForRav } from '../../services/rav/applyRavDraftActions';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { catalogService } from '../../services/firestore/catalog';
import { formatHanukkahWelcomeSubtext, formatRelativeTime, formatThreadListDate } from '../../services/hanukkah/dates';
import type { AIChatMessage, AIChatThreadSummary } from '../../types/aiChat';
import type { CatalogItem } from '../../types/pilot';
import { spacing, typography, borderRadius, shadows, shadowsWeb, MOBILE_GUTTER, tabBarTotalHeight, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { Icon } from '../ui/Icon';
import { TextWithChevron } from '../ui/TextWithChevron';
import { icons } from '../../constants/icons';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { SearchPill, SEARCH_PILL_HEIGHT } from '../ui/SearchPill';
import { RavBlockRenderer } from './RavBlockRenderer';
import { FormattedChatText } from './FormattedChatText';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useWebSidebar } from '../../context/WebSidebarContext';
import {
  buildKidRavStarterChips,
  buildRavStarterChips,
} from '../../constants/ravStarterPrompts';
import {
  buildSwapPickPlan,
  buildSwapReviewFromActions,
  isBoxViewIntent,
  isSwapBrowseIntent,
  stripBlocksForSwapReview,
  stripProductBlocksForBoxPane,
} from '../../services/rav/ravCompanionIntent';
import { resolveRavPaneToOpen } from '../../services/rav/resolveRavPane';
import type { OpenRavCompanionPaneInput } from '../../types/ravPane';

const MAX_HISTORY_TURNS = 10;
const WELCOME_SEND_SIZE = 32;
/** Room for the send overlay — only applied while the field is active. */
const WELCOME_SEND_INSET = WELCOME_SEND_SIZE + spacing.sm;

type RavView = 'welcome' | 'recent' | 'thread';

function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Chat';
  return trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45)}…`;
}

export type PilotAIChatSheetRef = {
  resetToWelcome: () => void;
  showWelcome: () => void;
  startNewChat: (initialMessage?: string) => void;
  /** Seed Rav's first bubble; leave composer empty for the user's follow-up. */
  startChatWithOpeningAssistant: (openingMessage: string) => void;
  showRecentChats: () => void;
  openThread: (threadId: string, fromRecent?: boolean) => void;
  sendMessage: (text: string) => void;
  setInputText: (text: string) => void;
};

type Props = {
  embedded?: boolean;
  bottomInset?: number;
  onOpenCompanionPane?: (input: OpenRavCompanionPaneInput) => void;
};

export const PilotAIChatSheet = React.forwardRef<PilotAIChatSheetRef, Props>(function PilotAIChatSheet(
  {
    embedded: _embedded = true,
    bottomInset = 0,
    onOpenCompanionPane,
  },
  ref
) {
  const { colors } = useThemeMode();
  const { isDesktop, layoutWidth } = useWebLayout();
  const webSidebar = useWebSidebar();
  const setRavSubnav = webSidebar?.setRavSubnav;
  const styles = useMemo(() => createPilotStyles(colors), [colors]);
  const user = useAuthStore((s) => s.user);
  const startAuthForRav = useAuthFlowStore((s) => s.startAuthForRav);
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);
  const { lineItems, persist } = useBoxDraft();
  const { isChildProfile, activeChild, ravEnabledForActiveChild } = useActiveProfile();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<RavView>('welcome');
  const [returnToRecent, setReturnToRecent] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<AIChatThreadSummary[]>([]);
  const [hanukkahStartsOn, setHanukkahStartsOn] = useState<string | null>(null);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [blockFeedback, setBlockFeedback] = useState<string | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState(() => new Date());
  const [welcomeFocused, setWelcomeFocused] = useState(false);
  const pendingInitialMessage = useRef<string | null>(null);
  const [pendingSendNonce, setPendingSendNonce] = useState(0);
  /** Local-only opening assistant bubble not yet written to Firestore. */
  const unpersistedOpeningRef = useRef(false);
  const [focusComposerNonce, setFocusComposerNonce] = useState(0);
  const replyInputRef = useRef<TextInput>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<AIChatMessage>>(null);
  const isGuest = !user?.uid;
  const useKidRavThreads =
    !PILOT_PARENT_ONLY && isChildProfile && ravEnabledForActiveChild && !!activeChild?.id && !isGuest;
  const boxLocked = isBoxLocked(lockAt);
  const { canMutateBox, guardMutation } = usePaymentGate();
  const paymentGated = !canMutateBox;
  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomPad = bottomInset || tabBarHeight;
  const starterChips = useMemo(() => {
    if (isChildProfile && ravEnabledForActiveChild && !PILOT_PARENT_ONLY) {
      return buildKidRavStarterChips(activeChild?.name ?? 'friend');
    }
    return buildRavStarterChips(hanukkahStartsOn);
  }, [isChildProfile, ravEnabledForActiveChild, activeChild?.name, hanukkahStartsOn]);
  const welcomeSubtext = useMemo(() => formatHanukkahWelcomeSubtext(hanukkahStartsOn), [hanukkahStartsOn]);

  const goldGlow = Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm } : shadows.goldGlow;
  const hasInput = input.trim().length > 0;
  /** Active on focus (not first keystroke) so layout/send don't remount mid-type. */
  const welcomeActive = welcomeFocused || hasInput;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!user?.uid || useKidRavThreads) return;
    setRecentChats(await aiChatService.listThreads(user.uid));
  }, [user?.uid, useKidRavThreads]);

  const showBlockFeedback = useCallback((message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setBlockFeedback(message);
    feedbackTimer.current = setTimeout(() => setBlockFeedback(null), 3200);
  }, []);

  const clearComposer = useCallback(() => {
    setMessages([]);
    setError(null);
    setInput('');
    setBlockFeedback(null);
    setThreadId(null);
    setReturnToRecent(false);
    setWelcomeFocused(false);
    unpersistedOpeningRef.current = false;
    setView('welcome');
  }, []);

  const showWelcome = useCallback(() => {
    clearComposer();
    if (!isGuest) void refreshThreads();
  }, [clearComposer, isGuest, refreshThreads]);

  const startNewChat = useCallback((initialMessage?: string) => {
    clearComposer();
    // Don't create a Firestore thread until the first message — empty stubs were
    // filling listThreads(limit 20) and pushing real chats out of Recent.
    const pending = initialMessage?.trim();
    if (!pending) return;
    pendingInitialMessage.current = pending;
    setPendingSendNonce((n) => n + 1);
  }, [clearComposer]);

  const startChatWithOpeningAssistant = useCallback(
    (openingMessage: string) => {
      clearComposer();
      const content = openingMessage.trim();
      if (!content) return;
      setMessages([{ role: 'assistant', content }]);
      unpersistedOpeningRef.current = true;
      setView('thread');
      setFocusComposerNonce((n) => n + 1);
    },
    [clearComposer]
  );

  const resetToWelcome = startNewChat;

  const showRecentChats = useCallback(() => {
    setView('recent');
    setReturnToRecent(false);
    setError(null);
    setBlockFeedback(null);
    if (!isGuest) void refreshThreads();
  }, [isGuest, refreshThreads]);

  const loadThread = useCallback(
    async (id: string, fromRecent = false) => {
      if (!user?.uid) return;
      const thread = useKidRavThreads && activeChild?.id
        ? await kidRavChatService.getThread(user.uid, activeChild.id, id)
        : await aiChatService.getThread(user.uid, id);
      if (!thread) return;
      setThreadId(thread.id);
      setMessages(thread.messages);
      setLastActivityAt(new Date(thread.updatedAt));
      setReturnToRecent(fromRecent);
      setView(thread.messages.length > 0 ? 'thread' : 'welcome');
      setError(null);
      setInput('');
      setBlockFeedback(null);
      unpersistedOpeningRef.current = false;
    },
    [user?.uid, useKidRavThreads, activeChild?.id]
  );

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    getHanukkahConfig().then((c) => {
      setHanukkahStartsOn(c.startsOn ?? null);
      setLockAt(c.lockAt);
    });
    catalogService.getAll().then(setCatalog);
  }, []);

  /** Open on welcome — do not auto-resume the previous thread. */
  useEffect(() => {
    if (isGuest) {
      setThreadId(null);
      setMessages([]);
      setView('welcome');
      setInitializing(false);
      return;
    }
    if (!user?.uid) return;
    void refreshThreads();
    setInitializing(false);
  }, [isGuest, user?.uid, refreshThreads]);

  useEffect(() => {
    if (!setRavSubnav) return;
    if (view === 'recent') setRavSubnav('recent');
    else if (view === 'welcome') setRavSubnav('new');
    else setRavSubnav(returnToRecent ? 'recent' : 'new');
  }, [view, returnToRecent, setRavSubnav]);

  const addBlockItem = useCallback(
    async (item: CatalogItem) => {
      if (boxLocked) {
        showBlockFeedback('Your box is locked — customization is closed.');
        return;
      }
      if (!guardMutation()) return;
      const exists = lineItems.some((li) => li.itemId === item.id);
      if (exists) return;
      await persist([
        ...lineItems,
        {
          slotId: item.slotId,
          itemId: item.id,
          quantity: 1,
          unitCents: item.dollarCostCents > 0 ? item.dollarCostCents : 0,
          label: item.name,
        },
      ]);
      showBlockFeedback(`Added ${item.name} to your box.`);
    },
    [boxLocked, lineItems, persist, showBlockFeedback, guardMutation]
  );

  const swapBlockItem = useCallback(
    async (slotId: string, item: CatalogItem) => {
      if (boxLocked) {
        showBlockFeedback('Your box is locked — customization is closed.');
        return;
      }
      if (!guardMutation()) return;
      const next = lineItems.map((li) =>
        li.slotId === slotId
          ? {
              ...li,
              itemId: item.id,
              label: item.name,
              unitCents: item.dollarCostCents > 0 ? item.dollarCostCents : 0,
            }
          : li
      );
      await persist(next);
      showBlockFeedback(`Swapped in ${item.name}.`);
    },
    [boxLocked, lineItems, persist, showBlockFeedback, guardMutation]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (!isGuest && !user?.uid) return;

      let activeThreadId = threadId;
      if (!isGuest && user?.uid && !activeThreadId) {
        activeThreadId =
          useKidRavThreads && activeChild?.id
            ? await kidRavChatService.createThread(user.uid, activeChild.id)
            : await aiChatService.createThread(user.uid);
        setThreadId(activeThreadId);
      }

      setError(null);
      setInput('');
      setView('thread');
      const userMsg: AIChatMessage = { role: 'user', content: trimmed };
      const prior = messages;
      setMessages([...prior, userMsg]);
      setLoading(true);
      setLastActivityAt(new Date());
      scrollToEnd();

      try {
        const includeOpeningSeed = unpersistedOpeningRef.current;
        const hasUserInPrior = prior.some((m) => m.role === 'user');
        if (!isGuest && !hasUserInPrior && activeThreadId && user?.uid) {
          if (useKidRavThreads && activeChild?.id) {
            await kidRavChatService.updateTitle(user.uid, activeChild.id, activeThreadId, titleFromMessage(trimmed));
          } else {
            await aiChatService.updateTitle(user.uid, activeThreadId, titleFromMessage(trimmed));
            await refreshThreads();
          }
        }
        const ravMode =
          !PILOT_PARENT_ONLY && isChildProfile && ravEnabledForActiveChild ? 'facilitator_kid' : undefined;
        const wantsBoxPane = !ravMode && isBoxViewIntent(trimmed);
        const recentUserMessages = prior
          .filter((m) => m.role === 'user')
          .map((m) => m.content)
          .reverse();
        const wantsSwapBrowse = !ravMode && isSwapBrowseIntent(trimmed, recentUserMessages);

        const { reply, blocks = [], actions = [], pane: ravPane } = await askRav({
          message: trimmed,
          conversationHistory: prior.slice(-MAX_HISTORY_TURNS * 2),
          boxDraftSummary: ravMode ? undefined : summarizeLineItemsForRav(lineItems),
          mode: ravMode,
          childId: ravMode ? activeChild?.id : undefined,
        });

        let content = reply;
        let displayBlocks = blocks;
        let openedPane = false;

        if (!ravMode && !boxLocked && actions.length && catalog.length) {
          if (!guardMutation()) {
            content = `${reply}${reply.endsWith('.') ? '' : '.'} Add a payment method to apply box changes.`;
          } else {
            const { proposals, pendingActions } = buildSwapReviewFromActions(
              actions,
              lineItems,
              catalog
            );
            if (pendingActions.length) {
              openedPane = true;
              onOpenCompanionPane?.({
                kind: 'swap_review',
                source: 'rav',
                title: 'Review changes',
                subtitle: 'Confirm before updating your box',
                payload: {
                  kind: 'swap_review',
                  proposals,
                  pendingActions,
                },
              });
              displayBlocks = stripBlocksForSwapReview(blocks);
            }
          }
        } else if (!ravMode && boxLocked && actions.length) {
          content = `${reply}${reply.endsWith('.') ? '' : '.'} Your box is locked, so I couldn't apply those changes.`;
        }

        // Phase 3: honor LLM pane when actions didn't already open review
        if (!openedPane && !ravMode && ravPane) {
          const resolved = resolveRavPaneToOpen({
            pane: ravPane,
            message: trimmed,
            recentUserMessages,
            lineItems,
            catalog,
            actions,
          });
          if (resolved) {
            openedPane = true;
            onOpenCompanionPane?.(resolved);
            displayBlocks =
              resolved.kind === 'box'
                ? stripProductBlocksForBoxPane(displayBlocks)
                : stripBlocksForSwapReview(displayBlocks);
          }
        }

        if (!openedPane && wantsSwapBrowse && catalog.length) {
          const plan = buildSwapPickPlan(trimmed, recentUserMessages, lineItems, catalog);
          if (plan) {
            openedPane = true;
            onOpenCompanionPane?.({
              kind: 'swap_pick',
              source: 'user',
              title: plan.title,
              subtitle: plan.subtitle,
              payload: {
                kind: 'swap_pick',
                pickMode: plan.pickMode,
                focusSlotId: plan.focusSlotId,
                currentItemId: plan.currentItemId,
                optionItemIds: plan.optionItemIds,
                treatPaths: plan.treatPaths,
              },
            });
            displayBlocks = stripBlocksForSwapReview(displayBlocks);
          }
        }

        if (!openedPane && wantsBoxPane) {
          onOpenCompanionPane?.({
            kind: 'box',
            source: 'user',
            title: 'Your box',
            subtitle: 'Live draft from your Hanukkah box',
          });
          displayBlocks = stripProductBlocksForBoxPane(displayBlocks);
        }

        const assistantMsg: AIChatMessage = { role: 'assistant', content, blocks: displayBlocks };
        setMessages((m) => [...m, assistantMsg]);
        setLastActivityAt(new Date());
        if (!isGuest && activeThreadId && user?.uid) {
          const toAppend: AIChatMessage[] = includeOpeningSeed
            ? [...prior, userMsg, assistantMsg]
            : [userMsg, assistantMsg];
          if (useKidRavThreads && activeChild?.id) {
            await kidRavChatService.appendMessages(user.uid, activeChild.id, activeThreadId, toAppend);
          } else {
            await aiChatService.appendMessages(user.uid, activeThreadId, toAppend);
            await refreshThreads();
          }
          unpersistedOpeningRef.current = false;
        } else if (prior.length >= 1) {
          recordGuestRavPrompt();
        }
        scrollToEnd();
      } catch (err) {
        setMessages(prior);
        setInput(trimmed);
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    },
    [loading, user?.uid, threadId, messages, refreshThreads, scrollToEnd, isGuest, recordGuestRavPrompt, lineItems, catalog, isChildProfile, ravEnabledForActiveChild, activeChild?.id, useKidRavThreads, boxLocked, guardMutation, onOpenCompanionPane]
  );

  /** Web: Enter sends, Shift+Enter inserts a newline.
   * RN Web overwrites `onKeyDown` and only submits Enter when `!multiline || blurOnSubmit`.
   * Use `onKeyPress` (called inside their handler) and preventDefault to block the newline. */
  const handleComposerKeyPress = useCallback(
    (e: { nativeEvent?: { key?: string }; key?: string; shiftKey?: boolean; preventDefault?: () => void }) => {
      if (Platform.OS !== 'web') return;
      const key = e.key ?? e.nativeEvent?.key;
      if (key !== 'Enter' || e.shiftKey) return;
      e.preventDefault?.();
      void sendMessage(input);
    },
    [input, sendMessage],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      resetToWelcome,
      showWelcome,
      startNewChat,
      startChatWithOpeningAssistant,
      showRecentChats,
      openThread: (id: string, fromRecent = true) => {
        void loadThread(id, fromRecent);
      },
      sendMessage,
      setInputText: setInput,
    }),
    [
      resetToWelcome,
      showWelcome,
      startNewChat,
      startChatWithOpeningAssistant,
      showRecentChats,
      loadThread,
      sendMessage,
    ]
  );

  useEffect(() => {
    if (!focusComposerNonce) return;
    const t = setTimeout(() => replyInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [focusComposerNonce]);

  useEffect(() => {
    if (!pendingSendNonce) return;
    const pending = pendingInitialMessage.current;
    if (!pending || loading) return;
    pendingInitialMessage.current = null;
    const t = setTimeout(() => {
      void sendMessage(pending);
    }, 50);
    return () => clearTimeout(t);
  }, [pendingSendNonce, loading, sendMessage]);

  const showWelcomeUi = view === 'welcome' && messages.length === 0 && !loading;
  const showRecentUi = view === 'recent';
  const showThreadUi = view === 'thread' || (messages.length > 0 && view !== 'recent');
  const showGuestSaveChip = isGuest && messages.length >= 2;

  const historyThreads = useMemo(
    () => recentChats.filter((t) => t.preview.length > 0),
    [recentChats]
  );
  const hasThreadHistory = !isGuest && !useKidRavThreads && historyThreads.length > 0;

  const renderMessage = useCallback(
    ({ item }: { item: AIChatMessage; index: number }) => {
      if (item.role === 'user') {
        return (
          <View style={styles.userChipWrap}>
            <View style={styles.userChip}>
              <Text style={styles.userChipText}>{item.content}</Text>
            </View>
          </View>
        );
      }

      return (
        <View style={styles.assistantWrap}>
          <FormattedChatText text={item.content} style={styles.assistantText} />
          {item.blocks?.length ? (
            <RavBlockRenderer
              blocks={item.blocks}
              lineItems={lineItems}
              boxLocked={boxLocked}
              paymentGated={paymentGated}
              guardMutation={guardMutation}
              onSwap={(slotId, catalogItem) => void swapBlockItem(slotId, catalogItem)}
              onAddExtra={(catalogItem) => void addBlockItem(catalogItem)}
            />
          ) : null}
        </View>
      );
    },
    [lineItems, swapBlockItem, addBlockItem, boxLocked, paymentGated, guardMutation]
  );

  const chatFooter = messages.length > 0 ? (
    <View style={styles.threadFooter}>
      <Text style={styles.timestamp}>{formatRelativeTime(lastActivityAt)}</Text>
      <GrapejuiceBrandMark variant="footer" align="left" markOnly animating={loading} />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {initializing ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : showRecentUi ? (
          <ScrollView
            style={styles.scrollHost}
            contentContainerStyle={[
              styles.recentPage,
              isDesktop && styles.welcomeDesktop,
              { paddingBottom: bottomPad + 80 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.recentPageColumn, isDesktop ? { maxWidth: layoutWidth } : null]}>
              <View style={styles.recentPageHeader}>
                <TouchableOpacity
                  style={[styles.headerIconBtn, goldGlow]}
                  onPress={showWelcome}
                  accessibilityLabel="Back to Rav"
                >
                  <Icon icon={icons.arrowLeft} size={14} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.recentPageTitle}>Recent chats</Text>
              </View>
              {isGuest ? (
                <View style={styles.recentEmpty}>
                  <Text style={styles.recentEmptyText}>Sign in to save and browse past Rav conversations.</Text>
                  <TouchableOpacity style={styles.saveChipWide} onPress={() => startAuthForRav('signin')}>
                    <Text style={styles.saveChipText}>log in / create account</Text>
                  </TouchableOpacity>
                </View>
              ) : historyThreads.length === 0 ? (
                <View style={styles.recentEmpty}>
                  <Text style={styles.recentEmptyText}>No chats yet. Start a new conversation with Rav.</Text>
                  <TouchableOpacity style={styles.saveChipWide} onPress={() => startNewChat()}>
                    <Text style={styles.saveChipText}>New chat</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.recentList}>
                  {historyThreads.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.recentListRow, t.id === threadId && styles.historyRowActive]}
                      onPress={() => void loadThread(t.id, true)}
                    >
                      <View style={styles.recentListCopy}>
                        <Text style={styles.recentListTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                        {t.preview ? (
                          <Text style={styles.recentListPreview} numberOfLines={2}>
                            {t.preview}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.recentListDate}>{formatThreadListDate(t.updatedAt)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        ) : showWelcomeUi ? (
          <ScrollView
            style={styles.scrollHost}
            contentContainerStyle={[
              styles.welcome,
              isDesktop && styles.welcomeDesktop,
              { paddingBottom: bottomPad + 80 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.welcomeColumn, isDesktop ? { maxWidth: layoutWidth } : null]}>
            <GrapejuiceBrandMark animating={loading} />
            <View style={styles.welcomeHeadings}>
              <Text style={styles.welcomeTitle}>What&apos;s on your mind?</Text>
              <Text style={styles.welcomeSub}>{welcomeSubtext}</Text>
            </View>

            <View style={styles.welcomeSearchWrap}>
              <SearchPill
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => sendMessage(input)}
                onFocus={() => setWelcomeFocused(true)}
                onBlur={() => setWelcomeFocused(false)}
                onKeyPress={handleComposerKeyPress}
                animatePlaceholder={false}
                contentInsetRight={welcomeActive ? WELCOME_SEND_INSET : 0}
              />
              {welcomeActive ? (
                <TouchableOpacity
                  style={styles.sendCircle}
                  onPress={() => sendMessage(input)}
                  disabled={!hasInput || loading}
                  accessibilityLabel="Send"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Icon
                      icon={icons.arrowUp}
                      size={14}
                      color={hasInput ? colors.textPrimary : colors.goldMuted}
                    />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.chips}>
              {starterChips.map((chip) => (
                <TouchableOpacity key={chip.message} style={styles.chip} onPress={() => sendMessage(chip.message)}>
                  {chip.lines.map((line, i) => (
                    <Text key={`${chip.message}-${i}`} style={styles.chipText}>
                      {line}
                    </Text>
                  ))}
                </TouchableOpacity>
              ))}
            </View>

            {hasThreadHistory ? (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>Recent Chats</Text>
                  <TouchableOpacity onPress={showRecentChats} accessibilityLabel="View all chats">
                    <TextWithChevron
                      text="View All"
                      chevron="always"
                      textStyle={styles.viewAll}
                      iconSize={10}
                      iconColor={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                {historyThreads.slice(0, 5).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.recentRow, t.id === threadId && styles.historyRowActive]}
                    onPress={() => void loadThread(t.id, false)}
                  >
                    <Text style={styles.recentRowTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.recentRowDate}>{formatThreadListDate(t.updatedAt)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            </View>
          </ScrollView>
        ) : showThreadUi ? (
          <>
            {returnToRecent ? (
              <TouchableOpacity
                style={[styles.menuBtn, goldGlow]}
                onPress={showRecentChats}
                accessibilityLabel="Back to recent chats"
              >
                <Icon icon={icons.arrowLeft} size={14} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : null}

            <FlatList
              ref={listRef}
              style={styles.scrollHost}
              data={messages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={[
                styles.threadContent,
                { paddingBottom: bottomPad + 88 },
              ]}
              renderItem={renderMessage}
              ListFooterComponent={chatFooter}
              onContentSizeChange={scrollToEnd}
            />

            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) + (bottomInset || tabBarHeight - 48) }]}>
              {showGuestSaveChip ? (
                <TouchableOpacity
                  style={styles.saveChipAboveComposer}
                  onPress={() => startAuthForRav('signin')}
                >
                  <Text style={styles.saveChipText}>log in / create account to save your chat</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.composerRow}>
                <View style={[styles.replyPill, goldGlow, styles.replyPillFlex]}>
                  <TextInput
                    ref={replyInputRef}
                    style={styles.replyInput}
                    placeholder="Reply to Rav"
                    placeholderTextColor={colors.goldMuted}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    blurOnSubmit={false}
                    onKeyPress={handleComposerKeyPress}
                    {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
                  />
                  <View style={styles.replyActions}>
                    <TouchableOpacity style={styles.pillIconBtn} accessibilityLabel="Add attachment">
                      <Icon icon={icons.plus} size={12} color={colors.goldMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pillIconBtn}
                      onPress={() => sendMessage(input)}
                      disabled={!input.trim() || loading}
                      accessibilityLabel="Send message"
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                      ) : (
                        <Icon icon={icons.arrowUp} size={14} color={colors.textPrimary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {blockFeedback ? (
          <View style={styles.boxToast} pointerEvents="none">
            <Text style={styles.boxToastText}>{blockFeedback}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});

function createPilotStyles(colors: SemanticColors) {
  return StyleSheet.create({
  root: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
  flex: { flex: 1, width: '100%' },
  scrollHost: { flex: 1, width: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: {
    paddingTop: spacing.xxl,
  },
  welcomeDesktop: {
    alignItems: 'center',
    width: '100%',
  },
  welcomeColumn: {
    width: '100%',
    paddingHorizontal: MOBILE_GUTTER,
    alignItems: 'center',
    gap: spacing.xl,
  },
  threadContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    gap: spacing.lg,
    width: '100%',
  },
  welcomeHeadings: { alignItems: 'center', gap: spacing.xs },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.72,
  },
  welcomeSub: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    letterSpacing: -0.22,
  },
  /** Full-width pill in the welcome column; send sits as an overlay. */
  welcomeSearchWrap: {
    width: '100%',
    alignSelf: 'stretch',
    position: 'relative',
  },
  sendCircle: {
    position: 'absolute',
    right: MOBILE_GUTTER,
    top: (SEARCH_PILL_HEIGHT - WELCOME_SEND_SIZE) / 2,
    zIndex: 4,
    width: WELCOME_SEND_SIZE,
    height: WELCOME_SEND_SIZE,
    borderRadius: WELCOME_SEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSection: { width: '100%', gap: 6 },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  recentTitle: { fontSize: typography.sm, fontWeight: '400', color: colors.textPrimary },
  viewAll: { fontSize: typography.sm, fontWeight: '200', color: colors.goldMuted },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    // Softer than goldMuted — same gold family as brand at reduced strength.
    borderColor: 'rgba(216, 201, 144, 0.45)',
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  recentRowTitle: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: '400',
    color: colors.textPrimary,
  },
  recentRowDate: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    opacity: 0.5,
  },
  recentPage: {
    paddingTop: spacing.lg,
  },
  recentPageColumn: {
    width: '100%',
    paddingHorizontal: MOBILE_GUTTER,
    gap: spacing.lg,
  },
  recentPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPageTitle: {
    fontSize: 24,
    fontWeight: '400',
    color: colors.textPrimary,
    letterSpacing: -0.72,
  },
  recentList: { width: '100%', gap: spacing.sm },
  recentListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 0.5,
    borderColor: 'rgba(216, 201, 144, 0.45)',
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  recentListCopy: { flex: 1, gap: 4, minWidth: 0 },
  recentListTitle: {
    fontSize: typography.md,
    fontWeight: '500',
    color: colors.textPrimary,
    letterSpacing: -0.26,
  },
  recentListPreview: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    lineHeight: 18,
    letterSpacing: -0.22,
  },
  recentListDate: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    opacity: 0.6,
    flexShrink: 0,
    marginTop: 2,
  },
  recentEmpty: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  recentEmptyText: {
    fontSize: typography.md,
    fontWeight: '200',
    color: colors.goldMuted,
    textAlign: 'center',
    letterSpacing: -0.26,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    borderWidth: 0.5,
    borderColor: colors.goldMuted,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  chipText: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.22,
    lineHeight: 16,
  },
  menuBtn: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userChipWrap: { alignItems: 'flex-end' },
  userChip: {
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '92%',
  },
  userChipText: {
    fontSize: typography.lg,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.26,
  },
  assistantWrap: { paddingRight: spacing.xl },
  assistantText: {
    fontSize: typography.lg,
    color: colors.textPrimary,
    lineHeight: 20,
    letterSpacing: -0.39,
  },
  threadFooter: { gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start', width: '100%' },
  timestamp: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    letterSpacing: -0.22,
  },
  saveChipAboveComposer: {
    alignSelf: 'center',
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  saveChipWide: {
    marginTop: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'center',
  },
  saveChipText: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.textPrimary,
    letterSpacing: -0.22,
  },
  inputBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  replyPillFlex: {
    flex: 1,
    minWidth: 0,
  },
  replyPill: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    // Web <textarea> won't shrink in a row without this — otherwise icons wrap under.
    minWidth: 0,
    width: 0,
    fontSize: typography.lg,
    lineHeight: typography.lg,
    color: colors.textPrimary,
    maxHeight: 180,
    // Match welcome search: zero vertical padding so text shares the icon midline.
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    ...typeface('regular'),
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', minHeight: typography.lg } as object)
      : { includeFontPadding: false, textAlignVertical: 'center' }),
  },
  replyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: spacing.sm,
    height: typography.lg,
  },
  pillIconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.error, fontSize: typography.sm, padding: spacing.md, textAlign: 'center' },
  historyRowActive: {
    backgroundColor: colors.brandLight,
  },
  boxToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '90%',
    zIndex: 10,
  },
  boxToastText: {
    fontSize: typography.sm,
    fontWeight: '400',
    color: colors.bgPrimary,
    textAlign: 'center',
  },
  });
}
