import { create } from 'zustand';
import { useUserStatePreviewStore } from './userStatePreviewStore';
import { useEntryContextStore, type EntryUtm } from './entryContextStore';

export type MockFlowPersonaId = 'new_visitor' | 'signed_in_no_box' | 'gift_giver';

export type MockFlowPersona = {
  id: MockFlowPersonaId;
  label: string;
  description: string;
};

export const MOCK_FLOW_PERSONAS: MockFlowPersona[] = [
  {
    id: 'new_visitor',
    label: 'New visitor',
    description: 'Signed out, no box — typical ad click',
  },
  {
    id: 'signed_in_no_box',
    label: 'Signed in · no box',
    description: 'Account chrome, empty box state',
  },
  {
    id: 'gift_giver',
    label: 'Gift giver',
    description: 'Signed out visitor on a gift path',
  },
];

type RestoreSnapshot = {
  /** Admin email to prefill on Exit sign-in. */
  adminEmail: string | null;
  audienceId: string | null;
  sourcePath: string | null;
  utm: EntryUtm | null;
};

type MockFlowState = {
  active: boolean;
  landingId: string | null;
  landingLabel: string | null;
  personaId: MockFlowPersonaId | null;
  personaLabel: string | null;
  restore: RestoreSnapshot | null;
  /**
   * Enter visitor playthrough: snapshot admin email + entry, mark active.
   * Does not apply user-state overlays — caller signs out so routing is real guest.
   */
  enter: (input: {
    audienceId: string;
    landingLabel: string;
    sourcePath: string;
    adminEmail?: string | null;
    personaId?: MockFlowPersonaId;
  }) => void;
  /** Clear mock flow + overlays. Caller handles logout / guest reset. */
  exit: () => void;
};

function personaForLanding(
  audienceId: string,
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

/** `brendan@x.com` → `brendan+qa@x.com` for inbox-sharing tester signups. */
export function suggestPlusAlias(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const at = email.indexOf('@');
  const local = email.slice(0, at).trim();
  const domain = email.slice(at + 1).trim();
  if (!local || !domain) return null;
  const base = local.split('+')[0];
  if (!base) return null;
  return `${base}+qa@${domain}`;
}

/**
 * Admin “Test landings” visitor playthrough. Real guest session (admin is signed
 * out). Exit signs the tester out and prefills admin email on sign-in.
 */
export const useMockFlowStore = create<MockFlowState>((set, get) => ({
  active: false,
  landingId: null,
  landingLabel: null,
  personaId: null,
  personaLabel: null,
  restore: null,
  enter: ({ audienceId, landingLabel, sourcePath, adminEmail, personaId }) => {
    const previewStore = useUserStatePreviewStore.getState();
    const entryStore = useEntryContextStore.getState();
    const persona = personaForLanding(audienceId, personaId);

    const restore: RestoreSnapshot =
      get().active && get().restore
        ? {
            ...get().restore!,
            adminEmail: adminEmail ?? get().restore!.adminEmail,
          }
        : {
            adminEmail: adminEmail ?? null,
            audienceId: entryStore.audienceId,
            sourcePath: entryStore.sourcePath,
            utm: entryStore.utm,
          };

    previewStore.clearPreview();
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
    const previewStore = useUserStatePreviewStore.getState();
    const entryStore = useEntryContextStore.getState();
    previewStore.clearPreview();
    entryStore.clear();

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
