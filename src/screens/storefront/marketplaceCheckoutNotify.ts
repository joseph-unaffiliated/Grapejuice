import { Alert, Platform } from 'react-native';

export function marketplaceCheckoutNotify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function marketplaceCheckoutErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error != null) {
    const e = error as { code?: unknown; message?: unknown; details?: unknown };
    const code = typeof e.code === 'string' ? e.code : '';
    const message = typeof e.message === 'string' ? e.message.trim() : '';
    // Firebase callables often surface as "INTERNAL" / "functions/internal".
    if (code === 'functions/internal' || /^internal$/i.test(message)) {
      if (message && !/^internal$/i.test(message) && message !== 'INTERNAL') {
        return message;
      }
      return 'Checkout failed on the server. Deploy createMarketplaceCheckout or check Functions logs.';
    }
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not start checkout.';
}
