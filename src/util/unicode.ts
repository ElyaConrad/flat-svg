export type UnicodeRange = 
  | 'basic-latin'
  | 'latin-1-supplement'
  | 'latin-extended-a'
  | 'latin-extended-b'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew'
  | 'greek'
  | 'chinese-japanese-korean'
  | 'devanagari'
  | 'thai'
  | 'emoji'
  | 'other';


export function getUnicodeRange(codePoint: number): UnicodeRange {
  // Latin
  if (codePoint <= 0x007F) return 'basic-latin';
  if (codePoint >= 0x0080 && codePoint <= 0x00FF) return 'latin-1-supplement';
  if (codePoint >= 0x0100 && codePoint <= 0x017F) return 'latin-extended-a';
  if (codePoint >= 0x0180 && codePoint <= 0x024F) return 'latin-extended-b';
  
  // Cyrillic
  if (codePoint >= 0x0400 && codePoint <= 0x04FF) return 'cyrillic';
  if (codePoint >= 0x0500 && codePoint <= 0x052F) return 'cyrillic'; // Cyrillic Supplement
  
  // Greek
  if (codePoint >= 0x0370 && codePoint <= 0x03FF) return 'greek';
  if (codePoint >= 0x1F00 && codePoint <= 0x1FFF) return 'greek'; // Greek Extended
  
  // Arabic
  if (codePoint >= 0x0600 && codePoint <= 0x06FF) return 'arabic';
  if (codePoint >= 0x0750 && codePoint <= 0x077F) return 'arabic'; // Arabic Supplement
  if (codePoint >= 0xFB50 && codePoint <= 0xFDFF) return 'arabic'; // Arabic Presentation Forms-A
  if (codePoint >= 0xFE70 && codePoint <= 0xFEFF) return 'arabic'; // Arabic Presentation Forms-B
  
  // Hebrew
  if (codePoint >= 0x0590 && codePoint <= 0x05FF) return 'hebrew';
  if (codePoint >= 0xFB1D && codePoint <= 0xFB4F) return 'hebrew'; // Hebrew Presentation Forms
  
  // Devanagari (Hindi, Sanskrit, etc.)
  if (codePoint >= 0x0900 && codePoint <= 0x097F) return 'devanagari';
  
  // Thai
  if (codePoint >= 0x0E00 && codePoint <= 0x0E7F) return 'thai';
  
  // CJK (Chinese, Japanese, Korean)
  if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) return 'chinese-japanese-korean'; // CJK Unified Ideographs
  if (codePoint >= 0x3400 && codePoint <= 0x4DBF) return 'chinese-japanese-korean'; // CJK Extension A
  if (codePoint >= 0x20000 && codePoint <= 0x2A6DF) return 'chinese-japanese-korean'; // CJK Extension B
  if (codePoint >= 0x2A700 && codePoint <= 0x2B73F) return 'chinese-japanese-korean'; // CJK Extension C
  if (codePoint >= 0x2B740 && codePoint <= 0x2B81F) return 'chinese-japanese-korean'; // CJK Extension D
  if (codePoint >= 0x2B820 && codePoint <= 0x2CEAF) return 'chinese-japanese-korean'; // CJK Extension E
  if (codePoint >= 0x3040 && codePoint <= 0x309F) return 'chinese-japanese-korean'; // Hiragana
  if (codePoint >= 0x30A0 && codePoint <= 0x30FF) return 'chinese-japanese-korean'; // Katakana
  if (codePoint >= 0xAC00 && codePoint <= 0xD7AF) return 'chinese-japanese-korean'; // Hangul Syllables
  
  // Emoji
  if (codePoint >= 0x1F300 && codePoint <= 0x1F9FF) return 'emoji'; // Emoticons, Symbols, etc.
  if (codePoint >= 0x1FA00 && codePoint <= 0x1FA6F) return 'emoji'; // Extended Pictographic
  if (codePoint >= 0x2600 && codePoint <= 0x26FF) return 'emoji'; // Miscellaneous Symbols
  if (codePoint >= 0x2700 && codePoint <= 0x27BF) return 'emoji'; // Dingbats
  
  return 'other';
}

// export function hasNonLatinCharacters(text: string): boolean {
//   for (let i = 0; i < text.length; i++) {
//     const codePoint = text.codePointAt(i);
//     if (codePoint === undefined) continue;
    
//     // Latin-Bereiche: U+0000 - U+024F
//     if (codePoint > 0x024F) {
//       return true;
//     }
    
//     // Surrogate Pair überspringen
//     if (codePoint > 0xFFFF) {
//       i++;
//     }
//   }
  
//   return false;
// }

export function hasProblematicCharactersForFontkit(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) continue;
    
    // Prüfe auf wirklich problematische Bereiche für fontkit
    // CJK, Arabisch, Hebräisch, Kyrillisch, etc.
    const range = getUnicodeRange(codePoint);
    
    if (
      range === 'chinese-japanese-korean' ||
      range === 'arabic' ||
      range === 'hebrew' ||
      range === 'cyrillic' ||
      range === 'devanagari' ||
      range === 'thai' ||
      range === 'emoji'
    ) {
      return true;
    }
    
    // Surrogate Pair überspringen
    if (codePoint > 0xFFFF) {
      i++;
    }
  }
  
  return false;
}

/**
 * Analysiert einen Text und gibt detaillierte Informationen über alle Zeichen zurück
 */
export function analyzeText(text: string): {
  totalChars: number;
  latinChars: number;
  nonLatinChars: number;
  ranges: Map<UnicodeRange, number>;
  characters: {
    char: string;
    codePoint: number;
    codePointHex: string;
    range: UnicodeRange;
    index: number;
  }[];
} {
  const ranges = new Map<UnicodeRange, number>();
  const characters: {
    char: string;
    codePoint: number;
    codePointHex: string;
    range: UnicodeRange;
    index: number;
  }[] = [];
  
  let latinChars = 0;
  let nonLatinChars = 0;
  
  for (let i = 0; i < text.length; i++) {
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) continue;
    
    const char = String.fromCodePoint(codePoint);
    const range = getUnicodeRange(codePoint);
    const codePointHex = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    
    // Zähle Latin vs. Non-Latin
    if (codePoint <= 0x024F) {
      latinChars++;
    } else {
      nonLatinChars++;
    }
    
    // Zähle pro Range
    ranges.set(range, (ranges.get(range) || 0) + 1);
    
    // Speichere Character-Info
    characters.push({
      char,
      codePoint,
      codePointHex,
      range,
      index: i,
    });
    
    // Surrogate Pair überspringen
    if (codePoint > 0xFFFF) {
      i++;
    }
  }
  
  return {
    totalChars: characters.length,
    latinChars,
    nonLatinChars,
    ranges,
    characters,
  };
}

export function getTextAnalysisSummary(text: string): string {
  const analysis = analyzeText(text);
  
  const lines: string[] = [
    `Text: "${text}"`,
    `Total characters: ${analysis.totalChars}`,
    `Latin: ${analysis.latinChars} (${((analysis.latinChars / analysis.totalChars) * 100).toFixed(1)}%)`,
    `Non-Latin: ${analysis.nonLatinChars} (${((analysis.nonLatinChars / analysis.totalChars) * 100).toFixed(1)}%)`,
    '',
    'Character breakdown by Unicode range:',
  ];
  
  // Sortiere Ranges nach Anzahl
  const sortedRanges = Array.from(analysis.ranges.entries())
    .sort((a, b) => b[1] - a[1]);
  
  for (const [range, count] of sortedRanges) {
    const percentage = ((count / analysis.totalChars) * 100).toFixed(1);
    lines.push(`  - ${range}: ${count} (${percentage}%)`);
  }
  
  // Zeige Non-Latin Zeichen im Detail
  const nonLatinChars = analysis.characters.filter(c => c.codePoint > 0x024F);
  if (nonLatinChars.length > 0) {
    lines.push('');
    lines.push('Non-Latin characters:');
    for (const char of nonLatinChars) {
      lines.push(`  - "${char.char}" (${char.codePointHex}) - ${char.range}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Hilfsfunktion: Prüft, ob ein Text spezifische Unicode-Bereiche enthält
 */
export function containsRange(text: string, range: UnicodeRange): boolean {
  const analysis = analyzeText(text);
  return analysis.ranges.has(range) && (analysis.ranges.get(range) || 0) > 0;
}

/**
 * Hilfsfunktion: Filtert nur Non-Latin Zeichen aus einem Text
 */
export function extractNonLatinCharacters(text: string): string {
  const analysis = analyzeText(text);
  return analysis.characters
    .filter(c => c.codePoint > 0x024F)
    .map(c => c.char)
    .join('');
}