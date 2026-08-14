import { create } from 'zustand';
import type { LandingAudienceId } from '../constants/landingAudiences';
import {
  useUserStatePreviewStore,
  type UserStatePreview,
} from './userStatePreviewStore';
import { useEntryContextStore, type EntryUtm } from './entryContextStore';

export type MockFlowPersonaId = 'new_visitor' | 'signed_in_no_box' | 'gift_giver';

export type MockFlowPersona = {
  id: MockFlowPersonaId;
  label: string;
  description: string;
  /** User-state overlay applied while mock flow is active. */
  preview: UserStatePreview;
};

export const MOCK_FLOW_PERSONAS: MockFlowPersona[] = [
  {
    id: 'new_visitor',
    label: 'New visitor',
    description: 'Signed out, no box — typical ad click',
    preview: 'signed_out',
  },
  {
    id: 'signed_in_no_box',
    label: 'Signed in · no box',
    description: 'Account chrome, empty box state',
    preview: 'signed_in_no_box',
  },
  {
    id: 'gift_giver',
    label: 'Gift giver',
    description: 'Signed out visitor on a gift path',
    preview: 'signed_out',
  },
];

type RestoreSnapshot = {
  preview: UserStatePreview | null;
  previewNowIso: string | null;
  audienceId: LandingAudienceId | null;
  sourcePath: string | null;
  utm: EntryUtm | null;
};

type MockFlowState = {
  active: boolean;
  landingId: LandingAudienceId | null;
  landingLabel: string | null;
  personaId: MockFlowPersonaId | null;
  personaLabel: string | null;
  restore: RestoreSnapshot | null;
  /**
   * Enter mock flow: snapshot current overlays, apply persona + entry, mark active.
   * Caller navigates to the landing screen.
   */
  enter: (input: {
    audienceId: LandingAudienceId;
    landingLabel: string;
    sourcePath: string;
    personaId?: MockFlowPersonaId;
  }) => void;
  /** Restore prior overlays and clear mock flow. */
  exit: () => void;
};

function personaForLanding(
  audienceId: LandingAudienceId,
  preferred?: MockFlowPersonaId
): MockFlowPersona {
  if (preferred) {
    return MOCK_FLOW_PERSONAS.find((p) => p.id === preferred) ?? MOCK_FLOW_PERSONAS[0];
  }
  if (audienceId === 'gift') {
    return MOCK_FLOW_PERSONAS.find((p) => p.id === 'gift_giver') ?? MOCK_FLOW_PERSONAS[0];
  }
  return MOCK_FLOW_PERSONAS[0];
}

/**
 * Admin “Test landings” mock entry — overrides chrome/persona temporarily so you
 * can walk an ad visitor flow, then Exit restores your real account overlays.
 */
export const useMockFlowStore = create<MockFlowState>((set, get) => ({
  active: false,
  landingId: null,
  landingLabel: null,
  personaId: null,
  personaLabel: null,
  restore: null,
  enter: ({ audienceId, landingLabel, sourcePath, personaId }) => {
    const previewStore = useUserStatePreviewStore.getState();
    const entryStore = useEntryContextStore.getState();
    const persona = personaForLanding(audienceId, personaId);

    const restore: RestoreSnapshot = get().active && get().restore
      ? get().restore!
      : {
          preview: previewStore.preview,
          previewNowIso: previewStore.previewNowIso,
          audienceId: entryStore.audienceId,
          sourcePath: entryStore.sourcePath,
          utm: entryStore.utm,
        };

    previewStore.setPreview(persona.preview);
    entryStore.capture({
      audienceId,
      sourcePath,
      utm: {
        source: 'admin',
        medium: 'mock_flow',
        campaign: audienceId,
      },
    });

    set({
      active: true,
      landingId: audienceId,
      landingLabel,
      personaId: persona.id,
      personaLabel: persona.label,
      restore,
    });
  },
  exit: () => {
    const { restore } = get();
    const previewStore = useUserStatePreviewStore.getState();
    const entryStore = useEntryContextStore.getState();

    if (restore) {
      previewStore.setPreview(restore.preview);
      previewStore.setPreviewNowIso(restore.previewNowIso);
      if (restore.audienceId) {
        entryStore.capture({
          audienceId: restore.audienceId,
          sourcePath: restore.sourcePath,
          utm: restore.utm,
        });
      } else {
        entryStore.clear();
      }
    } else {
      previewStore.clearPreview();
      entryStore.clear();
    }

    set({
      active: false,
      landingId: null,
      landingLabel: null,
      personaId: null,
      personaLabel: null,
      restore: null,
    });
  },
}));
