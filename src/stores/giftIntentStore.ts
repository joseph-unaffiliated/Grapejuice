import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem } from '../types/pilot';
import type { GiftChildDraft, GiftGiveFormValues, GiftPath } from '../screens/gift/giftGiveTypes';

export type GiftIntentKind = 'credit_only' | 'customize';

export type GiftIntentStatus = 'idle' | 'incomplete' | 'sent';

export type GiftIntentDraft = {
  form: GiftGiveFormValues;
  childDrafts: GiftChildDraft[];
  lineItems?: BoxLineItem[];
};

type GiftIntentState = {
  _hasHydrated: boolean;
  status: GiftIntentStatus;
  kind: GiftIntentKind | null;
  draft: GiftIntentDraft | null;
  /** Set when a gift payment succeeds. */
  lastRecipientEmail: string | null;
  lastSentAt: string | null;
  markIncomplete: (kind: GiftIntentKind, draft: GiftIntentDraft) => void;
  markSent: (recipientEmail: string, kind: GiftIntentKind) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
};

const initial = {
  status: 'idle' as GiftIntentStatus,
  kind: null as GiftIntentKind | null,
  draft: null as GiftIntentDraft | null,
  lastRecipientEmail: null as string | null,
  lastSentAt: null as string | null,
};

export const useGiftIntentStore = create<GiftIntentState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      ...initial,
      markIncomplete: (kind, draft) =>
        set({
          status: 'incomplete',
          kind,
          draft: {
            form: { ...draft.form, giftPath: kind },
            childDrafts: draft.childDrafts,
            lineItems: draft.lineItems,
          },
          lastRecipientEmail: null,
          lastSentAt: null,
        }),
      markSent: (recipientEmail, kind) =>
        set({
          status: 'sent',
          kind,
          draft: null,
          lastRecipientEmail: recipientEmail.trim(),
          lastSentAt: new Date().toISOString(),
        }),
      clear: () => set({ ...initial }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'gj.gift-intent',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        status: s.status,
        kind: s.kind,
        draft: s.draft,
        lastRecipientEmail: s.lastRecipientEmail,
        lastSentAt: s.lastSentAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function giftPathToKind(path: GiftPath): GiftIntentKind {
  return path === 'credit_only' ? 'credit_only' : 'customize';
}
