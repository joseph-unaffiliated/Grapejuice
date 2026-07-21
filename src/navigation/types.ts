import type { NavigatorScreenParams } from '@react-navigation/native';
import type { GiftChildDraft, GiftGiveFormValues } from '../screens/gift/giftGiveTypes';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignInEmail: undefined;
  SignUp: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Rav: { initialMessage?: string } | undefined;
  Account: undefined;
  Box: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  MyBox: undefined;
  Guide: undefined;
  KidGuide: undefined;
  Profiles: undefined;
  AlaCarteStore: undefined;
  CatalogProduct: { itemId: string };
  Checkout: undefined;
  OrderConfirmation: { orderId: string };
  Reflection: undefined;
  AboutHanukkah: undefined;
  GiftGive: undefined;
  GiftGiverCustomize: {
    form: GiftGiveFormValues;
    childDrafts: GiftChildDraft[];
  };
  GiftClaim: { token?: string };
  GiftRecipientReveal: {
    giverName: string;
    message?: string;
    giftCreditCents: number;
    hasGiverDraft: boolean;
  };
  /** Ops: list Hanukkah catalog items (admin allowlist). */
  AdminCatalog: undefined;
  /** Ops: create or edit a catalog item. Omit itemId to create. */
  AdminCatalogItem: { itemId?: string };
  /** Dev: large grape mark + wobble knobs (`?preview=grape-wobble`). */
  GrapeWobblePreview: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};
