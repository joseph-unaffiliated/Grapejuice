import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { initSentry, Sentry } from './src/services/monitoring/sentry';

initSentry();

// Explicit web entry — App.tsx pulls in @stripe/stripe-react-native and font gating.
const App = Platform.OS === 'web' ? require('./App.web').default : require('./App').default;

registerRootComponent(Sentry.wrap(App));
