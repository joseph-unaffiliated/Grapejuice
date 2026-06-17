import { useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../constants/boxDisplaySections';
import { BOX_DETAIL_SCROLL_SPY_OFFSET } from '../components/box/boxDetailLayout';

export function useBoxDetailScroll(initialSection: BoxDisplaySectionId = 'candles') {
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const scrollingToSection = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSection, setActiveSection] = useState<BoxDisplaySectionId>(initialSection);

  const onSectionLayout = (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
    sectionOffsets.current[id] = e.nativeEvent.layout.y;
  };

  const updateActiveFromScroll = (scrollY: number) => {
    if (scrollingToSection.current) return;
    const probe = scrollY + BOX_DETAIL_SCROLL_SPY_OFFSET;
    let next: BoxDisplaySectionId = BOX_DISPLAY_SECTIONS[0].id;
    for (const { id } of BOX_DISPLAY_SECTIONS) {
      const y = sectionOffsets.current[id];
      if (y !== undefined && y <= probe) next = id;
    }
    setActiveSection((prev) => (prev === next ? prev : next));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateActiveFromScroll(e.nativeEvent.contentOffset.y);
  };

  const scrollToSection = (id: BoxDisplaySectionId) => {
    const y = sectionOffsets.current[id];
    if (y === undefined) return;
    setActiveSection(id);
    scrollingToSection.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      scrollingToSection.current = false;
    }, 450);
  };

  return {
    scrollRef,
    activeSection,
    onSectionLayout,
    onScroll,
    scrollToSection,
  };
}
