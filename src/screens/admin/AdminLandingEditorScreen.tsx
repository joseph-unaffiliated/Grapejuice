import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isAdminEmail } from '../../constants/admin';
import {
  landingAudienceById,
  type LandingCta,
  type LandingCtaAction,
  type LandingCtaStyle,
} from '../../constants/landingAudiences';
import {
  LANDING_MEDIA_LIBRARY,
  landingMediaLabel,
  landingMediaSource,
} from '../../constants/landingMediaLibrary';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import { RAV_TYPEWRITER_PROMPTS } from '../../constants/ravStarterPrompts';
import {
  ASK_RAV_DEFAULT_BODY,
  ASK_RAV_DEFAULT_EYEBROW,
  ASK_RAV_DEFAULT_HEADLINE,
  ASK_RAV_DEFAULT_PLACEHOLDER,
} from '../../components/storefront/StorefrontAskRavStrip';
import {
  hydrateLandingConfig,
  landingsService,
  serializeLandingConfig,
  type StoredLandingDoc,
  type StoredLandingSection,
} from '../../services/firestore/landings';
import { invalidateLandingCatalog, isCodeSeedLandingId } from '../../services/landingCatalog';
import { LandingComposeView } from '../../components/landing/LandingComposeView';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius, semanticColors } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';
import { navigateToLanding } from '../../navigation/mainStackNavigation';

type Nav = StackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'AdminLandingEditor'>;

const SECTION_TYPES: StoredLandingSection['type'][] = [
  'hero',
  'story',
  'categories',
  'products',
  'ask_rav',
  'cta_row',
];

const CTA_STYLES: LandingCtaStyle[] = ['primary', 'secondary', 'secondaryLight', 'escape'];

const SECTION_LABELS: Record<StoredLandingSection['type'], string> = {
  hero: 'Hero',
  story: 'Story band',
  categories: 'Shop aisles',
  products: 'Product grid',
  ask_rav: 'Ask Rav',
  cta_row: 'CTA row',
};

function newSectionKey(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankSection(type: StoredLandingSection['type']): StoredLandingSection {
  switch (type) {
    case 'hero':
      return {
        type: 'hero',
        slot: {
          id: `hero-${Date.now()}`,
          kind: 'image',
          aspect: '3/2',
          label: 'Hero',
          headline: 'New headline',
          body: 'Supporting copy.',
          imageKey: 'familysplash2',
        },
        ctas: [
          { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' },
        ],
      };
    case 'story':
      return {
        type: 'story',
        heading: 'New story heading',
        body: 'Story body copy.',
        imageKey: 'setthetablev1',
      };
    case 'categories':
      return {
        type: 'categories',
        heading: 'Shop by aisle',
        body: 'Browse a filtered collection.',
      };
    case 'products':
      return {
        type: 'products',
        heading: 'Featured pieces',
        body: '',
        category: 'toys',
        limit: 6,
      };
    case 'cta_row':
      return {
        type: 'cta_row',
        ctas: [{ label: 'Explore the store', action: { type: 'store' }, style: 'escape' }],
      };
    case 'ask_rav':
      return {
        type: 'ask_rav',
        eyebrow: ASK_RAV_DEFAULT_EYEBROW,
        headline: ASK_RAV_DEFAULT_HEADLINE,
        body: ASK_RAV_DEFAULT_BODY,
        placeholder: ASK_RAV_DEFAULT_PLACEHOLDER,
        prompts: [...RAV_TYPEWRITER_PROMPTS],
      };
  }
}

function defaultCta(): LandingCta {
  return { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' };
}

/** Edit one marketing landing: add/remove/reorder sections + copy/images. */
export function AdminLandingEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const audienceId = route.params.audienceId;
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const { width: windowWidth } = useWindowDimensions();
  const showLivePreview = windowWidth >= 1100;
  const styles = useMemo(
    () => createStyles(colors, isDesktop, showLivePreview),
    [colors, isDesktop, showLivePreview]
  );
  const user = useAuthStore((s) => s.user);
  const allowed = isAdminEmail(user?.email);

  const codeConfig = landingAudienceById(audienceId);
  const isSeed = isCodeSeedLandingId(audienceId);
  const [doc, setDoc] = useState<StoredLandingDoc | null>(null);
  const deferredDoc = useDeferredValue(doc);
  const livePreviewConfig = useMemo(() => {
    if (!deferredDoc) return null;
    try {
      return hydrateLandingConfig(deferredDoc, audienceId);
    } catch {
      return null;
    }
  }, [deferredDoc, audienceId]);
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sectionKeys, setSectionKeys] = useState<string[]>([]);
  /** Index of the row being dragged (fixed until drop). */
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  /** Slot the dragged row would occupy if dropped now. */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Pointer delta — kept in state so React can style; also written live to DOM for smoothness. */
  const [dragDeltaY, setDragDeltaY] = useState(0);

  const draggingIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const dragDeltaYRef = useRef(0);
  const dragStartClientYRef = useRef(0);
  const dragLayoutsRef = useRef<Array<{ top: number; height: number; mid: number }>>([]);
  const dragGapRef = useRef(8);
  const cardRefs = useRef<Array<View | null>>([]);
  const reorderSectionsRef = useRef<(from: number, to: number) => void>(() => {});
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: () => void;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Snapshot of a section when Edit opens — Cancel restores it. */
  const editSnapshotRef = useRef<StoredLandingSection | null>(null);

  const applyLoadedDoc = useCallback((next: StoredLandingDoc, override: boolean) => {
    setDoc(next);
    setSectionKeys(next.sections.map(() => newSectionKey()));
    setHasOverride(override);
    setExpanded(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await landingsService.getById(audienceId);
      if (stored?.sections?.length) {
        applyLoadedDoc(stored, true);
      } else if (codeConfig) {
        applyLoadedDoc(serializeLandingConfig(codeConfig), false);
      } else {
        setDoc(null);
        setError('Landing not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      if (codeConfig) applyLoadedDoc(serializeLandingConfig(codeConfig), false);
    } finally {
      setLoading(false);
    }
  }, [audienceId, codeConfig, applyLoadedDoc]);

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed, load]);

  const updateSection = (index: number, next: StoredLandingSection) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[index] = next;
      return { ...prev, sections };
    });
  };

  const reorderSections = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setDoc((prev) => {
      if (!prev) return prev;
      if (to >= prev.sections.length) return prev;
      const sections = [...prev.sections];
      const [item] = sections.splice(from, 1);
      sections.splice(to, 0, item);
      return { ...prev, sections };
    });
    setSectionKeys((prev) => {
      if (to >= prev.length) return prev;
      const keys = [...prev];
      const [key] = keys.splice(from, 1);
      keys.splice(to, 0, key);
      return keys;
    });
    setExpanded((cur) => {
      if (cur == null) return cur;
      if (cur === from) return to;
      if (from < to && cur > from && cur <= to) return cur - 1;
      if (from > to && cur >= to && cur < from) return cur + 1;
      return cur;
    });
  }, []);

  reorderSectionsRef.current = reorderSections;

  const clearDragListeners = useCallback(() => {
    if (dragListenersRef.current && typeof window !== 'undefined') {
      window.removeEventListener('pointermove', dragListenersRef.current.move);
      window.removeEventListener('pointerup', dragListenersRef.current.up);
      window.removeEventListener('pointercancel', dragListenersRef.current.up);
      dragListenersRef.current = null;
    }
    if (rafRef.current != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (settleTimeoutRef.current != null) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }, []);

  const endSectionDrag = useCallback(
    (commit: boolean) => {
      const from = draggingIndexRef.current;
      const to = hoverIndexRef.current;
      clearDragListeners();

      if (typeof document !== 'undefined') {
        document.querySelectorAll<HTMLElement>('[data-gj-section-card]').forEach((node) => {
          node.style.transform = '';
          node.style.transition = '';
          node.style.zIndex = '';
        });
      }

      if (commit && from != null && to != null && from !== to) {
        reorderSectionsRef.current(from, to);
      }

      draggingIndexRef.current = null;
      hoverIndexRef.current = null;
      dragDeltaYRef.current = 0;
      dragLayoutsRef.current = [];
      setDraggingIndex(null);
      setHoverIndex(null);
      setDragDeltaY(0);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    },
    [clearDragListeners],
  );

  const hoverIndexFromY = useCallback((clientY: number): number => {
    const layouts = dragLayoutsRef.current;
    if (!layouts.length) return draggingIndexRef.current ?? 0;
    // Compare against original (pre-transform) midpoints so hit-testing stays stable.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < layouts.length; i++) {
      const dist = Math.abs(clientY - layouts[i].mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }, []);

  const applyDraggedTransform = useCallback((dy: number, animate = false) => {
    const from = draggingIndexRef.current;
    if (from == null || typeof document === 'undefined') return;
    const node = document.querySelector<HTMLElement>(`[data-gj-section-card="${from}"]`);
    if (node) {
      node.style.transition = animate
        ? 'transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)'
        : 'none';
      node.style.transform = `translateY(${dy}px)`;
      node.style.zIndex = '20';
    }
  }, []);

  const startSectionDrag = useCallback(
    (index: number, clientY: number) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
        return;
      }

      clearDragListeners();

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('[data-gj-section-card]'),
      ).sort(
        (a, b) => Number(a.dataset.gjSectionCard) - Number(b.dataset.gjSectionCard),
      );

      const layouts = nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, height: r.height, mid: r.top + r.height / 2 };
      });
      if (!layouts.length || !layouts[index]) return;

      // Infer vertical gap from adjacent cards when possible
      if (layouts.length >= 2) {
        const gap = Math.max(0, layouts[1].top - (layouts[0].top + layouts[0].height));
        dragGapRef.current = gap || 8;
      }

      dragLayoutsRef.current = layouts;
      dragStartClientYRef.current = clientY;
      dragDeltaYRef.current = 0;
      draggingIndexRef.current = index;
      hoverIndexRef.current = index;

      setDraggingIndex(index);
      setHoverIndex(index);
      setDragDeltaY(0);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';

      const onMove = (e: PointerEvent) => {
        const from = draggingIndexRef.current;
        if (from == null) return;
        const dy = e.clientY - dragStartClientYRef.current;
        dragDeltaYRef.current = dy;
        applyDraggedTransform(dy);

        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setDragDeltaY(dragDeltaYRef.current);
          });
        }

        const nextHover = hoverIndexFromY(e.clientY);
        if (nextHover !== hoverIndexRef.current) {
          hoverIndexRef.current = nextHover;
          setHoverIndex(nextHover);
        }
      };

      const onUp = () => {
        // Stop tracking immediately; settle animation may still run.
        if (dragListenersRef.current) {
          window.removeEventListener('pointermove', dragListenersRef.current.move);
          window.removeEventListener('pointerup', dragListenersRef.current.up);
          window.removeEventListener('pointercancel', dragListenersRef.current.up);
          dragListenersRef.current = null;
        }

        const from = draggingIndexRef.current;
        const to = hoverIndexRef.current;
        const layouts = dragLayoutsRef.current;
        if (from != null && to != null && layouts[from] && layouts[to] && from !== to) {
          const ideal = layouts[to].top - layouts[from].top;
          dragDeltaYRef.current = ideal;
          applyDraggedTransform(ideal, true);
          setDragDeltaY(ideal);
          settleTimeoutRef.current = setTimeout(() => {
            settleTimeoutRef.current = null;
            endSectionDrag(true);
          }, 170);
          return;
        }
        endSectionDrag(true);
      };

      dragListenersRef.current = { move: onMove, up: onUp };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [applyDraggedTransform, clearDragListeners, endSectionDrag, hoverIndexFromY],
  );

  useEffect(
    () => () => {
      clearDragListeners();
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    },
    [clearDragListeners],
  );

  const shiftForIndex = (index: number): number => {
    if (draggingIndex == null || hoverIndex == null || draggingIndex === hoverIndex) return 0;
    if (index === draggingIndex) return 0;
    const height = dragLayoutsRef.current[draggingIndex]?.height ?? 56;
    const step = height + dragGapRef.current;
    if (draggingIndex < hoverIndex && index > draggingIndex && index <= hoverIndex) {
      return -step;
    }
    if (draggingIndex > hoverIndex && index >= hoverIndex && index < draggingIndex) {
      return step;
    }
    return 0;
  };

  const removeSection = (index: number) => {
    const label =
      doc?.sections[index] != null
        ? SECTION_LABELS[doc.sections[index].type]
        : 'this section';
    const run = () => {
      setDoc((prev) => {
        if (!prev) return prev;
        return { ...prev, sections: prev.sections.filter((_, i) => i !== index) };
      });
      setSectionKeys((prev) => prev.filter((_, i) => i !== index));
      if (expanded === index) {
        editSnapshotRef.current = null;
      }
      setExpanded((cur) => {
        if (cur == null) return cur;
        if (cur === index) return null;
        if (cur > index) return cur - 1;
        return cur;
      });
    };
    const title = 'Remove section?';
    const body = `Delete “${label}” from this page? You still need to Save override to publish.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) run();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  const beginEditSection = (index: number) => {
    if (!doc?.sections[index]) return;
    if (expanded != null && expanded !== index && editSnapshotRef.current != null) {
      // Another section is mid-edit — revert it first.
      const revertIndex = expanded;
      const snap = editSnapshotRef.current;
      setDoc((prev) => {
        if (!prev || !snap) return prev;
        const sections = [...prev.sections];
        if (sections[revertIndex]) sections[revertIndex] = snap;
        return { ...prev, sections };
      });
    }
    editSnapshotRef.current = JSON.parse(JSON.stringify(doc.sections[index])) as StoredLandingSection;
    setExpanded(index);
  };

  const saveSectionEdit = () => {
    editSnapshotRef.current = null;
    setExpanded(null);
  };

  const cancelSectionEdit = () => {
    const snap = editSnapshotRef.current;
    const idx = expanded;
    if (snap != null && idx != null) {
      setDoc((prev) => {
        if (!prev) return prev;
        const sections = [...prev.sections];
        if (sections[idx]) sections[idx] = snap;
        return { ...prev, sections };
      });
    }
    editSnapshotRef.current = null;
    setExpanded(null);
  };

  const addSection = (type: StoredLandingSection['type']) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: [...prev.sections, blankSection(type)] };
    });
    setSectionKeys((prev) => [...prev, newSectionKey()]);
  };

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const saved = await landingsService.upsert({
        ...doc,
        id: audienceId,
        navLabel: doc.navLabel.trim() || audienceId,
        path: doc.path.trim() || codeConfig?.path || `/${audienceId}`,
      });
      setDoc(saved);
      setHasOverride(true);
      invalidateLandingCatalog();
      setSaveNotice('Saved. Live page will use this override.');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Landing saved. Storefront will use this override.');
      } else {
        Alert.alert('Saved', 'Landing override written to Firestore.');
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Save failed';
      setError(message);
      setSaveNotice(null);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Save failed:\n\n${message}`);
      } else {
        Alert.alert('Save failed', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const resetToCode = () => {
    if (!isSeed || !codeConfig) return;
    const run = async () => {
      setSaving(true);
      try {
        await landingsService.remove(audienceId);
        invalidateLandingCatalog();
        applyLoadedDoc(serializeLandingConfig(codeConfig), false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reset failed');
      } finally {
        setSaving(false);
      }
    };
    const title = 'Reset to code defaults?';
    const body = 'Deletes the Firestore override for this landing.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${body}`)) void run();
      return;
    }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const preview = () => {
    navigateToLanding(audienceId);
  };

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <Text style={styles.deniedTitle}>Admin only</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>← Back</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
    );
  }

  return (
    <WebContentPanel
      flush={isDesktop}
      centerDesktop={isDesktop}
      omitDesktopTopPadding={isDesktop}
      style={styles.panel}
    >
      <View style={styles.root}>
        <View style={styles.workspace}>
          <View style={styles.editorColumn}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backLink}>← Landings</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{doc?.navLabel || codeConfig?.navLabel || audienceId}</Text>
            <Text style={styles.sub}>
              {isSeed
                ? hasOverride
                  ? 'Editing CMS override'
                  : 'Editing code defaults (save to publish override)'
                : 'CMS-only landing (Firestore)'}
              {doc?.updatedAt ? ` · ${doc.updatedAt.slice(0, 16)}` : ''}
            </Text>

            {loading || !doc ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
            ) : (
              <ScrollView
                style={styles.editorScroll}
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={draggingIndex == null}
              >
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Text style={styles.label}>Nav label</Text>
                <TextInput
                  style={styles.input}
                  value={doc.navLabel}
                  onChangeText={(navLabel) => setDoc({ ...doc, navLabel })}
                />
                <Text style={styles.label}>Path</Text>
                <TextInput
                  style={styles.input}
                  value={doc.path}
                  onChangeText={(path) => setDoc({ ...doc, path })}
                  autoCapitalize="none"
                />
                <Text style={styles.label}>UTM campaigns (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={doc.utmCampaigns.join(', ')}
                  onChangeText={(text) =>
                    setDoc({
                      ...doc,
                      utmCampaigns: text
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  autoCapitalize="none"
                />

                <Text style={styles.sectionTitle}>Sections</Text>
                <Text style={styles.hint}>
                  Grab the grip — the row follows your pointer; others ease out of the way.
                </Text>
                {doc.sections.map((section, index) => {
                  const open = expanded === index;
                  const key = sectionKeys[index] ?? `${section.type}-${index}`;
                  const dragging = draggingIndex === index;
                  const shiftY = dragging ? dragDeltaY : shiftForIndex(index);
                  return (
                    <View
                      key={key}
                      ref={(el) => {
                        cardRefs.current[index] = el;
                      }}
                      // @ts-expect-error RN web data attributes
                      dataSet={{ gjSectionCard: String(index) }}
                      {...(Platform.OS === 'web'
                        ? { 'data-gj-section-card': String(index) }
                        : {})}
                      style={[
                        styles.sectionCard,
                        open && styles.sectionCardOpen,
                        dragging && styles.sectionCardDragging,
                        Platform.OS === 'web'
                          ? ({
                              transform: [{ translateY: shiftY }],
                              transition: dragging
                                ? 'box-shadow 120ms ease, opacity 120ms ease'
                                : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 120ms ease',
                              zIndex: dragging ? 20 : 1,
                              position: 'relative' as const,
                            } as object)
                          : null,
                      ]}
                    >
                      <View style={styles.sectionHeaderRow}>
                        <View
                          style={[styles.grip, dragging && styles.gripActive]}
                          {...(Platform.OS === 'web'
                            ? {
                                onMouseDown: (e: {
                                  clientY: number;
                                  preventDefault?: () => void;
                                  stopPropagation?: () => void;
                                }) => {
                                  e.preventDefault?.();
                                  e.stopPropagation?.();
                                  startSectionDrag(index, e.clientY);
                                },
                              }
                            : {
                                onStartShouldSetResponder: () => true,
                                onMoveShouldSetResponder: () => true,
                                onResponderTerminationRequest: () => false,
                                onResponderGrant: (e: {
                                  nativeEvent: { pageY?: number; clientY?: number };
                                }) => {
                                  startSectionDrag(
                                    index,
                                    e.nativeEvent.pageY ?? e.nativeEvent.clientY ?? 0,
                                  );
                                },
                              })}
                          accessibilityRole="button"
                          accessibilityLabel={`Drag to reorder ${SECTION_LABELS[section.type]}`}
                        >
                          <Icon
                            icon={icons.grip}
                            size={14}
                            color={dragging ? semanticColors.logoDark : semanticColors.goldMuted}
                          />
                        </View>
                        <View style={styles.sectionHeaderCopy}>
                          <Text style={styles.sectionHeaderText}>
                            {index + 1}. {SECTION_LABELS[section.type]}
                          </Text>
                          <Text style={styles.sectionHeaderMeta}>{section.type}</Text>
                        </View>
                        {open ? (
                          <>
                            <TouchableOpacity
                              style={styles.iconBtn}
                              onPress={cancelSectionEdit}
                              accessibilityRole="button"
                              accessibilityLabel="Cancel section edits"
                              disabled={draggingIndex != null}
                            >
                              <Text style={styles.iconBtnLabel}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.iconBtn, styles.iconBtnActive]}
                              onPress={saveSectionEdit}
                              accessibilityRole="button"
                              accessibilityLabel="Save section edits"
                              disabled={draggingIndex != null}
                            >
                              <Text style={[styles.iconBtnLabel, styles.iconBtnLabelActive]}>
                                Save
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity
                              style={styles.iconBtn}
                              onPress={() => beginEditSection(index)}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${SECTION_LABELS[section.type]}`}
                              disabled={draggingIndex != null}
                            >
                              <Icon
                                icon={icons.pen}
                                size={13}
                                color={semanticColors.goldMuted}
                              />
                              <Text style={styles.iconBtnLabel}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconBtnDanger}
                              onPress={() => removeSection(index)}
                              accessibilityRole="button"
                              accessibilityLabel="Remove section"
                              disabled={draggingIndex != null}
                            >
                              <Icon icon={icons.trash} size={13} color={semanticColors.goldMuted} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                      {open ? (
                        <SectionEditor
                          section={section}
                          onChange={(next) => updateSection(index, next)}
                          styles={styles}
                        />
                      ) : null}
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>Add section</Text>
                <View style={styles.addRow}>
                  {SECTION_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={styles.addChip}
                      onPress={() => addSection(type)}
                    >
                      <Text style={styles.addChipText}>+ {type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, saving && styles.btnDisabled]}
                    onPress={() => void save()}
                    disabled={saving}
                  >
                    <Text style={styles.primaryBtnText}>
                      {saving ? 'Saving…' : 'Save override'}
                    </Text>
                  </TouchableOpacity>
                  {saveNotice ? <Text style={styles.saveOk}>{saveNotice}</Text> : null}
                  {error ? <Text style={styles.saveErr}>{error}</Text> : null}
                  <TouchableOpacity style={styles.secondaryBtn} onPress={preview}>
                    <Text style={styles.secondaryBtnText}>Open live page</Text>
                  </TouchableOpacity>
                  {hasOverride && isSeed ? (
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={resetToCode}
                      disabled={saving}
                    >
                      <Text style={[styles.secondaryBtnText, styles.danger]}>Reset to code</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {!showLivePreview && livePreviewConfig ? (
                  <View style={styles.mobilePreviewBlock}>
                    <Text style={styles.previewEyebrow}>Preview</Text>
                    <Text style={styles.previewBadge}>Composed page · live unsaved</Text>
                    <View pointerEvents="none" style={styles.mobilePreviewFrame}>
                      <LandingComposeView config={livePreviewConfig} forceCompact />
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>

          {showLivePreview ? (
            <View style={styles.previewShell}>
              <View style={styles.previewColumn}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewEyebrow}>Preview</Text>
                  <Text style={styles.previewTitle}>Composed page</Text>
                  <Text style={styles.previewHint}>Live · unsaved changes appear here</Text>
                </View>
                <ScrollView
                  style={styles.previewScroll}
                  contentContainerStyle={styles.previewScrollContent}
                >
                  {livePreviewConfig ? (
                    <View pointerEvents="none" style={styles.previewFrame}>
                      <LandingComposeView config={livePreviewConfig} forceCompact />
                    </View>
                  ) : (
                    <Text style={styles.previewEmpty}>Loading preview…</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </WebContentPanel>
  );
}

function SectionEditor({
  section,
  onChange,
  styles,
}: {
  section: StoredLandingSection;
  onChange: (next: StoredLandingSection) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  switch (section.type) {
    case 'hero':
      return (
        <View style={styles.editorBody}>
          <Text style={styles.label}>Headline</Text>
          <TextInput
            style={styles.input}
            value={section.slot.headline ?? ''}
            onChangeText={(headline) =>
              onChange({ ...section, slot: { ...section.slot, headline } })
            }
          />
          <Text style={styles.label}>Body</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={section.slot.body ?? ''}
            onChangeText={(body) => onChange({ ...section, slot: { ...section.slot, body } })}
          />
          <ImagePicker
            label="Hero image"
            value={section.slot.imageKey}
            onChange={(imageKey) => onChange({ ...section, slot: { ...section.slot, imageKey } })}
            styles={styles}
          />
          <CtaListEditor
            ctas={section.ctas}
            onChange={(ctas) => onChange({ ...section, ctas })}
            styles={styles}
          />
        </View>
      );
    case 'story':
      return (
        <View style={styles.editorBody}>
          <Text style={styles.label}>Heading</Text>
          <TextInput
            style={styles.input}
            value={section.heading}
            onChangeText={(heading) => onChange({ ...section, heading })}
          />
          <Text style={styles.label}>Body</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={section.body}
            onChangeText={(body) => onChange({ ...section, body })}
          />
          <ImagePicker
            label="Story image"
            value={section.imageKey}
            onChange={(imageKey) => onChange({ ...section, imageKey })}
            styles={styles}
          />
        </View>
      );
    case 'categories':
      return (
        <View style={styles.editorBody}>
          <Text style={styles.label}>Heading</Text>
          <TextInput
            style={styles.input}
            value={section.heading ?? ''}
            onChangeText={(heading) => onChange({ ...section, heading })}
          />
          <Text style={styles.label}>Body</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={section.body ?? ''}
            onChangeText={(body) => onChange({ ...section, body })}
          />
          <Text style={styles.hint}>Aisle cards use shared defaults unless customized later.</Text>
        </View>
      );
    case 'products':
      return (
        <View style={styles.editorBody}>
          <Text style={styles.label}>Heading</Text>
          <TextInput
            style={styles.input}
            value={section.heading}
            onChangeText={(heading) => onChange({ ...section, heading })}
          />
          <Text style={styles.label}>Body</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={section.body ?? ''}
            onChangeText={(body) => onChange({ ...section, body })}
          />
          <Text style={styles.label}>Store aisle</Text>
          <Text style={styles.hint}>
            Same filters as the store category pages. Pick an aisle to fill the grid.
          </Text>
          <View style={styles.addRow}>
            <TouchableOpacity
              style={[styles.addChip, !section.category && styles.addChipOn]}
              onPress={() =>
                onChange({
                  ...section,
                  category: undefined,
                  productIds: undefined,
                })
              }
            >
              <Text style={[styles.addChipText, !section.category && styles.addChipTextOn]}>
                Most loved
              </Text>
            </TouchableOpacity>
            {STOREFRONT_CATEGORIES.map((cat) => {
              const selected = section.category === cat.slug;
              return (
                <TouchableOpacity
                  key={cat.slug}
                  style={[styles.addChip, selected && styles.addChipOn]}
                  onPress={() =>
                    onChange({
                      ...section,
                      category: cat.slug,
                      productIds: undefined,
                    })
                  }
                >
                  <Text style={[styles.addChipText, selected && styles.addChipTextOn]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.label}>How many to show</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(section.limit ?? 6)}
            onChangeText={(text) => {
              const n = parseInt(text.replace(/\D/g, ''), 10);
              onChange({
                ...section,
                limit: Number.isFinite(n) && n > 0 ? Math.min(24, n) : 6,
              });
            }}
          />
        </View>
      );
    case 'cta_row':
      return (
        <View style={styles.editorBody}>
          <CtaListEditor
            ctas={section.ctas}
            onChange={(ctas) => onChange({ ...section, ctas })}
            styles={styles}
          />
        </View>
      );
    case 'ask_rav': {
      const prompts =
        section.prompts !== undefined ? section.prompts : [...RAV_TYPEWRITER_PROMPTS];
      return (
        <View style={styles.editorBody}>
          <Text style={styles.label}>Eyebrow</Text>
          <TextInput
            style={styles.input}
            value={section.eyebrow ?? ''}
            onChangeText={(eyebrow) => onChange({ ...section, eyebrow })}
            placeholder={ASK_RAV_DEFAULT_EYEBROW}
          />
          <Text style={styles.label}>Headline</Text>
          <TextInput
            style={styles.input}
            value={section.headline ?? ''}
            onChangeText={(headline) => onChange({ ...section, headline })}
            placeholder={ASK_RAV_DEFAULT_HEADLINE}
          />
          <Text style={styles.label}>Body</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={section.body ?? ''}
            onChangeText={(body) => onChange({ ...section, body })}
            placeholder={ASK_RAV_DEFAULT_BODY}
          />
          <Text style={styles.label}>Input placeholder</Text>
          <TextInput
            style={styles.input}
            value={section.placeholder ?? ''}
            onChangeText={(placeholder) => onChange({ ...section, placeholder })}
            placeholder={ASK_RAV_DEFAULT_PLACEHOLDER}
          />
          <Text style={styles.label}>Autoplay prompts</Text>
          <Text style={styles.hint}>
            These rotate in the search pill. Remove all to disable autoplay (static placeholder
            only).
          </Text>
          {prompts.length === 0 ? (
            <Text style={styles.hint}>Autoplay off — only the placeholder shows.</Text>
          ) : null}
          {prompts.map((prompt, index) => (
            <View key={`prompt-${index}`} style={styles.promptRow}>
              <TextInput
                style={[styles.input, styles.promptInput]}
                value={prompt}
                onChangeText={(text) => {
                  const next = [...prompts];
                  next[index] = text;
                  onChange({ ...section, prompts: next });
                }}
                placeholder="e.g. How do you play dreidel?"
              />
              <TouchableOpacity
                style={styles.iconBtnDanger}
                onPress={() => {
                  onChange({
                    ...section,
                    prompts: prompts.filter((_, i) => i !== index),
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove prompt"
              >
                <Icon icon={icons.trash} size={13} color={semanticColors.goldMuted} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => onChange({ ...section, prompts: [...prompts, ''] })}
            >
              <Text style={styles.addChipText}>+ Prompt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => onChange({ ...section, prompts: [...RAV_TYPEWRITER_PROMPTS] })}
            >
              <Text style={styles.addChipText}>Reset defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => onChange({ ...section, prompts: [] })}
            >
              <Text style={styles.addChipText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    default:
      return null;
  }
}

function ImagePicker({
  label,
  value,
  onChange,
  styles,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>Selected: {landingMediaLabel(value)}</Text>
      <Image source={landingMediaSource(value)} style={styles.imageThumb} resizeMode="cover" />
      <View style={styles.addRow}>
        {LANDING_MEDIA_LIBRARY.map((entry) => {
          const selected = entry.key === value;
          return (
            <TouchableOpacity
              key={entry.key}
              style={[styles.addChip, selected && styles.addChipOn]}
              onPress={() => onChange(entry.key)}
            >
              <Text style={[styles.addChipText, selected && styles.addChipTextOn]}>
                {entry.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CtaListEditor({
  ctas,
  onChange,
  styles,
}: {
  ctas: LandingCta[];
  onChange: (ctas: LandingCta[]) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const update = (index: number, patch: Partial<LandingCta> & { action?: LandingCtaAction }) => {
    const next = ctas.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>CTAs</Text>
      {ctas.map((cta, index) => (
        <View key={index} style={styles.ctaCard}>
          <TextInput
            style={styles.input}
            value={cta.label}
            onChangeText={(label) => update(index, { label })}
            placeholder="Label"
          />
          <View style={styles.addRow}>
            {(['start_box', 'store', 'store_category', 'gift_give'] as const).map((type) => {
              const on = cta.action.type === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.addChip, on && styles.addChipOn]}
                  onPress={() => {
                    let action: LandingCtaAction = { type: 'start_box' };
                    if (type === 'store') action = { type: 'store' };
                    if (type === 'store_category') {
                      action = { type: 'store_category', category: 'collection' };
                    }
                    if (type === 'gift_give') {
                      action = { type: 'gift_give', giftPath: 'customize' };
                    }
                    update(index, { action });
                  }}
                >
                  <Text style={[styles.addChipText, on && styles.addChipTextOn]}>{type}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {cta.action.type === 'store_category' ? (
            <TextInput
              style={styles.input}
              value={cta.action.category}
              onChangeText={(category) =>
                update(index, { action: { type: 'store_category', category } })
              }
              placeholder="Category slug"
              autoCapitalize="none"
            />
          ) : null}
          {cta.action.type === 'gift_give' ? (
            <View style={styles.addRow}>
              {(['customize', 'credit_only'] as const).map((giftPath) => {
                const on = cta.action.type === 'gift_give' && cta.action.giftPath === giftPath;
                return (
                  <TouchableOpacity
                    key={giftPath}
                    style={[styles.addChip, on && styles.addChipOn]}
                    onPress={() => update(index, { action: { type: 'gift_give', giftPath } })}
                  >
                    <Text style={[styles.addChipText, on && styles.addChipTextOn]}>{giftPath}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <View style={styles.addRow}>
            {CTA_STYLES.map((style) => {
              const on = (cta.style ?? 'primary') === style;
              return (
                <TouchableOpacity
                  key={style}
                  style={[styles.addChip, on && styles.addChipOn]}
                  onPress={() => update(index, { style })}
                >
                  <Text style={[styles.addChipText, on && styles.addChipTextOn]}>{style}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={() => onChange(ctas.filter((_, i) => i !== index))}
            hitSlop={8}
          >
            <Text style={[styles.toolLink, styles.danger]}>Remove CTA</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addChip} onPress={() => onChange([...ctas, defaultCta()])}>
        <Text style={styles.addChipText}>+ CTA</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean, showLivePreview: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, backgroundColor: colors.bgPrimary },
    root: { flex: 1, padding: showLivePreview ? spacing.md : spacing.lg },
    workspace: {
      flex: 1,
      flexDirection: showLivePreview ? 'row' : 'column',
      gap: spacing.md,
      minHeight: 0,
    },
    editorColumn: {
      flex: showLivePreview ? 0.42 : 1,
      maxWidth: showLivePreview ? undefined : isDesktop ? 720 : undefined,
      width: '100%',
      alignSelf: showLivePreview ? 'stretch' : 'center',
      minWidth: showLivePreview ? 360 : undefined,
      minHeight: 0,
    },
    editorScroll: { flex: 1, minHeight: 0 },
    previewShell: {
      flex: 0.58,
      minWidth: 0,
      minHeight: 0,
      padding: spacing.sm,
    },
    previewColumn: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      backgroundColor: colors.bgPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 12px 40px rgba(17, 2, 34, 0.16), 0 2px 8px rgba(17, 2, 34, 0.08)',
          } as object)
        : {
            shadowColor: '#110222',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.16,
            shadowRadius: 20,
            elevation: 10,
          }),
    },
    previewHeader: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.accentCream,
      gap: 2,
    },
    previewEyebrow: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.goldMuted,
    },
    previewTitle: {
      fontSize: typography.lg,
      fontWeight: '600',
      color: colors.logoDark,
      letterSpacing: -0.3,
    },
    previewHint: {
      fontSize: typography.sm,
      color: colors.goldMuted,
    },
    previewScroll: { flex: 1, minHeight: 0 },
    previewScrollContent: { paddingBottom: spacing.xl },
    previewFrame: {
      backgroundColor: colors.bgPrimary,
    },
    previewEmpty: {
      padding: spacing.lg,
      color: colors.goldMuted,
      fontSize: typography.md,
    },
    previewBadge: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.logoDark,
      marginBottom: spacing.sm,
    },
    mobilePreviewBlock: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.accentCream,
      ...(Platform.OS === 'web'
        ? ({ boxShadow: '0 8px 24px rgba(17, 2, 34, 0.12)' } as object)
        : {}),
    },
    mobilePreviewFrame: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      backgroundColor: colors.bgPrimary,
    },
    backLink: { fontSize: typography.md, color: colors.brand, marginBottom: spacing.sm },
    title: { fontSize: 24, fontWeight: '600', color: colors.logoDark, letterSpacing: -0.4 },
    sub: { fontSize: typography.md, color: colors.goldMuted, marginBottom: spacing.md, lineHeight: 22 },
    scroll: { gap: spacing.sm, paddingBottom: spacing.xxl },
    label: {
      fontSize: typography.sm,
      fontWeight: '500',
      color: colors.logoDark,
      marginTop: spacing.sm,
      marginBottom: 4,
    },
    hint: { fontSize: typography.sm, color: colors.goldMuted, marginBottom: spacing.xs },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: Platform.OS === 'web' ? 10 : spacing.sm,
      fontSize: typography.md,
      color: colors.logoDark,
      backgroundColor: colors.bgPrimary,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    sectionTitle: {
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
      fontSize: typography.lg,
      fontWeight: '600',
      color: colors.logoDark,
    },
    sectionCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
      gap: spacing.xs,
      backgroundColor: colors.bgPrimary,
      ...(Platform.OS === 'web' ? ({ transition: 'box-shadow 120ms ease, opacity 120ms ease' } as object) : {}),
    },
    sectionCardOpen: {
      borderColor: colors.brand,
      backgroundColor: colors.brandLight,
    },
    sectionCardDragging: {
      opacity: 0.95,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 14px 36px rgba(17, 2, 34, 0.22)',
            cursor: 'grabbing',
            willChange: 'transform',
          } as object)
        : {}),
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    grip: {
      width: 32,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgDark,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none' } as object) : {}),
    },
    gripActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
      ...(Platform.OS === 'web' ? ({ cursor: 'grabbing' } as object) : {}),
    },
    sectionHeaderCopy: { flex: 1, gap: 1, minWidth: 0 },
    sectionHeaderText: { fontSize: typography.md, fontWeight: '600', color: colors.logoDark },
    sectionHeaderMeta: { fontSize: 11, color: colors.goldMuted, letterSpacing: 0.2 },
    iconBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.bgPrimary,
    },
    iconBtnActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    iconBtnLabel: {
      fontSize: typography.sm,
      fontWeight: '500',
      color: colors.goldMuted,
    },
    iconBtnLabelActive: {
      color: colors.logoDark,
    },
    iconBtnDanger: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    toolLink: { fontSize: typography.sm, color: colors.brand },
    danger: { color: semanticColors.goldMuted },
    editorBody: { gap: 2, marginTop: spacing.sm },
    promptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    promptInput: {
      flex: 1,
    },
    addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    addChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    addChipOn: { backgroundColor: colors.logoDark, borderColor: colors.logoDark },
    addChipText: { fontSize: typography.sm, color: colors.logoDark },
    addChipTextOn: { color: colors.brand },
    imageThumb: {
      width: '100%',
      height: 120,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accentCream,
      marginBottom: spacing.xs,
    },
    ctaCard: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgDark,
    },
    actions: { marginTop: spacing.lg, gap: spacing.sm },
    primaryBtn: {
      backgroundColor: colors.brand,
      paddingVertical: 12,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    primaryBtnText: { fontWeight: '600', color: colors.logoDark, fontSize: typography.md },
    secondaryBtn: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 12,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    secondaryBtnText: { color: colors.logoDark, fontSize: typography.md },
    btnDisabled: { opacity: 0.6 },
    error: { color: colors.error, marginBottom: spacing.sm },
    saveOk: {
      fontSize: typography.md,
      color: colors.logoDark,
      fontWeight: '500',
    },
    saveErr: {
      fontSize: typography.md,
      color: colors.error,
      lineHeight: 20,
    },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    deniedTitle: { fontSize: 20, fontWeight: '600', color: colors.logoDark },
  });
}
