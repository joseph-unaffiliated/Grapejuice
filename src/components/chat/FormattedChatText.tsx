import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type Segment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

/**
 * Lightweight inline markdown for Rav replies — **bold** and *italic*.
 * Keeps newlines; does not pull in a full markdown dependency.
 */
export function parseInlineMarkdown(input: string): Segment[] {
  const segments: Segment[] = [];
  // Bold before italic so **…** wins over nested *…*
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) != null) {
    if (match.index > last) {
      segments.push({ text: input.slice(last, match.index) });
    }
    if (match[2] != null) {
      segments.push({ text: match[2], bold: true });
    } else if (match[3] != null) {
      segments.push({ text: match[3], italic: true });
    }
    last = match.index + match[0].length;
  }
  if (last < input.length) {
    segments.push({ text: input.slice(last) });
  }
  return segments.length ? segments : [{ text: input }];
}

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  italicStyle?: StyleProp<TextStyle>;
};

export function FormattedChatText({ text, style, boldStyle, italicStyle }: Props) {
  const segments = useMemo(() => parseInlineMarkdown(text), [text]);

  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        if (seg.bold) {
          return (
            <Text key={i} style={[style, { fontWeight: '600' }, boldStyle]}>
              {seg.text}
            </Text>
          );
        }
        if (seg.italic) {
          return (
            <Text key={i} style={[style, { fontStyle: 'italic' }, italicStyle]}>
              {seg.text}
            </Text>
          );
        }
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}
