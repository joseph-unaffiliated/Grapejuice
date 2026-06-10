import { Platform, type ViewStyle } from 'react-native';

/** Full-width web layout — use WebPageContainer authCard for centered sign-in cards only. */
export function useWebScreenFrame(): ViewStyle {
  if (Platform.OS !== 'web') return {};
  return { width: '100%', flex: 1 };
}

/** @deprecated Use useWebScreenFrame(). */
export const webScreenFrame: ViewStyle =
  Platform.OS === 'web' ? { width: '100%', flex: 1 } : {};
