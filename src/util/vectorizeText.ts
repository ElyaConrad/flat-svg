import { getAllFontDeclarations, resolveFontFile, textIsInUnicodeRange } from './resolveFonts';
import { TextFormat } from './textToPath';
// import { ImageTracerBrowser, Options } from '@image-tracer-ts/browser';

async function loadFontsForCanvas(cssData: string, textsToRender: string[] = []): Promise<void> {
  const declarations = getAllFontDeclarations(cssData);

  // Filtere relevante Schriften basierend auf den zu rendernden Texten
  const relevantDeclarations =
    textsToRender.length > 0
      ? declarations.filter((decl) =>
          textsToRender.some((text) => !decl.unicodeRange || textIsInUnicodeRange(text, decl.unicodeRange))
        )
      : declarations;

  const fontLoadPromises = relevantDeclarations.map(async (decl) => {
    if (!decl.src) return;

    try {
      // Font-Datei laden
      const fontData = await resolveFontFile(decl.src);

      // FontFace erstellen
      const fontWeight =
        decl.fontWeight?.type === 'static'
          ? decl.fontWeight.value.toString()
          : decl.fontWeight?.type === 'range'
          ? `${decl.fontWeight.min} ${decl.fontWeight.max}`
          : 'normal';

      const fontFace = new FontFace(decl.fontFamily, fontData as any, {
        weight: fontWeight,
        style: decl.fontStyle || 'normal',
        unicodeRange: decl.unicodeRange,
      });

      // Font laden und zum document hinzufügen
      await fontFace.load();
      (document.fonts as any).add(fontFace);

      // console.log(`✓ Loaded: ${decl.fontFamily} ${fontWeight} ${decl.fontStyle || 'normal'}`);
    } catch (error) {
      console.warn(`✗ Failed to load font: ${decl.fontFamily}`, error);
    }
  });

  await Promise.all(fontLoadPromises);

  // Warte bis alle Fonts wirklich verfügbar sind
  await document.fonts.ready;
}

function getTextMetrics(text: string, format: TextFormat) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  context.font = `${format.fontWeight || 'normal'} ${format.fontSize}px ${format.fontFamily}`;
  const metrics = context.measureText(text);
  return metrics;
}

export type RasterizationResult = {
  dataUrl: string;
  width: number;
  height: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;
  textBaseline: 'alphabetic' | 'top' | 'hanging' | 'middle' | 'ideographic' | 'bottom';
};

const textRasterizationCache = new Map<string, RasterizationResult>();

export async function rasterizeText(
  text: string,
  format: TextFormat,
  stylesheet: string,
  fill: string,
  stroke: string,
  strokeWidth: number
) {
  const cacheKey = `${text}|${format.fontFamily}|${format.fontSize}|${format.fontWeight}|${fill}|${stroke}|${strokeWidth}`;

  if (textRasterizationCache.has(cacheKey)) {
    return textRasterizationCache.get(cacheKey)!;
  } else {
    const canvas = document.createElement('canvas');
    const metrics = getTextMetrics(text, format);
    // console.log(text, format.fontSize, metrics);

    canvas.width = metrics.width;
    canvas.height = (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) * 1.2;
    const context = canvas.getContext('2d')!;

    await loadFontsForCanvas(stylesheet, [text]);

    context.font = `${format.fontWeight || 'normal'} ${format.fontSize}px ${format.fontFamily}`;
    // console.log('context.font', context.font);

    context.textBaseline = 'alphabetic';

    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth;

    context.fillText(`${text}`, 0, metrics.fontBoundingBoxAscent);
    if (stroke && strokeWidth > 0) {
      context.strokeText(`${text}`, 0, metrics.fontBoundingBoxAscent);
    }

    // const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    // const tracer = new ImageTracerBrowser();
    // const result = tracer.traceImageToSvg(imageData);

    // console.log('result', result);

    //   canvas.style.width = '600px';

    const rasterizationResult: RasterizationResult = {
      dataUrl: canvas.toDataURL('image/png'),
      width: metrics.width,
      height: canvas.height,
      fontBoundingBoxAscent: metrics.fontBoundingBoxAscent,
      fontBoundingBoxDescent: metrics.fontBoundingBoxDescent,
      textBaseline: 'alphabetic',
    };
    textRasterizationCache.set(cacheKey, rasterizationResult);
    return rasterizationResult;
  }
}
