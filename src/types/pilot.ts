export type BeamStatus = 'not_eligible' | 'eligible' | 'enrolled' | 'completed';

export type BeamMilestoneType = 'bat_mitzvah' | 'bar_mitzvah';

export type UpcomingBeamMilestone = {
  childId: string;
  childName: string;
  milestoneType: BeamMilestoneType;
  monthsUntil: number;
  triggeredAt: string;
};

export type ContentDepthLevel = 'introductory' | 'intermediate' | 'deep';

export type BeamContentCategory =
  | 'bible'
  | 'diaspora'
  | 'holocaust'
  | 'israel'
  | 'god'
  | 'culture';

export type RavMode = 'facilitator' | 'facilitator_kid' | 'personal_shopper' | 'project_partner';

export type SlotVoteEntry = {
  voterId: string;
  voterName: string;
  voterType: 'parent' | 'child';
  votedAt: string;
};

/** Per slot, per catalog item id → voters who thumbs-upped that option. */
export type SlotVotes = Record<string, Record<string, SlotVoteEntry[]>>;
export type AgeGroup = '0-2' | '3-5' | '6-8' | '9-12';
export type CatalogSlot = 'base' | 'story' | 'gift' | 'addon' | 'keepsake';
export type CatalogPricingTier = 'included' | 'perKid' | 'extra' | 'alaCarte';
export type AccountRole = 'parent' | 'child';
export type KeepOrToss = 'keep' | 'toss';

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: AccountRole;
  householdId: string | null;
  familiarityLevel?: FamiliarityLevel;
  onboardingComplete: boolean;
  boxRevealComplete?: boolean;
  notificationsOptIn?: boolean;
  phone?: string;
  smsOptIn?: boolean;
  lockReminderEligible?: boolean;
  lockReminderAttempts?: number;
  hiddenHolidays?: string[];
  collaborationName?: string;
  /** Set by nightly age-trigger function when a child approaches b-mitzvah age. */
  upcomingBeamMilestone?: UpcomingBeamMilestone | null;
  createdAt: string;
  updatedAt: string;
};

export type Household = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  childUserIds: string[];
  stripeCustomerId?: string;
  stripeDefaultPaymentMethodId?: string;
  /** ISO timestamp when a card was saved via SetupIntent. */
  cardOnFileAt?: string;
  /** Pre-paid gift balance in cents (grandparent gift path). */
  giftCreditCents?: number;
  /** Debrief / platform credits (e.g. $80 Passover incentive). */
  platformCreditCents?: number;
  createdAt: string;
  updatedAt: string;
};

export type ChildProfile = {
  id: string;
  name?: string;
  ageGroup: AgeGroup;
  /** ISO date YYYY-MM-DD — canonical; `birthday` is legacy alias. */
  birthdate?: string;
  /** @deprecated Use birthdate */
  birthday?: string;
  hebrewName?: string;
  barMitzvahDate?: string;
  beamStatus?: BeamStatus;
  /** Parent-controlled; enables kid-safe Rav tab when viewing this child's profile. */
  ravEnabled?: boolean;
};

export type CatalogCurationTag =
  | 'hanukkiah'
  | 'dreidel'
  | 'apparel'
  | 'decorations'
  | 'collection';

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  slot: CatalogSlot;
  slotId: string;
  ageGroups: AgeGroup[];
  defaultFor: AgeGroup[];
  swapOptions: string[];
  imageUrl?: string;
  dollarCostCents: number;
  /** When unset, inferred from slot in pricing.ts */
  pricingTier?: CatalogPricingTier;
  holiday: string;
  /** Home collection rails — from Firestore or catalogCuration fallback */
  curationTags?: CatalogCurationTag[];
  brand?: string;
};

/** Box journey on Home — derived from draft + order data */
export type BoxLifecycleStatus =
  | 'not_started'
  | 'customizing'
  | 'ordered'
  | 'shipped'
  | 'in_transit'
  | 'delivered';

export type DeliveryTimelineStep = {
  id: string;
  label: string;
  detail?: string;
  completed: boolean;
  active: boolean;
};

export type BoxLineItem = {
  slotId: string;
  itemId: string;
  quantity: number;
  unitCents: number;
  childId?: string;
  label?: string;
  keepOrToss?: KeepOrToss;
  isSurprise?: boolean;
};

export type BoxDraft = {
  holidayId: string;
  lineItems: BoxLineItem[];
  slotVotes?: SlotVotes;
  familiarityLevel?: FamiliarityLevel;
  updatedAt: string;
  updatedBy: string;
  lockedAt?: string | null;
  /** Research panel — reading, crafts, games, cooking */
  childInterests?: string[];
  /** Gift recipient "keep surprise" — disables swaps for these display sections until arrival. */
  sealedSectionIds?: Array<'candles' | 'dreidel' | 'food' | 'presents' | 'story'>;
};

export type ActiveProfile =
  | { type: 'parent' }
  | { type: 'child'; childId: string };

export type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: 'US' | 'CA' | 'OTHER';
};

export type PilotOrder = {
  id: string;
  status: 'pending' | 'committed' | 'confirmed' | 'shipped' | 'delivered';
  lineItems: BoxLineItem[];
  totalCents: number;
  shippingAddress: ShippingAddress;
  stripePaymentIntentId?: string;
  lockAt?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string;
  createdAt?: string;
  confirmedAt?: string;
};

export type HolidayCardStatus = 'active' | 'upcoming' | 'notify';

export type HolidayCard = {
  id: string;
  title: string;
  gregorianDateLabel: string;
  explainer: string;
  status: HolidayCardStatus;
  notifyOnly?: boolean;
};

export type RavBlock = {
  type: 'product' | 'curation' | 'swap';
  title: string;
  body?: string;
  itemId?: string;
  slotId?: string;
  swapOptions?: string[];
};

/** Server-suggested box draft mutations (applied client-side; never checkout). */
export type RavDraftAction = {
  type: 'swap' | 'add' | 'remove';
  itemId: string;
  slotId?: string;
  childId?: string;
};

export type PartnerInvite = {
  id: string;
  householdId: string;
  householdName: string;
  invitedEmail: string;
  invitedByUid: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  acceptedByUid?: string;
};

export type GiftInvite = {
  id: string;
  giverUid: string;
  giverName: string;
  giverEmail: string;
  recipientEmail: string;
  message?: string;
  creditCents: number;
  claimToken: string;
  status: 'pending' | 'claimed';
  lineItems?: BoxLineItem[];
  childInterests?: string[];
  createdAt: string;
  claimedAt?: string;
  claimedByHouseholdId?: string;
};

export type HolidayReflection = {
  holidayId: string;
  wins: string;
  hardMoments: string;
  nextYearShift: string;
  favoriteNight: string;
  updatedAt: string;
  platformCreditAwardedCents?: number;
};

export const HOLIDAY_ID = 'hanukkah-2026';
