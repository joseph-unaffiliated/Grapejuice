/**
 * Wraps every new mobile screen. If it throws while rendering, the visitor gets the
 * existing screen instead and the error goes to Sentry tagged `mobileLayout`, so a
 * bad mobile build degrades to today's experience rather than a blank page.
 */
import React from 'react';
import { Sentry } from '../../services/monitoring/sentry';

type Props = {
  screen: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
};

type State = { failed: boolean };

export class MobileBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    try {
      Sentry.captureException(error, {
        tags: { mobileLayout: 'new', mobileScreen: this.props.screen },
        extra: { componentStack: info.componentStack },
      });
    } catch {
      // Reporting must never throw.
    }
  }

  render(): React.ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
