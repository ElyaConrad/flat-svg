import { arrayBufferToString } from './arrayBufferToString.js';
import css from 'css';
import pLimit from 'p-limit';
import * as fontkit from 'fontkit';
import { ICSSFunction, parse as parseCSSExpression } from 'css-expression';
import { blobToDataURL } from './blobToDataURL.js';
import { ensureCSSValue, ensureNumber, getSVGValue } from './css.js';
import paper from 'paper';
import SVGPathCommander from 'svg-path-commander';
import { findBestFontDeclaration, getAllFontDeclarations, getCharRangeRelevantFontDeclarations, getFontFile, resolveFontFile } from './resolveFonts.js';

export type TextFragment = {
  glyphs: Glyph[];
  bbox: fontkit.Glyph['bbox'];
  descent: number;
  ascent: number;
};

type Glyph = {
  path?: SVGPathCommander;
  bbox: fontkit.Glyph['bbox'];
  cbox: fontkit.Glyph['cbox'];
  xAdvance: number;
  advanceWidth: number;
  isLigature: boolean;
  isMark: boolean;
};

export type TextFormat = {
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
  fontSize: number;
  letterSpacing: number;
};

export function getTextFormat(text: SVGTextElement | SVGTSpanElement, inherit?: TextFormat): TextFormat {
  const fontFamilyRaw = getSVGValue(text, 'font-family') ?? inherit?.fontFamily ?? 'Times';
  const fontWeightRaw = getSVGValue(text, 'font-weight') ?? inherit?.fontWeight ?? '400';
  const fontStyleRaw = getSVGValue(text, 'font-style') ?? inherit?.fontStyle ?? 'normal';
  const fontSizeRaw = getSVGValue(text, 'font-size') ?? inherit?.fontSize ?? '12';
  const letterSpacingRaw = getSVGValue(text, 'letter-spacing') ?? inherit?.letterSpacing ?? '1';

  const fontFamily = fontFamilyRaw.replace(/['"]/g, '');
  const fontWeight = ensureNumber(String(fontWeightRaw)) ?? 400;
  const fontStyle = fontStyleRaw;
  const fontSize = ensureCSSValue(String(fontSizeRaw)) ?? 12;
  const letterSpacing = ensureNumber(String(letterSpacingRaw)) ?? 1;

  return {
    fontFamily,
    fontWeight,
    fontStyle,
    fontSize,
    letterSpacing,
  };
}

function guessFontVariationtBasedOnNamedWeight(weight: string, namedVariations: { [k: string]: { wght: number } }) {
  weight = weight.toLowerCase();

  if (weight in namedVariations) {
    return namedVariations[weight];
  } else {
    const weights = new Map([
      ['thin', { wght: 100 }],
      ['extralight', { wght: 200 }],
      ['light', { wght: 300 }],
      ['normal', { wght: 400 }],
      ['medium', { wght: 500 }],
      ['semibold', { wght: 600 }],
      ['bold', { wght: 700 }],
      ['extrabold', { wght: 800 }],
      ['black', { wght: 900 }],
    ]);
    return weights.get(weight) ?? { wght: 400 };
  }
}

// After all, woff2 variations seem to be not working as expected because if we're calling getVariation() from a font with named variations, the returned font will not work with the fontkit layout() function
// but an error happens (I have no idea why)
function generateSvgPathRules(text: string, fontData: Uint8Array, letterSpacing: number, concreteWeight?: number | string): TextFragment {
  const fontBase = fontkit.create(fontData as any);

  const _font = (() => {
    if ((fontBase as fontkit.FontCollection).fonts) {
      const fontCollection = fontBase as fontkit.FontCollection;
      return fontCollection.fonts[0];
    } else {
      return fontBase as fontkit.Font;
    }
  })();

  const font = (() => {
    if ((_font as any).variationAxes['wght']) {
      if (typeof concreteWeight === 'string') {
        return _font.getVariation(guessFontVariationtBasedOnNamedWeight(concreteWeight, (_font as any).namedVariations));
      } else {
        const weightVariation = (_font as any).variationAxes['wght'] as { name: string; min: number; default: number; max: number };
        console.log('weightVariation', weightVariation);

        const weight = Math.min(Math.max(weightVariation.min, concreteWeight ?? weightVariation.default), weightVariation.max);
        console.log(weight);

        return _font.getVariation({ wght: weight });
      }
    } else {
      return _font;
    }
  })();
  const glyphs: Glyph[] = [];

  const run = font.layout(text, undefined, 'de-DE', 'ltr');
  let xAdvance = 0;
  let i = 0;
  for (const glyph of run.glyphs) {
    const { bbox, cbox, advanceWidth, isLigature, isMark } = glyph;

    const path = glyph.path.commands.length > 0 ? new SVGPathCommander(glyph.path.toSVG()).transform({ scale: [1, -1] }) : undefined;

    glyphs.push({
      path: path,
      bbox,
      cbox,
      advanceWidth,
      isLigature,
      isMark,
      xAdvance,
    });
    xAdvance += run.positions[i].xAdvance * letterSpacing;
    i++;
  }

  return {
    glyphs,
    bbox: font.bbox,
    ascent: font.ascent,
    descent: font.descent,
  };
}

function scaleFontkitBBox(bbox: fontkit.Glyph['bbox'], scale: number) {
  return {
    width: bbox.width * scale,
    height: bbox.height * scale,
    minX: bbox.minX * scale,
    minY: bbox.minY * scale,
    maxX: bbox.maxX * scale,
    maxY: bbox.maxY * scale,
  };
}

export function textToPath(text: string, fontData: Uint8Array, fontSize: number, letterSpacing: number, alignmentBaseline: 'hanging' | 'middle' | 'baseline', concreteWeight?: number | string) {
  const { glyphs, ascent, descent } = generateSvgPathRules(text, fontData, letterSpacing, concreteWeight);

  const assumedDefaultFontSize = 1000;
  const scale = fontSize / assumedDefaultFontSize;

  for (const glyph of glyphs) {
    if (glyph.path) {
      glyph.path.transform({ scale });
      glyph.xAdvance *= scale;
      glyph.advanceWidth *= scale;
      glyph.bbox = scaleFontkitBBox(glyph.bbox, scale);
      glyph.cbox = scaleFontkitBBox(glyph.cbox, scale);
      if (alignmentBaseline === 'hanging') {
        glyph.path.transform({ translate: [0, ascent] });
      } else if (alignmentBaseline === 'middle') {
        glyph.path.transform({ translate: [0, (ascent + descent) / 2] });
      }
    }
  }

  return glyphs;
}

function getBBoxesPath(bboxes: { x: number; y: number; width: number; height: number }[]) {
  const bboxesAbs = bboxes.map(({ x, y, width, height }) => ({ left: x, top: y, right: x + width, bottom: y + height }));

  const accumulatedBBoxAbs = bboxesAbs.reduce((acc, { left, top, right, bottom }) => {
    return { left: Math.min(acc.left, left), top: Math.min(acc.top, top), right: Math.max(acc.right, right), bottom: Math.max(acc.bottom, bottom) };
  }, bboxesAbs[0]);

  return {
    x: accumulatedBBoxAbs.left,
    y: accumulatedBBoxAbs.top,
    width: accumulatedBBoxAbs.right - accumulatedBBoxAbs.left,
    height: accumulatedBBoxAbs.bottom - accumulatedBBoxAbs.top,
  };
}

export type SpanDescriptor = { format: TextFormat; text: string; dx?: number; dy?: number; x?: number; y?: number };

export async function textElementToPath(text: SVGTextElement, rootSVG: SVGSVGElement) {
  const stylesheet = Array.from(rootSVG.querySelectorAll('style'))
    .map((style) => style.textContent)
    .join('\n');

  const textBaseFormat = getTextFormat(text);

  const spans = Array.from(text.childNodes)
    .map((node) => {
      // If this is plain text node
      if (node.nodeType === 3) {
        return {
          format: textBaseFormat,
          text: node.textContent?.trim() ?? '',
        };
      }
      // If we're dealing with tspan
      if (node.nodeType === 1 && node.nodeName === 'tspan') {
        const tspan = node as SVGTSpanElement;
        const dx = ensureNumber(tspan.getAttribute('dx') ?? undefined);
        const dy = ensureNumber(tspan.getAttribute('dy') ?? undefined);
        const x = ensureNumber(tspan.getAttribute('x') ?? undefined);
        const y = ensureNumber(tspan.getAttribute('y') ?? undefined);
        return {
          format: getTextFormat(tspan, textBaseFormat),
          text: tspan.textContent?.trim() ?? '',
          dx,
          dy,
          x,
          y,
        };
      }
    })
    .filter((span) => span?.text !== undefined && span.text.length > 0) as SpanDescriptor[];

  const baseX = ensureNumber(text.getAttribute('x') ?? '0') ?? 0;
  const baseY = ensureNumber(text.getAttribute('y') ?? '0') ?? 0;

  let spanOffset = 0;

  const paths = await Promise.all(
    spans.map(async (span, index) => {
      const fontSrc = await getFontFile(stylesheet, textBaseFormat.fontFamily, textBaseFormat.fontWeight, textBaseFormat.fontStyle);
      const needsSpaceAfter = index < spans.length - 1;
      const glyphs = textToPath(needsSpaceAfter ? span.text + ' !' : span.text, await resolveFontFile(fontSrc), textBaseFormat.fontSize, textBaseFormat.letterSpacing, 'baseline', textBaseFormat.fontWeight);

      // if (span.x !== undefined) {
      //   spanOffset = span.x;
      // }

      const paths = glyphs
        .map((glyph) => {
          return glyph.path ? glyph.path.transform({ translate: [span.x !== undefined ? span.x : baseX + spanOffset + glyph.xAdvance, baseY] }) : undefined;
        })
        .filter((path) => path !== undefined) as SVGPathCommander[];
      const glyphBBoxes = paths.map((path) => ({ x: path.bbox.x, y: path.bbox.y, width: path.bbox.width, height: path.bbox.height })).slice(0, needsSpaceAfter ? -1 : undefined);
      const lastPath = paths[paths.length - 1];
      const secondLastPath = paths[paths.length - 2];
      const spanWidth = getBBoxesPath(glyphBBoxes).width + (needsSpaceAfter ? lastPath.bbox.x - (secondLastPath.bbox.x + secondLastPath.bbox.width) : 0);

      spanOffset += spanWidth;
      return {
        paths: needsSpaceAfter ? paths.slice(0, -1) : paths,
        text: span.text + (needsSpaceAfter ? ' ' : ''),
      };
    })
  );

  // const paths = textPathDescriptor.glyphs
  //   .map((glyph) => {
  //     return glyph.path ? glyph.path.transform({ translate: [x + glyph.xAdvance, y] }) : undefined;
  //   })
  //   .filter((path) => path !== undefined) as SVGPathCommander[];

  return {
    paths: paths.map((p) => p.paths),
    text: paths.map((p) => p.text).join(''),
  };
}
