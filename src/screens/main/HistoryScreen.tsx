import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { OrderHistoryList } from '../../components/orders/OrderHistoryList';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useSession } from '../../hooks/useSession';
import { useCatalog } from '../../hooks/useCatalog';
import type { MainStackParamList } from '../../navigation/types';
import { aiChatService } from '../../services/firestore/aiChat';
import { ordersService } from '../../services/firestore/orders';
import { formatThreadListDate } from '../../services/hanukkah/dates';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useAuthStore } from '../../stores/authStore';
import { useBrowsingHistoryStore } from '../../stores/browsingHistoryStore';
import type { AIChatThreadSummary } from '../../types/aiChat';
import type { PilotOrder } from '../../types/pilot';

type Nav = StackNavigationProp<MainStackParamList>;

export function HistoryScreen() {
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <HistoryScreenBody />
    </StorefrontChrome>
  );
}

function HistoryScreenBody() {
  const navigation = useNavigation<Nav>();
  const { isDesktop, layoutWidth } = useWebLayout();
  const user = useAuthStore((s) => s.user);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const { household, loading: sessionLoading } = useSession();
  const { items: catalog } = useCatalog();
  const browsingEntries = useBrowsingHistoryStore((s) => s.entries);
  const dismissBrowse = useBrowsingHistoryStore((s) => s.dismiss);

  const [threads, setThreads] = useState<AIChatThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const isGuest = !user?.uid;

  const refreshThreads = useCallback(async () => {
    if (!user?.uid) {
      setThreads([]);
      return;
    }
    setThreadsLoading(true);
    try {
      setThreads(await aiChatService.listThreads(user.uid));
    } finally {
      setThreadsLoading(false);
    }
  }, [user?.uid]);

  const refreshOrders = useCallback(async () => {
    if (!household?.id) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      setOrders(await ordersService.listForHousehold(household.id));
    } finally {
      setOrdersLoading(false);
    }
  }, [household?.id]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const browsingRows = useMemo(() => {
    return browsingEntries.map((e) => {
      const catalogItem = catalog.find((c) => c.id === e.itemId);
      return {
        ...e,
        name: catalogItem?.name?.trim() || e.name,
      };
    });
  }, [browsingEntries, catalog]);

  const openThread = (threadId: string) => {
    navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'thread', threadId } });
  };

  const archiveThread = async (threadId: string) => {
    if (!user?.uid) return;
    setArchivingId(threadId);
    try {
      await aiChatService.archiveThread(user.uid, threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } finally {
      setArchivingId(null);
    }
  };

  const openProduct = (itemId: string) => {
    navigation.navigate('CatalogProduct', { slug: itemId });
  };

  const signIn = () => startAuthFromGuest('History', 'signin');

  const body = (
    <>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>History</Text>
      <Text style={styles.lead}>Chats with Rav, pages you’ve browsed, and your orders.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Chat history</Text>
        <Text style={styles.sectionLead}>Recent conversations with Rav</Text>
        {isGuest ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>Sign in to save and browse past Rav conversations.</Text>
            <TouchableOpacity style={styles.signInChip} onPress={signIn} accessibilityRole="button">
              <Text style={styles.signInChipText}>log in / create account</Text>
            </TouchableOpacity>
          </View>
        ) : threadsLoading ? (
          <ActivityIndicator color={semanticColors.brand} style={styles.spinner} />
        ) : threads.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>No chats yet. Start a conversation with Rav.</Text>
            <TouchableOpacity
              style={styles.signInChip}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } })}
              accessibilityRole="button"
            >
              <Text style={styles.signInChipText}>Open Rav</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {threads.map((t) => (
              <View key={t.id} style={styles.chatRow}>
                <TouchableOpacity
                  style={styles.chatRowMain}
                  onPress={() => openThread(t.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat ${t.title}`}
                >
                  <View style={styles.chatCopy}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    {t.preview ? (
                      <Text style={styles.chatPreview} numberOfLines={2}>
                        {t.preview}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.chatDate}>{formatThreadListDate(t.updatedAt)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.archiveBtn}
                  onPress={() => void archiveThread(t.id)}
                  disabled={archivingId === t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Archive chat ${t.title}`}
                >
                  <Text style={styles.archiveBtnText}>
                    {archivingId === t.id ? '…' : 'Archive'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Browsing history</Text>
        <Text style={styles.sectionLead}>Products you’ve viewed recently</Text>
        {browsingRows.length === 0 ? (
          <Text style={styles.emptyText}>No browsing history yet. Open a product to start a trail.</Text>
        ) : (
          <View style={styles.list}>
            {browsingRows.map((e) => (
              <View key={e.itemId} style={styles.browseRow}>
                <TouchableOpacity
                  style={styles.browseMain}
                  onPress={() => openProduct(e.itemId)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${e.name}`}
                >
                  <Text style={styles.browseName} numberOfLines={2}>
                    {e.name}
                  </Text>
                  <Text style={styles.browseMeta}>View product</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => dismissBrowse(e.itemId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${e.name} from browsing history`}
                >
                  <Icon icon={icons.close} size={14} color={semanticColors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Order history</Text>
        <Text style={styles.sectionLead}>Upcoming and past orders</Text>
        {isGuest || !household?.id ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>Sign in to see your household orders.</Text>
            {isGuest ? (
              <TouchableOpacity style={styles.signInChip} onPress={signIn} accessibilityRole="button">
                <Text style={styles.signInChipText}>log in / create account</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : sessionLoading || ordersLoading ? (
          <ActivityIndicator color={semanticColors.brand} style={styles.spinner} />
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>
            No orders yet. Configure your box and check out from My Box.
          </Text>
        ) : (
          <View style={styles.orderGroups}>
            <OrderHistoryList
              orders={orders}
              filter="upcoming"
              sectionTitle="Upcoming"
              emptyHint="No upcoming orders."
            />
            <OrderHistoryList
              orders={orders}
              filter="past"
              sectionTitle="Past"
              emptyHint="No past orders yet."
            />
          </View>
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <WebContentPanel
        flush={isDesktop}
        gutter={!isDesktop}
        centerDesktop={isDesktop}
        omitDesktopTopPadding={isDesktop}
        style={styles.panel}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isDesktop ? (
            <View style={[styles.contentColumn, { maxWidth: layoutWidth }]}>{body}</View>
          ) : (
            body
          )}
        </ScrollView>
      </WebContentPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  panel: { flex: 1, width: '100%', backgroundColor: semanticColors.bgPrimary },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary, width: '100%' },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  contentColumn: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
  },
  back: { marginBottom: spacing.md },
  backText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
  },
  title: {
    ...typeface('bold'),
    fontSize: 26,
    marginBottom: spacing.sm,
    color: semanticColors.textPrimary,
  },
  lead: {
    ...typeface('regular'),
    fontSize: typography.lg,
    lineHeight: 22,
    color: semanticColors.textSecondary,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xxl,
    gap: spacing.xs,
  },
  sectionHeading: {
    ...typeface('bold'),
    fontSize: typography.xl,
    color: semanticColors.textPrimary,
  },
  sectionLead: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyBlock: { gap: spacing.sm, alignItems: 'flex-start' },
  emptyText: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textTertiary,
    lineHeight: 20,
  },
  signInChip: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: semanticColors.brand,
  },
  signInChipText: {
    ...typeface('medium'),
    color: semanticColors.brand,
    fontSize: typography.sm,
  },
  spinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  list: { gap: spacing.xs },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chatRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    minWidth: 0,
  },
  chatCopy: { flex: 1, minWidth: 0, gap: 2 },
  chatTitle: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.textPrimary,
  },
  chatPreview: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    lineHeight: 18,
  },
  chatDate: {
    ...typeface('regular'),
    fontSize: typography.xs,
    color: semanticColors.textTertiary,
    marginTop: 2,
  },
  archiveBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  archiveBtnText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  browseMain: { flex: 1, minWidth: 0, gap: 2 },
  browseName: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.textPrimary,
  },
  browseMeta: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
  dismissBtn: {
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderGroups: { gap: spacing.lg },
});
