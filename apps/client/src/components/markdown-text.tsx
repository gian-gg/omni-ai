import { Text, type TextStyle } from 'react-native';

type Props = {
  children: string;
  style?: TextStyle;
  boldStyle?: TextStyle;
  italicStyle?: TextStyle;
};

type Token = { type: 'text' | 'bold' | 'italic'; value: string };

/**
 * Lightweight inline-markdown renderer.
 * Supports **bold** and *italic*.
 */
export function MarkdownText({ children, style, boldStyle, italicStyle }: Props) {
  const tokens = tokenize(children);

  return (
    <Text style={style}>
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case 'bold':
            return (
              <Text key={i} style={[{ fontFamily: 'Manrope_600SemiBold' }, boldStyle]}>
                {tok.value}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={[{ fontStyle: 'italic' }, italicStyle]}>
                {tok.value}
              </Text>
            );
          default:
            return tok.value;
        }
      })}
    </Text>
  );
}

/** Match **bold** first (greedy over italic), then *italic*. */
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_RE.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ type: 'bold', value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'italic', value: match[2] });
    }

    lastIndex = INLINE_RE.lastIndex;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}
