import React from 'react';
import { Text, TextInput } from 'react-native';
import { typeface } from '../../constants/theme';

const defaults = typeface('regular');
// Apply once at module load so first paint already uses DM Sans metrics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Text as any).defaultProps = { ...(Text as any).defaultProps, style: defaults };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: defaults };

/** Ensure Text / TextInput default to DM Sans. */
export function TypographyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
