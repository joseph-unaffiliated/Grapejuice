/**
 * Grapejuice — Hanukkah 2026 pilot.
 * Brand: Grapejuice only in-app; "by Untraditional" in legal/store metadata if needed.
 * Bundle ID: app.grapejuice (same as commerce app; only one build on device at a time in dev)
 * Expo slug: grapejuice-pilot (distinct from commerce `grapejuice` for EAS)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  expo: {
    name: 'Grapejuice',
    slug: 'grapejuice-pilot',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: 'grapejuice',
    newArchEnabled: true,
    description:
      'Grapejuice — curated Hanukkah boxes for culturally Jewish families. By Untraditional.',
    privacyPolicyUrl: 'https://grapejuice.co/privacy',
    termsOfServiceUrl: 'https://grapejuice.co/terms',
    supportUrl: 'https://grapejuice.co/support',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.grapejuice',
      buildNumber: '1',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'app.grapejuice',
      versionCode: 1,
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      appVariant: 'pilot',
      stripePublishableKey:
        process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '',
      },
    },
  },
};
