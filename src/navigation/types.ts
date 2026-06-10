import type { NavigatorScreenParams } from '@react-navigation/native';

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
  Checkout: undefined;
  OrderConfirmation: { orderId: string };
  Reflection: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainStackParamList> | undefined;
};
