import css from 'css';
import pLimit from 'p-limit';
import { extractCSSString } from './css.js';
import { ICSSFunction, parse as parseCSSExpression } from 'css-expression';

export function getDefaultFontFile(fontWeight: number, fontStyle: string) {
  const defaultFonts = [
    {
      weight: 100,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyeMZg.ttf',
    },
    {
      weight: 200,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuDyfMZg.ttf',
    },
    {
      weight: 300,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf',
    },
    {
      weight: 400,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
    },
    {
      weight: 500,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf',
    },
    {
      weight: 600,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf',
    },
    {
      weight: 700,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
    },
    {
      weight: 800,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYMZg.ttf',
    },
    {
      weight: 900,
      style: 'normal',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg.ttf',
    },
    {
      weight: 100,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dphjQ.ttf',
    },
    {
      weight: 200,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTcWdthjQ.ttf',
    },
    {
      weight: 300,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTch9thjQ.ttf',
    },
    {
      weight: 400,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dthjQ.ttf',
    },
    {
      weight: 500,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc69thjQ.ttf',
    },
    {
      weight: 600,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTcB9xhjQ.ttf',
    },
    {
      weight: 700,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTcPtxhjQ.ttf',
    },
    {
      weight: 800,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnOKk4j1ebLhAm8SrXTcWdxhjQ.ttf',
    },
    {
      weight: 900,
      style: 'italic',
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTccNxhjQ.ttf',
    },
  ];
  const font = defaultFonts.find((font) => font.weight === fontWeight && font.style === fontStyle) ?? defaultFonts.find((font) => font.weight === 400 && font.style === 'normal')!;
  return font.src;
}

type FontWeight =
  | {
      type: 'range';
      min: number;
      max: number;
    }
  | {
      type: 'static';
      value: number;
    };

type FontDeclaration = {
  fontFamily: string;
  fontStyle?: string;
  fontWeight?: FontWeight;
  src: string;
  unicodeRange?: string;
};

const cssFontsCache = new Map<string, string>();
const fontFilesCache = new Map<string, Uint8Array>();
const limiter = pLimit(1);

export async function resolveFontFile(src: string, useCache = true) {
  if (useCache && fontFilesCache.has(src)) {
    return fontFilesCache.get(src) as Uint8Array;
  }
  const ab = await limiter(() => fetch(src).then((response) => response.arrayBuffer()));
  const data = new Uint8Array(ab);

  fontFilesCache.set(src, data);

  return data;
}

export async function resolveCSSFontFile(src: string, useCache = true) {
  if (useCache && cssFontsCache.has(src)) {
    return cssFontsCache.get(src) as string;
  }
  const raw = await limiter(() => fetch(src).then((response) => response.text()));

  const style = css.parse(raw);
  const { stylesheet } = style;

  if (!stylesheet) {
    throw new Error('Invalid CSS file');
  }

  return raw;
}

function isCharInRange(charCode: number, range: string): boolean {
  const ranges = range.split(',').map((r) => r.trim());
  for (const r of ranges) {
    if (r.startsWith('U+')) {
      const [start, end] = r
        .substring(2)
        .split('-')
        .map((hex) => parseInt(hex, 16));
      if (end ? charCode >= start && charCode <= end : charCode === start) {
        return true;
      }
    }
  }
  return false;
}

export function textIsInUnicodeRange(text: string, unicodeRange: string): boolean {
  for (const char of text) {
    const charCode = char.codePointAt(0);
    if (charCode !== undefined && isCharInRange(charCode, unicodeRange)) {
      return true;
    }
  }
  return false;
}

export function getCharRangeRelevantFontDeclarations(text: string, declarations: FontDeclaration[]): FontDeclaration[] {
  return declarations.filter((declaration) => {
    if (!declaration.unicodeRange) {
      return true;
    }
    // return textIsInUnicodeRange(text, declaration.unicodeRange);
    // Prüfe für jedes Zeichen im Text, ob es in den unicodeRange der Deklaration passt
    for (const char of text) {
      const charCode = char.codePointAt(0);
      if (charCode !== undefined && isCharInRange(charCode, declaration.unicodeRange)) {
        return true;
      }
    }
    return false;
  });
}

function calculateWeightDifference(fontWeight: FontWeight | undefined, desiredWeight: number): number {
  if (fontWeight === undefined) return Infinity;

  if (fontWeight.type === 'static') {
    return Math.abs(fontWeight.value - desiredWeight);
  } else {
    const minWeight = fontWeight.min;
    const maxWeight = fontWeight.max;
    if (desiredWeight < minWeight) {
      return minWeight - desiredWeight;
    } else if (desiredWeight > maxWeight) {
      return desiredWeight - maxWeight;
    } else {
      return 0;
    }
  }
}

export function getAllFontDeclarations(cssData: string) {
  const { stylesheet } = css.parse(cssData);
  if (!stylesheet) {
    throw new Error('Invalid CSS file');
  }
  const fontFaceRules = stylesheet.rules.filter((rule) => rule.type === 'font-face');

  return fontFaceRules
    .map((rule) => {
      const fontFamily = rule.declarations?.filter((declaration) => declaration.type === 'declaration').find((declaration) => declaration.property === 'font-family')?.value;
      const srcValue = rule.declarations?.filter((declaration) => declaration.type === 'declaration').find((declaration) => declaration.property === 'src')?.value;
      const fontWeightRaw = rule.declarations?.filter((declaration) => declaration.type === 'declaration').find((declaration) => declaration.property === 'font-weight')?.value;
      const fontStyle = rule.declarations?.filter((declaration) => declaration.type === 'declaration').find((declaration) => declaration.property === 'font-style')?.value;
      const unicodeRange = rule.declarations?.filter((declaration) => declaration.type === 'declaration').find((declaration) => declaration.property === 'unicode-range')?.value;

      if (!fontFamily || !srcValue) {
        return null;
      }

      const fontWeight = (() => {
        if (fontWeightRaw === undefined) {
          return undefined;
        }

        const numbers = fontWeightRaw
          .split(/ {1,}/)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (numbers.length === 0) {
          return undefined;
        } else if (numbers.length === 1) {
          return { type: 'static', value: numbers[0] };
        } else {
          const [min, max] = numbers;
          return { type: 'range', min, max };
        }
      })();

      const src = (() => {
        const [urlExprRaw] = srcValue.match(/url\(([^)]+)\)/) ?? [];
        if (urlExprRaw) {
          const urlValue = urlExprRaw.slice(4, -1);
          if (urlValue.startsWith('"') || urlValue.startsWith("'")) {
            return urlValue.slice(1, -1);
          } else {
            return urlValue;
          }
        }
      })();

      return {
        fontFamily: extractCSSString(fontFamily),
        src: src,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        unicodeRange: unicodeRange,
      };
    })
    .filter((delc) => delc !== null) as FontDeclaration[];
}

export function findBestFontDeclaration(declarations: FontDeclaration[], desiredFontFamily: string, desiredFontWeight?: number, desiredFontStyle?: string): FontDeclaration | null {
  // Filtere Deklarationen nach der FontFamily
  const matchingFamily = declarations.filter((declaration) => declaration.fontFamily === desiredFontFamily);

  if (matchingFamily.length === 0) {
    return null; // Keine passende Font gefunden
  }

  // Wenn kein `desiredFontStyle` angegeben ist, wird "normal" bevorzugt, aber "italic" akzeptiert
  const desiredStyle = desiredFontStyle || 'normal';

  // Filtere nach `fontStyle`, wenn vorhanden, oder akzeptiere jeden Stil
  const matchingStyle = matchingFamily.filter((declaration) => declaration.fontStyle === undefined || declaration.fontStyle === desiredStyle);

  // Sortiere nach der besten Übereinstimmung für `fontWeight`
  const sortedByWeight = matchingStyle.sort((a, b) => {
    if (desiredFontWeight === undefined) return 0;

    // Berechne die Differenz für `a`
    const weightDifferenceA = calculateWeightDifference(a.fontWeight, desiredFontWeight);
    // Berechne die Differenz für `b`
    const weightDifferenceB = calculateWeightDifference(b.fontWeight, desiredFontWeight);

    return weightDifferenceA - weightDifferenceB;
  });

  // Gib die erste (beste passende) Deklaration zurück oder null, falls keine übrig ist
  return sortedByWeight[0] || null;
}

export function getFontFile(cssData: string | ArrayBuffer, fontName: string, fontWeight: number, fontStyle: string) {
  const fontCSSRaw = typeof cssData === 'string' ? cssData : new TextDecoder('utf-8').decode(new Uint8Array(cssData));

  const fontDeclarations = getAllFontDeclarations(fontCSSRaw);

  // Get just the font declarations that are relevant for the given unicode range
  const relevantFontDeclarations = getCharRangeRelevantFontDeclarations(fontName, fontDeclarations);

  const declaration = findBestFontDeclaration(relevantFontDeclarations, fontName, fontWeight, fontStyle);
  if (declaration === null) {
    return getDefaultFontFile(fontWeight, fontStyle);
    //throw new Error('No matching font declaration found');
  }

  return declaration.src;
}
