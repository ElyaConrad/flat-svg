import * as fontkit from 'fontkit';
import SVGPathCommander from 'svg-path-commander';
import { getFontDeclaration, resolveFontFile } from './resolveFonts';
import parseInlineStyle, { Declaration } from 'inline-style-parser';
import * as changeCase from 'change-case';
import { segmentText } from './textSegmentation';
import { getEmojiWidth, renderEmoji } from './emojiRenderer';
import { hasProblematicCharactersForFontkit } from './unicode';
import { rasterizeText } from './vectorizeText';
import { ensureCSSValue, ensureNumber, getSVGValue } from './css';



// Hybrid Glyph Segment Types
export type GlyphSegment = PathGlyphSegment | InlineSVGGlyphSegment;

export type PathGlyphSegment = {
  type: 'path';
  path: SVGPathCommander;
  bbox: fontkit.Glyph['bbox'];
  cbox: fontkit.Glyph['cbox'];
  xAdvance: number;
  advanceWidth: number;
  letterSpacing: number;
  isLigature: boolean;
  isMark: boolean;
};

export type InlineSVGGlyphSegment = {
  type: 'inline-svg';
  svg: string;
  width: number;
  height: number;
  baselineOffset: number;
  xAdvance: number;
  yOffset: number; // Offset für alignment baseline
  letterSpacing: number;
};

export type TextFragment = {
  glyphs: GlyphSegment[];
  bbox: fontkit.Glyph['bbox'];
  descent: number;
  ascent: number;
  unitsPerEm: number;
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
  const letterSpacingRaw = getSVGValue(text, 'letter-spacing');

  const fontFamily = fontFamilyRaw.replace(/['"]/g, '');
  const fontWeight = ensureNumber(String(fontWeightRaw)) ?? 400;
  const fontStyle = fontStyleRaw;
  const fontSize = ensureCSSValue(String(fontSizeRaw)) ?? 12;
  const letterSpacing = (() => {
    if (letterSpacingRaw === undefined) {
      return inherit?.letterSpacing ?? 0;
    }
    const relLetterSpacing = ensureNumber(String(letterSpacingRaw));
    if (relLetterSpacing !== undefined) {
      return (relLetterSpacing - 1) * fontSize;
    } else {
      const unit = String(letterSpacingRaw).match('px') ? 'px' : undefined;
      if (unit === 'px') {
        return ensureNumber(String(letterSpacingRaw).replace(/[^0-9\.]/g, '')) ?? 0;
      }
    }
    return 0;
  })();
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

export function getFont(fontData: Uint8Array, concreteWeight?: number | string) {
  const fontBase = fontkit.create(fontData as any);
  const _font = (() => {
    if ((fontBase as fontkit.FontCollection).fonts) {
      const fontCollection = fontBase as fontkit.FontCollection;
      return fontCollection.fonts[0];
    } else {
      return fontBase as fontkit.Font;
    }
  })();

  if ((_font as any).variationAxes['wght']) {
    if (typeof concreteWeight === 'string') {
      return _font.getVariation(guessFontVariationtBasedOnNamedWeight(concreteWeight, (_font as any).namedVariations));
    } else {
      const weightVariation = (_font as any).variationAxes['wght'] as {
        name: string;
        min: number;
        default: number;
        max: number;
      };

      const weight = Math.min(Math.max(weightVariation.min, concreteWeight ?? weightVariation.default), weightVariation.max);

      return _font.getVariation({ wght: weight });
    }
  } else {
    return _font;
  }
}

async function generateSvgPathRules(
  text: string,
  fontData: Uint8Array,
  letterSpacing: number,
  fontSize: number,
  concreteWeight: number | string | undefined,
  format: TextFormat,
  stylesheet: string,
  spanStyle?: string,
  isDebug = false
): Promise<TextFragment> {
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
        const weightVariation = (_font as any).variationAxes['wght'] as {
          name: string;
          min: number;
          default: number;
          max: number;
        };

        const weight = Math.min(Math.max(weightVariation.min, concreteWeight ?? weightVariation.default), weightVariation.max);

        return _font.getVariation({ wght: weight });
      }
    } else {
      return _font;
    }
  })();

  const glyphs: GlyphSegment[] = [];

  const segments = segmentText(text);
  let xAdvance = 0;
  for (const segment of segments) {
    if (segment.type === 'text') {
      const hasProblematicChars = hasProblematicCharactersForFontkit(segment.text);
      if (hasProblematicChars) {
        const styleParsed = spanStyle ? parseInlineStyle(spanStyle) : [];
        const fillDecl = styleParsed.find((entry) => entry.type === 'declaration' && entry.property === 'fill') as
          | Declaration
          | undefined;
        const fillValue = fillDecl ? fillDecl.value : 'black';
        const strokeDecl = styleParsed.find((entry) => entry.type === 'declaration' && entry.property === 'stroke') as
          | Declaration
          | undefined;
        const strokeValue = strokeDecl ? strokeDecl.value : 'none';
        const strokeWidthDecl = styleParsed.find(
          (entry) => entry.type === 'declaration' && entry.property === 'stroke-width'
        ) as Declaration | undefined;
        const strokeWidthValue = strokeWidthDecl ? ensureCSSValue(strokeWidthDecl.value) ?? 0 : 0;

        const raserizedText = await rasterizeText(
          segment.text,
          { ...format, fontSize: font.unitsPerEm },
          stylesheet,
          fillValue,
          strokeValue,
          strokeWidthValue * (font.unitsPerEm / fontSize)
        );

        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${raserizedText.width} ${raserizedText.height}">
            <rect x="0" y="0" width="${raserizedText.width}" height="${raserizedText.height}" style="fill: none;" />
            <image href="${raserizedText.dataUrl}" x="0" y="0" width="${raserizedText.width}" height="${raserizedText.height}" />
          </svg>
        `;
        glyphs.push({
          type: 'inline-svg',
          svg,
          width: raserizedText.width,
          height: raserizedText.height,
          baselineOffset: raserizedText.fontBoundingBoxDescent * 2,
          xAdvance,
          yOffset: 0,
          letterSpacing,
        });
        xAdvance += raserizedText.width + letterSpacing;
      } else {
        const run = font.layout(segment.text);
        let i = 0;
        for (const glyph of run.glyphs) {
          const hasNoPath = glyph.path.commands.length === 0;
          const { bbox, cbox, advanceWidth, isLigature, isMark } = glyph;
          const path =
            glyph.path.commands.length > 0 ? new SVGPathCommander(glyph.path.toSVG()).transform({ scale: [1, -1] }) : undefined;

          if (path) {
            glyphs.push({
              type: 'path',
              path: path,
              bbox,
              cbox,
              advanceWidth,
              isLigature,
              isMark,
              xAdvance,
              letterSpacing,
            });
          }

          xAdvance += run.positions[i].xAdvance + letterSpacing;
          i++;
        }
        const spacesAtTheEnd = segment.text.length - segment.text.trimEnd().length;
      }
    } else {
      // Emoji segment

      const emojiSvg = await renderEmoji(segment.text);

      if (emojiSvg) {
        const emojiWidth = getEmojiWidth(segment.text, font.unitsPerEm);

        glyphs.push({
          type: 'inline-svg',
          svg: emojiSvg,
          width: emojiWidth,
          height: font.unitsPerEm,
          baselineOffset: -font.descent * 0.5,
          xAdvance,
          yOffset: 0,
          letterSpacing,
        });

        xAdvance += emojiWidth + letterSpacing;
      }
    }
  }

  return {
    glyphs,
    bbox: font.bbox,
    ascent: font.ascent,
    descent: font.descent,
    unitsPerEm: font.unitsPerEm,
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

export async function textToPath(
  text: string,
  fontData: Uint8Array,
  fontSize: number,
  letterSpacing: number,
  alignmentBaseline: 'hanging' | 'middle' | 'baseline',
  concreteWeight: number | string | undefined,
  format: TextFormat,
  stylesheet: string,
  spanStyle?: string,
  isDebug = false
) {
  const { glyphs, ascent, descent, unitsPerEm, bbox } = await generateSvgPathRules(
    text,
    fontData,
    letterSpacing,
    fontSize,
    concreteWeight,
    format,
    stylesheet,
    spanStyle,
    isDebug
  );

  const scale = fontSize / unitsPerEm;

  for (const glyph of glyphs) {
    if (glyph.type === 'path') {
      glyph.path.transform({ scale });
      glyph.xAdvance = glyph.xAdvance * scale;
      glyph.advanceWidth *= scale;
      glyph.bbox = scaleFontkitBBox(glyph.bbox, scale);
      glyph.cbox = scaleFontkitBBox(glyph.cbox, scale);

      if (alignmentBaseline === 'hanging') {
        glyph.path.transform({ translate: [0, ascent * scale] });
      } else if (alignmentBaseline === 'middle') {
        glyph.path.transform({ translate: [0, ((ascent + descent) / 2) * scale] });
      }
    } else if (glyph.type === 'inline-svg') {
      glyph.width = glyph.width * scale;
      glyph.height = glyph.height * scale;
      glyph.xAdvance = glyph.xAdvance * scale;

      if (alignmentBaseline === 'hanging') {
        glyph.yOffset = (glyph.baselineOffset + ascent) * scale;
      } else if (alignmentBaseline === 'middle') {
        glyph.yOffset = (glyph.baselineOffset + (ascent + descent) / 2) * scale;
      } else {
        glyph.yOffset = 0 + glyph.baselineOffset * scale;
      }
    }
  }

  return { glyphs, ascent, descent, unitsPerEm, fontBBox: bbox };
}

export function combineBBoxes(bboxes: { x: number; y: number; width: number; height: number }[]) {
  if (bboxes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bboxesAbs = bboxes.map(({ x, y, width, height }) => ({ left: x, top: y, right: x + width, bottom: y + height }));

  const accumulatedBBoxAbs = bboxesAbs.reduce((acc, { left, top, right, bottom }) => {
    return {
      left: Math.min(acc.left, left),
      top: Math.min(acc.top, top),
      right: Math.max(acc.right, right),
      bottom: Math.max(acc.bottom, bottom),
    };
  }, bboxesAbs[0]);

  return {
    x: accumulatedBBoxAbs.left,
    y: accumulatedBBoxAbs.top,
    width: accumulatedBBoxAbs.right - accumulatedBBoxAbs.left,
    height: accumulatedBBoxAbs.bottom - accumulatedBBoxAbs.top,
  };
}

export type SpanDescriptor = {
  format: TextFormat;
  text: string;
  dx?: number;
  dy?: number;
  x?: number;
  y?: number;
  style?: string;
  tspan?: SVGTSpanElement;
};

export function textToSpans(text: SVGTextElement, isDebug = false) {
  const textBaseFormat = getTextFormat(text);

  const styleAttr = text.getAttribute('style');
  const inlineStyleEntries = styleAttr ? parseInlineStyle(styleAttr) : [];

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
        const styleAttr = tspan.getAttribute('style');
        const inlineStyleEntriesTspan = styleAttr ? parseInlineStyle(styleAttr) : [];
        const combinedStyleEntries = [...inlineStyleEntries, ...inlineStyleEntriesTspan];
        const styleString = combinedStyleEntries
          .map((entry) => {
            if (entry.type === 'declaration') {
              return `${entry.property}: ${entry.value};`;
            }
            return '';
          })
          .join(' ');
        return {
          tspan,
          format: getTextFormat(tspan, textBaseFormat),
          text: tspan.textContent?.trim() ?? '',
          dx,
          dy,
          x,
          y,
          style: styleString,
        };
      }
    })
    .filter((span) => span?.text !== undefined && span.text.length > 0) as SpanDescriptor[];

  const x = ensureNumber(text.getAttribute('x') ?? '0') ?? 0;
  const y = ensureNumber(text.getAttribute('y') ?? '0') ?? 0;

  return {
    spans,
    x,
    y,
  };
}

export type RenderedSegment = RenderedPathSegment | RenderedInlineSVGSegment;

export type RenderedPathSegment = {
  type: 'path';
  path: SVGPathCommander;
  bbox: { x: number; y: number; width: number; height: number };
};

export type RenderedInlineSVGSegment = {
  type: 'inline-svg';
  svg: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function renderTextSpans(
  stylesheet: string,
  spans: SpanDescriptor[],
  baseX: number,
  baseY: number,
  isDebug = false
) {
  let spanOffset = 0;

  let paths: {
    glyphBBoxes: { x: number; y: number; width: number; height: number }[];
    bbox: { x: number; y: number; width: number; height: number };
    segments: RenderedSegment[];
    style?: string;
    text: string;
    ascent: number;
    descent: number;
    unitsPerEm: number;
    fontBBox: fontkit.Glyph['bbox'];
  }[] = [];

  if (spans.length === 0) {
    return [];
  }

  console.log('renderTextSpans', spans);

  for (const span of spans) {
    const index = spans.indexOf(span);
    const { format } = span;

    const fontDec = getFontDeclaration(stylesheet, format.fontFamily, format.fontWeight, format.fontStyle);
    const needsSpaceAfter = index < spans.length - 1;

    const { glyphs, ascent, descent, unitsPerEm, fontBBox } = await textToPath(
      span.text,
      await resolveFontFile(fontDec.src),
      format.fontSize,
      format.letterSpacing,
      'baseline',
      format.fontWeight,
      format,
      stylesheet,
      span.style,
      isDebug
    );

    console.log('!!!!!!!', span.text);

    const marginRight = needsSpaceAfter
      ? await (async () => {
          const { glyphs } = await textToPath(
            '! !',
            await resolveFontFile(fontDec.src),
            format.fontSize,
            format.letterSpacing,
            'baseline',
            format.fontWeight,
            format,
            stylesheet,
            span.style,
            isDebug
          );

          const firstGlyph = glyphs[0] as PathGlyphSegment;
          const secondGlyph = glyphs[1] as PathGlyphSegment;
          const spaceWidth = secondGlyph.xAdvance - (firstGlyph.xAdvance + firstGlyph.advanceWidth);
          return spaceWidth;
        })()
      : 0;

    const dx = span.dx ?? (span.x !== undefined ? span.x - (baseX + spanOffset) : 0);
    const dy = span.dy ?? (span.y !== undefined ? span.y - baseY : 0);

    const segments: RenderedSegment[] = [];
    const glyphBBoxes: { x: number; y: number; width: number; height: number }[] = [];

    glyphs.forEach((glyph) => {
      if (glyph.type === 'path') {
        const transformedPath = glyph.path.transform({
          translate: [baseX + dx + spanOffset + glyph.xAdvance, baseY + dy],
        });

        segments.push({
          type: 'path',
          path: transformedPath,
          bbox: {
            x: transformedPath.bbox.x,
            y: transformedPath.bbox.y,
            width: transformedPath.bbox.width,
            height: transformedPath.bbox.height,
          },
        });

        glyphBBoxes.push({
          x: transformedPath.bbox.x,
          y: transformedPath.bbox.y,
          width: transformedPath.bbox.width,
          height: transformedPath.bbox.height,
        });
      } else if (glyph.type === 'inline-svg') {
        const x = baseX + dx + spanOffset + glyph.xAdvance;
        const y = baseY + dy + glyph.yOffset;

        segments.push({
          type: 'inline-svg',
          svg: glyph.svg,
          x,
          y,
          width: glyph.width,
          height: glyph.height,
        });

        glyphBBoxes.push({
          x,
          y: y - glyph.height, // SVG y-Koordinate ist oben, Glyph baseline ist unten
          width: glyph.width,
          height: glyph.height,
        });
      }
    });

    // Entferne das Leerzeichen am Ende, falls nötig
    // const finalSegments = needsSpaceAfter ? segments.slice(0, -1) : segments;
    // const finalGlyphBBoxes = needsSpaceAfter ? glyphBBoxes.slice(0, -1) : glyphBBoxes;

    const bbox = combineBBoxes(glyphBBoxes);

    // Berechne die Breite des Spans einschließlich des Abstands zum nächsten Span
    let spanWidth = bbox.width + marginRight;

    spanOffset += dx + spanWidth;

    paths.push({
      glyphBBoxes: glyphBBoxes,
      bbox,
      segments: segments,
      style: span.style,
      text: span.text + (needsSpaceAfter ? ' ' : ''),
      ascent,
      descent,
      unitsPerEm,
      fontBBox,
    });
  }

  return paths;
}

export async function textElementToPath(text: SVGTextElement, rootSVG: SVGSVGElement) {
  const isDebug = text.textContent === '[Fòdšz•Īn] Substantiv - deutsch';

  const stylesheet = Array.from(rootSVG.querySelectorAll('style'))
    .map((style) => style.textContent)
    .join('\n');

  const { spans, x: baseX, y: baseY } = textToSpans(text);
  const paths = await renderTextSpans(stylesheet, spans, baseX, baseY, isDebug);

  return {
    paths: paths.map((p) => ({ segments: p.segments, style: p.style })),
    text: paths.map((p) => p.text).join(''),
  };
}

function getSVGUrlValue(element: Element, propertyName: string) {
  const propValStr = getSVGValue(element, propertyName);
  if (!propValStr) {
    return undefined;
  }
  const url = propValStr.match(/url\(\s*(?:['"])?([^'")\s]+)(?:['"])?\s*\)/i)?.[1];
  if (!url) {
    return undefined;
  }
  return url;
}
