import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const MY_BOXES_DISMISSED_KEY = 'my-boxes-dismissed-holidays';

function parseDismissed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadDismissedMyBoxHolidays(): Promise<string[]> {
  try {
    const raw =
      Platform.OS === 'web' && typeof localStorage !== 'undefined'
        ? localStorage.getItem(MY_BOXES_DISMISSED_KEY)
        : await AsyncStorage.getItem(MY_BOXES_DISMISSED_KEY);
    return parseDismissed(raw);
  } catch {
    return [];
  }
}

export async function saveDismissedMyBoxHolidays(ids: string[]): Promise<void> {
  const json = JSON.stringify(ids);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(MY_BOXES_DISMISSED_KEY, json);
  } else {
    await AsyncStorage.setItem(MY_BOXES_DISMISSED_KEY, json);
  }
}
