import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Auth } from 'firebase/auth';
import { getAuth } from 'firebase/auth';

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

const firebaseConfig = {
  apiKey: extra?.firebaseApiKey ?? '',
  authDomain: extra?.firebaseAuthDomain ?? '',
  projectId: extra?.firebaseProjectId ?? '',
  storageBucket: extra?.firebaseStorageBucket ?? '',
  messagingSenderId: extra?.firebaseMessagingSenderId ?? '',
  appId: extra?.firebaseAppId ?? '',
};

const app = initializeApp(firebaseConfig);

let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  const authRn = require('@firebase/auth') as {
    initializeAuth: (app: unknown, deps: { persistence: unknown }) => Auth;
    getReactNativePersistence: (storage: unknown) => unknown;
  };
  auth = authRn.initializeAuth(app, {
    persistence: authRn.getReactNativePersistence(AsyncStorage),
  });
}

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { app, auth, db, storage, functions };
