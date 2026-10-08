import { Platform } from 'react-native';

type RevealableNode = {
  focus?: () => void;
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
};

/** Web: scroll the scroll view containing `target` back to its top, falling back to the window. */
export function scrollContainerToTop(target: unknown): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  let el = (target as HTMLElement | null)?.parentElement ?? null;
  while (el) {
    const { overflowY } = window.getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      el.scrollTop = 0;
      return;
    }
    el = el.parentElement;
  }
  window.scrollTo(0, 0);
}

/**
 * Failed submit: scroll a missing / invalid field to the middle of the screen and focus it.
 * On web, React Native refs are DOM nodes, so `scrollIntoView` reaches nested scroll views.
 */
export function revealField(target: unknown, { focus = true }: { focus?: boolean } = {}): void {
  const node = target as RevealableNode | null | undefined;
  if (!node) return;
  if (Platform.OS === 'web' && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  if (focus && typeof node.focus === 'function') node.focus();
}
