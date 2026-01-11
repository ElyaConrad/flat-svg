import GraphemeSplitter from 'grapheme-splitter';

export type TextSegment = {
  text: string;
  type: 'text' | 'emoji';
};

export function segmentText(text: string): TextSegment[] {
  const splitter = new GraphemeSplitter();
  const graphemes = splitter.splitGraphemes(text);
  
  const segments: TextSegment[] = [];
  let currentSegment: TextSegment | null = null;
  let charIndex = 0;

  for (const grapheme of graphemes) {
    const isEmoji = isEmojiGrapheme(grapheme);
    const type = isEmoji ? 'emoji' : 'text';

    if (!currentSegment || currentSegment.type !== type || type === 'emoji') {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      currentSegment = {
        text: grapheme,
        type,
      };
    } else {
      // Nur Text-Segmente zusammenfassen
      currentSegment.text += grapheme;
      // currentSegment.endIndex = charIndex + grapheme.length;
    }

    charIndex += grapheme.length;
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

function isEmojiGrapheme(grapheme: string): boolean {
  const codepoint = grapheme.codePointAt(0);
  if (!codepoint) return false;

  return (
    (codepoint >= 0x1f300 && codepoint <= 0x1f9ff) || // Emoticons, Symbols
    (codepoint >= 0x2600 && codepoint <= 0x26ff) || // Misc symbols
    (codepoint >= 0x2700 && codepoint <= 0x27bf) || // Dingbats
    (codepoint >= 0x1f600 && codepoint <= 0x1f64f) || // Emoticons
    (codepoint >= 0x1f680 && codepoint <= 0x1f6ff) || // Transport
    (codepoint >= 0x1f900 && codepoint <= 0x1f9ff) || // Supplemental Symbols
    // Regional Indicator Symbols (Flags): 🇩🇪
    (codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff) ||
    // Skin tone modifiers
    (codepoint >= 0x1f3fb && codepoint <= 0x1f3ff) ||
    // Variation Selectors
    (codepoint >= 0xfe00 && codepoint <= 0xfe0f) ||
    // Zero-Width Joiner (für 👨‍👩‍👧‍👦)
    codepoint === 0x200d
  );
}
