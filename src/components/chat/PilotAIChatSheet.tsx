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
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { aiChatService } from '../../services/firestore/aiChat';
import { kidRavChatService } from '../../services/firestore/kidRavChat';
import { askRav } from '../../services/rav/askRav';
import { applyRavDraftActions, summarizeLineItemsForRav } from '../../services/rav/applyRavDraftActions';
import { getHanukkahConfig, isBoxLocked } from '../../services/firestore/config';
import { catalogService } from '../../services/firestore/catalog';
import { formatHanukkahWelcomeSubtext, formatRelativeTime, formatThreadListDate } from '../../services/hanukkah/dates';
import type { AIChatMessage, AIChatThreadSummary } from '../../types/aiChat';
import type { CatalogItem } from '../../types/pilot';
import { spacing, typography, borderRadius, shadows, shadowsWeb, MOBILE_GUTTER, tabBarTotalHeight, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { RavBlockRenderer } from './RavBlockRenderer';

const MAX_HISTORY_TURNS = 10;
/** Figma 366:1762 — 13px type + 12px vertical padding ≈ 37px pill height */
const WELCOME_SEARCH_LINE_HEIGHT = typography.lg;

type StarterChip = {
  lines: string[];
  message: string;
};

function buildKidStarterChips(childName: string): StarterChip[] {
  const name = childName.trim() || 'friend';
  return [
    { lines: ['What should we do', 'tonight?'], message: 'What should we do tonight?' },
    { lines: ['Tell me about', 'Hanukkah candles'], message: 'Tell me about Hanukkah candles' },
    { lines: [`Hi Rav, I'm ${name}`], message: `Hi Rav, I'm ${name}` },
  ];
}

function buildStarterChips(hanukkahStartsOn: string | null): StarterChip[] {
  const countdown = formatHanukkahWelcomeSubtext(hanukkahStartsOn);
  const planMessage =
    countdown.startsWith('Hanukkah is in') || countdown.startsWith('Night')
      ? `${countdown.replace(/\.$/, '')}, help me make a plan`
      : 'Help me make a Hanukkah plan';
  const commaIdx = planMessage.indexOf(',');
  const planLines =
    commaIdx >= 0
      ? [planMessage.slice(0, commaIdx + 1), planMessage.slice(commaIdx + 1).trim()]
      : [planMessage];

  return [
    { lines: planLines, message: planMessage },
    { lines: ["I'm looking for books", 'to read with my kids'], message: "I'm looking for books to read with my kids" },
    { lines: ['What should we do', 'on night 1?'], message: 'What should we do on night 1?' },
    { lines: ["We just had a baby, I don't", 'know where to start'], message: "We just had a baby, I don't know where to start" },
    { lines: ['Help me choose', 'latkes or sufganiyot'], message: 'Help me choose latkes or sufganiyot' },
    { lines: ['Ideas for kids', 'who are new to Hanukkah'], message: 'Ideas for kids who are new to Hanukkah' },
    { lines: ['I want to do a', 'family game night'], message: 'I want to do a family game night' },
  ];
}

function titleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Chat';
  return trimmed.length <= 48 ? trimmed : `${trimmed.slice(0, 45)}…`;
}

export type PilotAIChatSheetRef = {
  resetToWelcome: () => void;
  sendMessage: (text: string) => void;
  setInputText: (text: string) => void;
};

type Props = {
  embedded?: boolean;
  bottomInset?: number;
  initialMessage?: string;
};

export const PilotAIChatSheet = React.forwardRef<PilotAIChatSheetRef, Props>(function PilotAIChatSheet(
  { embedded = true, bottomInset = 0, initialMessage },
  ref
) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createPilotStyles(colors), [colors]);
  const user = useAuthStore((s) => s.user);
  const startAuthForRav = useAuthFlowStore((s) => s.startAuthForRav);
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);
  const { lineItems, persist } = useBoxDraft();
  const { isChildProfile, activeChild, ravEnabledForActiveChild } = useActiveProfile();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<AIChatThreadSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hanukkahStartsOn, setHanukkahStartsOn] = useState<string | null>(null);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [blockFeedback, setBlockFeedback] = useState<string | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState(() => new Date());
  const initialSent = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<AIChatMessage>>(null);
  const isGuest = !user?.uid;
  const useKidRavThreads =
    !PILOT_PARENT_ONLY && isChildProfile && ravEnabledForActiveChild && !!activeChild?.id && !isGuest;
  const boxLocked = isBoxLocked(lockAt);
  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomPad = bottomInset || tabBarHeight;
  const starterChips = useMemo(() => {
    if (isChildProfile && ravEnabledForActiveChild && !PILOT_PARENT_ONLY) {
      return buildKidStarterChips(activeChild?.name ?? 'friend');
    }
    return buildStarterChips(hanukkahStartsOn);
  }, [isChildProfile, ravEnabledForActiveChild, activeChild?.name, hanukkahStartsOn]);
  const welcomeSubtext = useMemo(() => formatHanukkahWelcomeSubtext(hanukkahStartsOn), [hanukkahStartsOn]);
  const firstUserIndex = useMemo(() => messages.findIndex((m) => m.role === 'user'), [messages]);

  const goldGlow = Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm } : shadows.goldGlow;
  const hasInput = input.trim().length > 0;

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

  const resetToWelcome = useCallback(() => {
    setMessages([]);
    setError(null);
    setInput('');
    setBlockFeedback(null);
    if (!user?.uid) return;
    void refreshThreads();
    if (useKidRavThreads && activeChild?.id) {
      kidRavChatService.createThread(user.uid, activeChild.id).then((id) => setThreadId(id));
      return;
    }
    aiChatService.createThread(user.uid).then((id) => setThreadId(id));
  }, [user?.uid, refreshThreads, useKidRavThreads, activeChild?.id]);

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

  useEffect(() => {
    if (isGuest) {
      setThreadId(null);
      setMessages([]);
      setInitializing(false);
      return;
    }
    if (!user?.uid) return;
    const loadThread = useKidRavThreads && activeChild?.id
      ? kidRavChatService.getOrCreateDefaultThread(user.uid, activeChild.id)
      : aiChatService.getOrCreateDefaultThread(user.uid);
    loadThread.then(({ threadId: id, thread }) => {
      setThreadId(id);
      setMessages(thread.messages);
      refreshThreads();
      setInitializing(false);
    });
  }, [isGuest, user?.uid, refreshThreads, useKidRavThreads, activeChild?.id]);

  const addBlockItem = useCallback(
    async (item: CatalogItem) => {
      if (boxLocked) {
        showBlockFeedback('Your box is locked — customization is closed.');
        return;
      }
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
    [boxLocked, lineItems, persist, showBlockFeedback]
  );

  const swapBlockItem = useCallback(
    async (slotId: string, item: CatalogItem) => {
      if (boxLocked) {
        showBlockFeedback('Your box is locked — customization is closed.');
        return;
      }
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
    [boxLocked, lineItems, persist, showBlockFeedback]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      if (!isGuest && (!user?.uid || !threadId)) return;

      setError(null);
      setInput('');
      const userMsg: AIChatMessage = { role: 'user', content: trimmed };
      const prior = messages;
      setMessages([...prior, userMsg]);
      setLoading(true);
      setLastActivityAt(new Date());
      scrollToEnd();

      try {
        if (!isGuest && prior.length === 0 && threadId) {
          if (useKidRavThreads && activeChild?.id) {
            await kidRavChatService.updateTitle(user.uid, activeChild.id, threadId, titleFromMessage(trimmed));
          } else {
            await aiChatService.updateTitle(user.uid, threadId, titleFromMessage(trimmed));
            await refreshThreads();
          }
        }
        const ravMode =
          !PILOT_PARENT_ONLY && isChildProfile && ravEnabledForActiveChild ? 'facilitator_kid' : undefined;
        const { reply, blocks = [], actions = [] } = await askRav({
          message: trimmed,
          conversationHistory: prior.slice(-MAX_HISTORY_TURNS * 2),
          boxDraftSummary: ravMode ? undefined : summarizeLineItemsForRav(lineItems),
          mode: ravMode,
          childId: ravMode ? activeChild?.id : undefined,
        });

        let content = reply;
        if (!ravMode && !boxLocked && actions.length && catalog.length) {
          const { lineItems: nextItems, applied } = applyRavDraftActions(actions, lineItems, catalog);
          if (applied.length) {
            await persist(nextItems);
            content = `${reply}${reply.endsWith('.') ? '' : '.'} I updated your box (${applied.length} change${applied.length === 1 ? '' : 's'}).`;
          }
        } else if (!ravMode && boxLocked && actions.length) {
          content = `${reply}${reply.endsWith('.') ? '' : '.'} Your box is locked, so I couldn't apply those changes.`;
        }

        const assistantMsg: AIChatMessage = { role: 'assistant', content, blocks };
        setMessages((m) => [...m, assistantMsg]);
        setLastActivityAt(new Date());
        if (!isGuest && threadId) {
          if (useKidRavThreads && activeChild?.id) {
            await kidRavChatService.appendMessages(user.uid, activeChild.id, threadId, [
              userMsg,
              assistantMsg,
            ]);
          } else {
            await aiChatService.appendMessages(user.uid, threadId, [userMsg, assistantMsg]);
            await refreshThreads();
          }
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
    [loading, user?.uid, threadId, messages, refreshThreads, scrollToEnd, isGuest, recordGuestRavPrompt, lineItems, catalog, persist, isChildProfile, ravEnabledForActiveChild, activeChild?.id, useKidRavThreads, boxLocked]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      resetToWelcome,
      sendMessage,
      setInputText: setInput,
    }),
    [resetToWelcome, sendMessage]
  );

  useEffect(() => {
    if (!initialMessage?.trim() || initialSent.current) return;
    initialSent.current = true;
    setTimeout(() => {
      void sendMessage(initialMessage.trim());
    }, 100);
  }, [initialMessage, sendMessage]);

  const showWelcome = messages.length === 0 && !loading;
  const showGuestSaveChip = isGuest && messages.length >= 2;

  const historyThreads = useMemo(
    () => recentChats.filter((t) => !(t.id === 'default' && t.title === 'Chat')),
    [recentChats]
  );
  const hasThreadHistory = !isGuest && !useKidRavThreads && historyThreads.length > 0;

  const openThread = useCallback(
    async (threadId: string) => {
      if (!user?.uid) return;
      const thread = await aiChatService.getThread(user.uid, threadId);
      if (thread) {
        setThreadId(thread.id);
        setMessages(thread.messages);
        setLastActivityAt(new Date(thread.updatedAt));
      }
    },
    [user?.uid]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: AIChatMessage; index: number }) => {
      if (item.role === 'user') {
        const isFirstUser = index === firstUserIndex;
        if (isFirstUser) {
          return (
            <View style={styles.userChipWrap}>
              <View style={styles.userChip}>
                <Text style={styles.userChipText}>{item.content}</Text>
              </View>
            </View>
          );
        }
        return (
          <View style={styles.userReplyWrap}>
            <Text style={styles.userReplyText}>{item.content}</Text>
          </View>
        );
      }

      return (
        <View style={styles.assistantWrap}>
          <Text style={styles.assistantText}>{item.content}</Text>
          {item.blocks?.length ? (
            <RavBlockRenderer
              blocks={item.blocks}
              lineItems={lineItems}
              boxLocked={boxLocked}
              onSwap={(slotId, catalogItem) => void swapBlockItem(slotId, catalogItem)}
              onAddExtra={(catalogItem) => void addBlockItem(catalogItem)}
            />
          ) : null}
        </View>
      );
    },
    [firstUserIndex, lineItems, swapBlockItem, addBlockItem, boxLocked]
  );

  const chatFooter = messages.length > 0 ? (
    <View style={styles.threadFooter}>
      <View style={styles.threadMeta}>
        <Text style={styles.timestamp}>{formatRelativeTime(lastActivityAt)}</Text>
        {showGuestSaveChip ? (
          <TouchableOpacity style={styles.saveChip} onPress={() => startAuthForRav('signin')}>
            <Text style={styles.saveChipText}>log in / create account to save your chat</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <GrapejuiceBrandMark variant="footer" align="left" markOnly />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {initializing ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : showWelcome ? (
          <ScrollView
            contentContainerStyle={[
              styles.welcome,
              hasThreadHistory && styles.welcomeReturning,
              { paddingBottom: bottomPad + 80 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <GrapejuiceBrandMark markOnly={hasThreadHistory} />
            <View style={styles.welcomeHeadings}>
              <Text style={styles.welcomeTitle}>What&apos;s on your mind?</Text>
              <Text style={styles.welcomeSub}>{welcomeSubtext}</Text>
            </View>

            <View style={[styles.searchPill, goldGlow]}>
              <TextInput
                style={[
                  styles.welcomeInput,
                  !hasInput && styles.welcomeInputEmpty,
                  hasInput && styles.welcomeInputActive,
                ]}
                placeholder="Search or ask a question"
                placeholderTextColor={colors.textPrimary}
                value={input}
                onChangeText={setInput}
                multiline={hasInput}
                scrollEnabled={hasInput}
                onSubmitEditing={() => sendMessage(input)}
              />
              {hasInput ? (
                <TouchableOpacity
                  style={styles.sendCircle}
                  onPress={() => sendMessage(input)}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Icon icon={icons.arrowUp} size={14} color={colors.textPrimary} />
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
                  <TouchableOpacity
                    onPress={() => {
                      refreshThreads();
                      setHistoryOpen(true);
                    }}
                    accessibilityLabel="View all chats"
                  >
                    <Text style={styles.viewAll}>View All {'>'}</Text>
                  </TouchableOpacity>
                </View>
                {historyThreads.slice(0, 5).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.recentRow, t.id === threadId && styles.historyRowActive]}
                    onPress={() => void openThread(t.id)}
                  >
                    <Text style={styles.recentRowTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.recentRowDate}>{formatThreadListDate(t.updatedAt)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.menuBtn, goldGlow]}
              onPress={() => {
                refreshThreads();
                setHistoryOpen(true);
              }}
              accessibilityLabel="Chat menu"
            >
              <Icon icon={icons.menu} size={16} color={colors.textPrimary} />
            </TouchableOpacity>

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.xxxl,
                paddingBottom: bottomPad + 88,
                gap: spacing.lg,
              }}
              renderItem={renderMessage}
              ListFooterComponent={chatFooter}
              onContentSizeChange={scrollToEnd}
            />

            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) + (bottomInset || tabBarHeight - 48) }]}>
              <View style={[styles.replyPill, goldGlow]}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Reply to Rav"
                  placeholderTextColor={colors.goldMuted}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  fontSize={typography.lg}
                />
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
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {blockFeedback ? (
          <View style={styles.boxToast} pointerEvents="none">
            <Text style={styles.boxToastText}>{blockFeedback}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Modal visible={historyOpen} animationType="slide" transparent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setHistoryOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Recent chats</Text>
            {!user?.uid ? (
              <Text style={styles.modalHint}>Sign in to save and browse past Rav conversations.</Text>
            ) : null}
            {historyThreads.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.historyRow, t.id === threadId && styles.historyRowActive]}
                onPress={() => {
                  setHistoryOpen(false);
                  setBlockFeedback(null);
                  void openThread(t.id);
                }}
              >
                <Text style={styles.historyRowTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.historyRowDate}>{formatThreadListDate(t.updatedAt)}</Text>
              </TouchableOpacity>
            ))}
            {isGuest ? (
              <TouchableOpacity style={styles.saveChipWide} onPress={() => { setHistoryOpen(false); startAuthForRav('signin'); }}>
                <Text style={styles.saveChipText}>log in / create account to save your chat</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
});

function createPilotStyles(colors: SemanticColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  flex: { flex: 1, width: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.xl,
  },
  welcomeReturning: {
    paddingTop: 96,
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
  searchPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
    borderRadius: borderRadius.pill,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
  },
  welcomeInput: {
    flex: 1,
    fontSize: typography.lg,
    lineHeight: WELCOME_SEARCH_LINE_HEIGHT,
    color: colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    letterSpacing: -0.26,
    ...typeface('regular'),
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', height: WELCOME_SEARCH_LINE_HEIGHT } as object)
      : { includeFontPadding: false, textAlignVertical: 'center' }),
  },
  welcomeInputEmpty: {
    textAlign: 'center',
    flex: 0,
    flexGrow: 1,
  },
  welcomeInputActive: {
    textAlign: 'left',
    maxHeight: 120,
  },
  sendCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
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
    borderColor: colors.goldMuted,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
  userReplyWrap: { paddingLeft: spacing.xl },
  userReplyText: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: colors.goldMuted,
    lineHeight: 20,
    letterSpacing: -0.39,
  },
  assistantWrap: { paddingRight: spacing.xl },
  assistantText: {
    fontSize: typography.lg,
    color: colors.textPrimary,
    lineHeight: 20,
    letterSpacing: -0.39,
  },
  threadFooter: { gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start', width: '100%' },
  threadMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  timestamp: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    letterSpacing: -0.22,
  },
  saveChip: {
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
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
  replyPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.bgPrimary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    fontSize: typography.lg,
    color: colors.textPrimary,
    maxHeight: 180,
    paddingVertical: spacing.xs,
    ...typeface('regular'),
  },
  pillIconBtn: {
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  error: { color: colors.error, fontSize: typography.sm, padding: spacing.md, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.lg,
    maxHeight: '60%',
  },
  modalTitle: { fontSize: typography.titleLg, fontWeight: '700', marginBottom: spacing.md },
  modalHint: { fontSize: typography.sm, color: colors.textSecondary, marginBottom: spacing.md },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  historyRowTitle: { flex: 1, fontSize: typography.md, color: colors.textPrimary },
  historyRowDate: { fontSize: typography.sm, fontWeight: '200', color: colors.goldMuted, opacity: 0.5 },
  historyRowActive: {
    backgroundColor: colors.brandLight,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
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
