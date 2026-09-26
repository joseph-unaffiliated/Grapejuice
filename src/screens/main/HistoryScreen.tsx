import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  SystemChip,
  SystemPage,
  SystemPageSpinner,
  systemPageStyles as page,
} from '../../components/layout/SystemPage';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { useCatalog } from '../../hooks/useCatalog';
import type { MainStackParamList } from '../../navigation/types';
import { aiChatService } from '../../services/firestore/aiChat';
import { formatThreadListDate } from '../../services/hanukkah/dates';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useAuthStore } from '../../stores/authStore';
import { useBrowsingHistoryStore } from '../../stores/browsingHistoryStore';
import type { AIChatThreadSummary } from '../../types/aiChat';

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
  const user = useAuthStore((s) => s.user);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const { items: catalog } = useCatalog();
  const browsingEntries = useBrowsingHistoryStore((s) => s.entries);
  const dismissBrowse = useBrowsingHistoryStore((s) => s.dismiss);

  const [threads, setThreads] = useState<AIChatThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

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

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const browsingRows = useMemo(() => {
    return browsingEntries.map((e) => {
      const catalogItem = catalog.find((c) => c.id === e.itemId);
      return {
        ...e,
        name: catalogItem?.name?.trim() || e.name,
        imageUrl: catalogItem?.imageUrl,
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

  return (
    <SystemPage hub="history">
      <Text style={page.sectionLead}>Chats with Rav and pages you’ve browsed.</Text>

      <View style={page.section}>
        <Text style={page.sectionHeading}>Chat history</Text>
        <Text style={page.sectionLead}>Recent conversations with Rav</Text>
        {isGuest ? (
          <View style={styles.emptyBlock}>
            <Text style={page.emptyText}>Sign in to save and browse past Rav conversations.</Text>
            <SystemChip label="log in / create account" onPress={signIn} />
          </View>
        ) : threadsLoading ? (
          <SystemPageSpinner />
        ) : threads.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={page.emptyText}>No chats yet. Start a conversation with Rav.</Text>
            <SystemChip
              label="Open Rav"
              onPress={() => navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } })}
            />
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

      <View style={page.section}>
        <Text style={page.sectionHeading}>Browsing history</Text>
        <Text style={page.sectionLead}>Products you’ve viewed recently</Text>
        {browsingRows.length === 0 ? (
          <Text style={page.emptyText}>No browsing history yet. Open a product to start a trail.</Text>
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
                  <BoxItemImage size={56} itemId={e.itemId} imageUrl={e.imageUrl} />
                  <View style={styles.browseCopy}>
                    <Text style={styles.browseName} numberOfLines={2}>
                      {e.name}
                    </Text>
                    <Text style={styles.browseMeta}>View product</Text>
                  </View>
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
    </SystemPage>
  );
}

const styles = StyleSheet.create({
  emptyBlock: { alignItems: 'flex-start' },
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
  browseMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  browseCopy: { flex: 1, minWidth: 0, gap: 2 },
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
});
