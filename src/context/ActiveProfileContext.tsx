import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/authStore';
import { childrenService } from '../services/firestore/children';
import { PILOT_PARENT_ONLY } from '../constants/pilotFeatures';
import type { ActiveProfile, ChildProfile } from '../types/pilot';

const STORAGE_KEY = 'grapejuice_active_profile_v1';

type ActiveProfileContextValue = {
  activeProfile: ActiveProfile;
  children: ChildProfile[];
  activeChild: ChildProfile | null;
  isChildProfile: boolean;
  isParentProfile: boolean;
  ravEnabledForActiveChild: boolean;
  loading: boolean;
  enterParentProfile: () => Promise<void>;
  enterChildProfile: (childId: string) => Promise<void>;
  setChildRavEnabled: (childId: string, enabled: boolean) => Promise<void>;
  refreshChildren: () => Promise<void>;
};

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null);

function parseStored(raw: string | null): ActiveProfile {
  if (PILOT_PARENT_ONLY) return { type: 'parent' };
  if (!raw) return { type: 'parent' };
  try {
    const parsed = JSON.parse(raw) as ActiveProfile;
    if (parsed.type === 'child' && typeof parsed.childId === 'string') return parsed;
  } catch {
    /* ignore */
  }
  return { type: 'parent' };
}

export function ActiveProfileProvider({ children: node }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [activeProfile, setActiveProfile] = useState<ActiveProfile>({ type: 'parent' });
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      setActiveProfile(parseStored(raw));
      setHydrated(true);
    });
  }, []);

  const persistProfile = useCallback(async (next: ActiveProfile) => {
    const profile = PILOT_PARENT_ONLY ? ({ type: 'parent' } as const) : next;
    setActiveProfile(profile);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, []);

  const refreshChildren = useCallback(async () => {
    if (!user?.uid) {
      setChildren([]);
      return;
    }
    const list = await childrenService.list(user.uid);
    setChildren(list);
    if (activeProfile.type === 'child' && !list.some((c) => c.id === activeProfile.childId)) {
      await persistProfile({ type: 'parent' });
    }
  }, [user?.uid, activeProfile, persistProfile]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refreshChildren();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, refreshChildren, user?.uid]);

  const enterParentProfile = useCallback(async () => {
    await persistProfile({ type: 'parent' });
  }, [persistProfile]);

  const enterChildProfile = useCallback(
    async (childId: string) => {
      if (PILOT_PARENT_ONLY) return;
      await persistProfile({ type: 'child', childId });
    },
    [persistProfile]
  );

  const setChildRavEnabled = useCallback(
    async (childId: string, enabled: boolean) => {
      if (!user?.uid) return;
      await childrenService.updateRavEnabled(user.uid, childId, enabled);
      setChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, ravEnabled: enabled } : c)));
    },
    [user?.uid]
  );

  const activeChild = useMemo(() => {
    if (activeProfile.type !== 'child') return null;
    return children.find((c) => c.id === activeProfile.childId) ?? null;
  }, [activeProfile, children]);

  const value: ActiveProfileContextValue = {
    activeProfile,
    children,
    activeChild,
    isChildProfile: !PILOT_PARENT_ONLY && activeProfile.type === 'child',
    isParentProfile: PILOT_PARENT_ONLY || activeProfile.type === 'parent',
    ravEnabledForActiveChild: activeChild?.ravEnabled === true,
    loading: loading || !hydrated,
    enterParentProfile,
    enterChildProfile,
    setChildRavEnabled,
    refreshChildren,
  };

  return <ActiveProfileContext.Provider value={value}>{node}</ActiveProfileContext.Provider>;
}

export function useActiveProfile(): ActiveProfileContextValue {
  const ctx = useContext(ActiveProfileContext);
  if (!ctx) throw new Error('useActiveProfile requires ActiveProfileProvider');
  return ctx;
}

/** Display label for profile switcher chrome. */
export function profileDisplayName(
  activeProfile: ActiveProfile,
  parentName: string | null | undefined,
  activeChild: ChildProfile | null
): string {
  if (activeProfile.type === 'parent') return parentName?.trim() || 'Grown-up';
  return activeChild?.name?.trim() || 'Kid';
}
