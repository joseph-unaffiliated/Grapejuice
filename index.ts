import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Explicit web entry — App.tsx pulls in @stripe/stripe-react-native and font gating.
const App = Platform.OS === 'web' ? require('./App.web').default : require('./App').default;

registerRootComponent(App);
