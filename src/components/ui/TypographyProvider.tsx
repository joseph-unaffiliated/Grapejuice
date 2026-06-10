import React, { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { typeface } from '../../constants/theme';

/** Apply DM Sans globally once fonts are loaded. */
export function TypographyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const defaults = typeface('regular');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Text as any).defaultProps = { ...(Text as any).defaultProps, style: defaults };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: defaults };
  }, []);

  return <>{children}</>;
}
