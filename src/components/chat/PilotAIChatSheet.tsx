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
import { askRav } from '../../services/rav/askRav';
import { applyRavDraftActions, summarizeLineItemsForRav } from '../../services/rav/applyRavDraftActions';
import { getHanukkahConfig } from '../../services/firestore/config';
import { catalogService } from '../../services/firestore/catalog';
import { formatHanukkahWelcomeSubtext, formatRelativeTime, formatThreadListDate } from '../../services/hanukkah/dates';
import type { AIChatMessage, AIChatThreadSummary } from '../../types/aiChat';
import type { CatalogItem } from '../../types/pilot';
import { semanticColors, spacing, typography, borderRadius, shadows, shadowsWeb, MOBILE_GUTTER, tabBarTotalHeight } from '../../constants/theme';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { RavBlockRenderer } from './RavBlockRenderer';

const MAX_HISTORY_TURNS = 10;
/** Figma 366:1762 — 13px type + 12px vertical padding ≈ 37px pill height */
const WELCOME_SEARCH_LINE_HEIGHT = typography.lg;

type StarterChip = {
  lines: string[];
  message: string;
};

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
  const user = useAuthStore((s) => s.user);
  const startAuthForRav = useAuthFlowStore((s) => s.startAuthForRav);
  const recordGuestRavPrompt = useGuestSessionStore((s) => s.recordGuestRavPrompt);
  const { lineItems, persist } = useBoxDraft();
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
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lastActivityAt, setLastActivityAt] = useState(() => new Date());
  const initialSent = useRef(false);
  const listRef = useRef<FlatList<AIChatMessage>>(null);
  const isGuest = !user?.uid;

  const tabBarHeight = tabBarTotalHeight(Math.max(insets.bottom, 0));
  const bottomPad = bottomInset || tabBarHeight;
  const starterChips = useMemo(() => buildStarterChips(hanukkahStartsOn), [hanukkahStartsOn]);
  const welcomeSubtext = useMemo(() => formatHanukkahWelcomeSubtext(hanukkahStartsOn), [hanukkahStartsOn]);
  const firstUserIndex = useMemo(() => messages.findIndex((m) => m.role === 'user'), [messages]);

  const goldGlow = Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlowSm } : shadows.goldGlow;
  const hasInput = input.trim().length > 0;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!user?.uid) return;
    setRecentChats(await aiChatService.listThreads(user.uid));
  }, [user?.uid]);

  const resetToWelcome = useCallback(() => {
    setMessages([]);
    setError(null);
    setInput('');
    if (user?.uid) {
      void refreshThreads();
      aiChatService.getOrCreateDefaultThread(user.uid).then(({ threadId: id }) => setThreadId(id));
    }
  }, [user?.uid, refreshThreads]);

  useEffect(() => {
    getHanukkahConfig().then((c) => setHanukkahStartsOn(c.startsOn ?? null));
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
    aiChatService.getOrCreateDefaultThread(user.uid).then(({ threadId: id, thread }) => {
      setThreadId(id);
      setMessages(thread.messages);
      refreshThreads();
      setInitializing(false);
    });
  }, [isGuest, user?.uid, refreshThreads]);

  const addBlockItem = useCallback(
    async (item: CatalogItem) => {
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
    },
    [lineItems, persist]
  );

  const swapBlockItem = useCallback(
    async (slotId: string, item: CatalogItem) => {
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
    },
    [lineItems, persist]
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
        if (!isGuest && prior.length === 0) {
          await aiChatService.updateTitle(user.uid, threadId, titleFromMessage(trimmed));
          await refreshThreads();
        }
        const { reply, blocks = [], actions = [] } = await askRav({
          message: trimmed,
          conversationHistory: prior.slice(-MAX_HISTORY_TURNS * 2),
          boxDraftSummary: summarizeLineItemsForRav(lineItems),
        });

        let content = reply;
        if (actions.length && catalog.length) {
          const { lineItems: nextItems, applied } = applyRavDraftActions(actions, lineItems, catalog);
          if (applied.length) {
            await persist(nextItems);
            content = `${reply}${reply.endsWith('.') ? '' : '.'} I updated your box (${applied.length} change${applied.length === 1 ? '' : 's'}).`;
          }
        }

        const assistantMsg: AIChatMessage = { role: 'assistant', content, blocks };
        setMessages((m) => [...m, assistantMsg]);
        setLastActivityAt(new Date());
        if (!isGuest) {
          await aiChatService.appendMessages(user.uid, threadId, [userMsg, assistantMsg]);
          await refreshThreads();
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
    [loading, user?.uid, threadId, messages, refreshThreads, scrollToEnd, isGuest, recordGuestRavPrompt, lineItems, catalog, persist]
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
  const hasThreadHistory = !isGuest && historyThreads.length > 0;

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
              onSwap={(slotId, catalogItem) => void swapBlockItem(slotId, catalogItem)}
              onAddExtra={(catalogItem) => void addBlockItem(catalogItem)}
            />
          ) : null}
        </View>
      );
    },
    [firstUserIndex, lineItems, swapBlockItem, addBlockItem]
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
            <ActivityIndicator color={semanticColors.brand} />
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
                placeholderTextColor={semanticColors.textPrimary}
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
                    <ActivityIndicator size="small" color={semanticColors.textPrimary} />
                  ) : (
                    <Icon icon={icons.arrowUp} size={14} color={semanticColors.textPrimary} />
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
                    style={styles.recentRow}
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
              <Icon icon={icons.menu} size={16} color={semanticColors.textPrimary} />
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
                  placeholderTextColor={semanticColors.goldMuted}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  fontSize={typography.lg}
                />
                <TouchableOpacity style={styles.pillIconBtn} accessibilityLabel="Add attachment">
                  <Icon icon={icons.plus} size={12} color={semanticColors.goldMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillIconBtn}
                  onPress={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  accessibilityLabel="Send message"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={semanticColors.textPrimary} />
                  ) : (
                    <Icon icon={icons.arrowUp} size={14} color={semanticColors.textPrimary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
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
                style={styles.historyRow}
                onPress={() => {
                  setHistoryOpen(false);
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
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
    color: semanticColors.textPrimary,
    letterSpacing: -0.72,
  },
  welcomeSub: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.goldMuted,
    letterSpacing: -0.22,
  },
  searchPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.pill,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
  },
  welcomeInput: {
    flex: 1,
    fontSize: typography.lg,
    lineHeight: WELCOME_SEARCH_LINE_HEIGHT,
    color: semanticColors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    letterSpacing: -0.26,
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
  recentTitle: { fontSize: typography.sm, fontWeight: '400', color: semanticColors.textPrimary },
  viewAll: { fontSize: typography.sm, fontWeight: '200', color: semanticColors.goldMuted },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  recentRowTitle: {
    flex: 1,
    fontSize: typography.sm,
    fontWeight: '400',
    color: semanticColors.textPrimary,
  },
  recentRowDate: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.goldMuted,
    opacity: 0.5,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: {
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  chipText: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textPrimary,
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
    backgroundColor: semanticColors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userChipWrap: { alignItems: 'flex-end' },
  userChip: {
    borderWidth: 0.5,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '92%',
  },
  userChipText: {
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.26,
  },
  userReplyWrap: { paddingLeft: spacing.xl },
  userReplyText: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.goldMuted,
    lineHeight: 20,
    letterSpacing: -0.39,
  },
  assistantWrap: { paddingRight: spacing.xl },
  assistantText: {
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
    lineHeight: 20,
    letterSpacing: -0.39,
  },
  threadFooter: { gap: spacing.sm, marginTop: spacing.sm, alignItems: 'flex-start', width: '100%' },
  threadMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  timestamp: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.goldMuted,
    letterSpacing: -0.22,
  },
  saveChip: {
    borderWidth: 0.5,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  saveChipWide: {
    marginTop: spacing.md,
    borderWidth: 0.5,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'center',
  },
  saveChipText: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textPrimary,
    letterSpacing: -0.22,
  },
  inputBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  replyPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
    maxHeight: 180,
    paddingVertical: spacing.xs,
  },
  pillIconBtn: {
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  error: { color: semanticColors.error, fontSize: typography.sm, padding: spacing.md, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: semanticColors.bgPrimary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.lg,
    maxHeight: '60%',
  },
  modalTitle: { fontSize: typography.titleLg, fontWeight: '700', marginBottom: spacing.md },
  modalHint: { fontSize: typography.sm, color: semanticColors.textSecondary, marginBottom: spacing.md },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    gap: spacing.sm,
  },
  historyRowTitle: { flex: 1, fontSize: typography.md, color: semanticColors.textPrimary },
  historyRowDate: { fontSize: typography.sm, fontWeight: '200', color: semanticColors.goldMuted, opacity: 0.5 },
});
