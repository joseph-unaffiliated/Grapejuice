import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from './types';

/** Phone account sub-pages say "‹ Account", so go there even when they were opened from a link. */
export function goBackToAccount(navigation: StackNavigationProp<MainStackParamList>) {
  navigation.navigate('MainTabs', { screen: 'Account' });
}
