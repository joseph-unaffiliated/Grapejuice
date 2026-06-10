export type FamiliarityLevel = 'minimal' | 'moderate' | 'all-in';
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
  hiddenHolidays?: string[];
  collaborationName?: string;
  createdAt: string;
  updatedAt: string;
};

export type Household = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  childUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ChildProfile = {
  id: string;
  name?: string;
  ageGroup: AgeGroup;
  birthday?: string;
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
  familiarityLevel?: FamiliarityLevel;
  updatedAt: string;
  updatedBy: string;
  lockedAt?: string | null;
};

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
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
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

export type HolidayReflection = {
  holidayId: string;
  wins: string;
  hardMoments: string;
  nextYearShift: string;
  favoriteNight: string;
  updatedAt: string;
};

export const HOLIDAY_ID = 'hanukkah-2026';
