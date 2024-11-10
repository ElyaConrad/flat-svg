import formatXml from 'xml-formatter';
import { ensureNumber, getElementFilter, getUniqueID, IdentityMatrix, SimpleElementShape } from '../main.js';
import { JSDOM } from 'jsdom';
import { arrayBufferToBase64 } from './arrayBuffer.js';

export type RasterImage = {
  left: number;
  top: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
};
export type ColorMatrix = number[];

export type RasterizeFunction = (svg: SVGSVGElement) => RasterImage | undefined;
export type ApplyColorMatrixFunction = (data: ArrayBuffer, matrix: ColorMatrix) => ArrayBuffer;

function multiplyColorMatrices(m1: ColorMatrix, m2: ColorMatrix): ColorMatrix {
  const result: ColorMatrix = Array(20).fill(0);

  // Multipliziere Zeilen von m1 mit Spalten von m2
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      if (col < 4) {
        // Berechnung der Transformationswerte (RGB und Alpha)
        result[row * 5 + col] = m1[row * 5 + 0] * m2[0 * 5 + col] + m1[row * 5 + 1] * m2[1 * 5 + col] + m1[row * 5 + 2] * m2[2 * 5 + col] + m1[row * 5 + 3] * m2[3 * 5 + col];
      } else {
        // Berechnung des Offsets in der letzten Spalte
        result[row * 5 + col] = m1[row * 5 + 0] * m2[0 * 5 + col] + m1[row * 5 + 1] * m2[1 * 5 + col] + m1[row * 5 + 2] * m2[2 * 5 + col] + m1[row * 5 + 3] * m2[3 * 5 + col] + m1[row * 5 + 4]; // Addiere Offset aus m1
      }
    }
  }

  // Die letzte Zeile bleibt [0, 0, 0, 1, 0] für die Alpha-Komponente
  result[15] = 0;
  result[16] = 0;
  result[17] = 0;
  result[18] = 1;
  result[19] = 0;

  return result;
}

// function multiplyColorMatrices(m1: ColorMatrix, m2: ColorMatrix): ColorMatrix {
//   const result: ColorMatrix = Array(20).fill(0);

//   // Multipliziere Zeilen von m1 mit Spalten von m2
//   for (let row = 0; row < 4; row++) {
//     for (let col = 0; col < 5; col++) {
//       // Berechnung für die RGB- und Alpha-Komponenten
//       result[row * 5 + col] = m1[row * 5 + 0] * m2[0 * 5 + col] + m1[row * 5 + 1] * m2[1 * 5 + col] + m1[row * 5 + 2] * m2[2 * 5 + col] + m1[row * 5 + 3] * m2[3 * 5 + col] + (col === 4 ? m1[row * 5 + 4] + m2[row * 5 + 4] : 0); // Offsets korrekt addieren, ohne mit 255 zu multiplizieren
//     }
//   }

//   // Die letzte Zeile bleibt [0, 0, 0, 1, 0] für die Alpha-Komponente
//   result[15] = 0;
//   result[16] = 0;
//   result[17] = 0;
//   result[18] = 1;
//   result[19] = 0;

//   return result;
// }

// function multiplyColorMatrices(m1: ColorMatrix, m2: ColorMatrix): ColorMatrix {
//   const result: ColorMatrix = Array(20).fill(0);

//   for (let row = 0; row < 4; row++) {
//     for (let col = 0; col < 5; col++) {
//       result[row * 5 + col] = m1[row * 5 + 0] * m2[0 * 5 + col] + m1[row * 5 + 1] * m2[1 * 5 + col] + m1[row * 5 + 2] * m2[2 * 5 + col] + m1[row * 5 + 3] * m2[3 * 5 + col] + (col === 4 ? m1[row * 5 + 4] : 0); // Addiere Offset nur in der letzten Spalte
//     }
//   }

//   // Die letzte Zeile der Matrix ist immer [0, 0, 0, 1, 0] für die Alpha-Komponente
//   result[15] = 0;
//   result[16] = 0;
//   result[17] = 0;
//   result[18] = 1;
//   result[19] = 0;

//   return result;
// }
export function combineColorMatrices(matrices: ColorMatrix[]): ColorMatrix {
  return matrices.reduce((combined, matrix) => multiplyColorMatrices(combined, matrix), [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
}

type FeFunc = {
  type: string;
  slope?: number;
  intercept?: number;
};

function createColorMatrixFromComponentTransfer(feFuncR: FeFunc, feFuncG: FeFunc, feFuncB: FeFunc): ColorMatrix {
  // Standardwerte für slope und intercept
  const slopeR = feFuncR.slope ?? 1;
  const interceptR = feFuncR.intercept ?? 0;

  const slopeG = feFuncG.slope ?? 1;
  const interceptG = feFuncG.intercept ?? 0;

  const slopeB = feFuncB.slope ?? 1;
  const interceptB = feFuncB.intercept ?? 0;

  // Erzeuge die Color-Matrix basierend auf den linearen Transformationen
  const colorMatrix: ColorMatrix = [slopeR, 0, 0, 0, interceptR * 255, 0, slopeG, 0, 0, interceptG * 255, 0, 0, slopeB, 0, interceptB * 255, 0, 0, 0, 1, 0];

  return colorMatrix;
}

export function getElementColorMatrices(element: Element, svg: SVGSVGElement) {
  const filter = getElementFilter(element);
  if (filter) {
    const filterElement = svg.getElementById(filter.slice(1));
    const colorMatrix = Array.from(filterElement?.children)
      .map((childElement) => {
        if (childElement.nodeName === 'feColorMatrix') {
          const colorMatrix =
            (childElement as SVGFEColorMatrixElement)
              .getAttribute('values')
              ?.split(' ')
              .map((v) => ensureNumber(v))
              .filter((n) => n !== undefined) ?? [];
          return colorMatrix;
        } else if (childElement.nodeName === 'feComponentTransfer') {
          const feFuncR = childElement.querySelector('feFuncR') as SVGFEFuncRElement;
          const feFuncG = childElement.querySelector('feFuncG') as SVGFEFuncRElement;
          const feFuncB = childElement.querySelector('feFuncB') as SVGFEFuncRElement;

          const r = feFuncR ? { type: feFuncR.getAttribute('type') ?? 'linear', slope: ensureNumber(feFuncR.getAttribute('slope') ?? undefined), intercept: ensureNumber(feFuncR.getAttribute('intercept') ?? undefined) } : { type: 'linear', slope: 1, intercept: 0 };
          const g = feFuncG ? { type: feFuncG.getAttribute('type') ?? 'linear', slope: ensureNumber(feFuncG.getAttribute('slope') ?? undefined), intercept: ensureNumber(feFuncG.getAttribute('intercept') ?? undefined) } : { type: 'linear', slope: 1, intercept: 0 };
          const b = feFuncB ? { type: feFuncB.getAttribute('type') ?? 'linear', slope: ensureNumber(feFuncB.getAttribute('slope') ?? undefined), intercept: ensureNumber(feFuncB.getAttribute('intercept') ?? undefined) } : { type: 'linear', slope: 1, intercept: 0 };
          return createColorMatrixFromComponentTransfer(r, g, b);
        } else {
          return undefined;
        }
      })
      .filter((matrix) => matrix !== undefined) as ColorMatrix[];

    return colorMatrix;
  } else {
    return [];
  }
}

export function rasterizeFilteredElements(elements: NodeListOf<Element>, svg: SVGSVGElement, document: Document, applyColorMatrix: ApplyColorMatrixFunction, rasterize: RasterizeFunction) {
  for (const element of Array.from(elements).reverse()) {
    const colorMatrices = getElementColorMatrices(element, svg);

    if (colorMatrices.length > 0) {
      const rasteredResult = rasterizeElement(element, svg, rasterize);

      if (!rasteredResult) {
        continue;
      }

      console.log('colorMatrices', element.nodeName, colorMatrices, combineColorMatrices(colorMatrices));

      const newBuffer = applyColorMatrix(rasteredResult.buffer, combineColorMatrices(colorMatrices));
      const newImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      newImage.setAttribute('x', rasteredResult.left.toString());
      newImage.setAttribute('y', rasteredResult.top.toString());
      newImage.setAttribute('width', rasteredResult.width.toString());
      newImage.setAttribute('height', rasteredResult.height.toString());
      newImage.setAttribute('href', `data:image/png;base64,${arrayBufferToBase64(newBuffer)}`);
      element.replaceWith(newImage);
    }
  }
}

export function rasterizeMasks(masks: string[], rootSVG: SVGSVGElement, currMatrix: paper.Matrix, rasterize: RasterizeFunction, applyColorMatrix: ApplyColorMatrixFunction | undefined, content: string) {
  const { document } = new JSDOM(rootSVG.outerHTML, {
    pretendToBeVisual: true,
    contentType: 'image/svg+xml',
  }).window;

  const svg = document.querySelector('svg') as SVGSVGElement;

  const allVisibleElements = Array.from(document.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
  const allNaturalMasks = Array.from(document.querySelectorAll('mask, clipPath'));
  const allNaturalFilters = Array.from(document.querySelectorAll('filter'));
  const allNaturalGradients = Array.from(document.querySelectorAll('linearGradient, radialGradient'));
  const allNaturalStyles = Array.from(document.querySelectorAll('style'));

  for (const element of [...allVisibleElements, ...allNaturalMasks]) {
    element.remove();
  }

  const globalFiltersDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalFiltersDefs.setAttribute('id', 'globalFilters');
  svg.appendChild(globalFiltersDefs);

  const globalGradientsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalGradientsDefs.setAttribute('id', 'globalGradients');
  svg.appendChild(globalGradientsDefs);

  const globalStylesDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalStylesDefs.setAttribute('id', 'globalStyles');
  svg.appendChild(globalStylesDefs);

  const globalNaturalMasksAndClipsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalNaturalMasksAndClipsDefs.setAttribute('id', 'globalNaturalMasksAndClips');
  svg.appendChild(globalNaturalMasksAndClipsDefs);

  for (const filter of allNaturalFilters) {
    globalFiltersDefs.appendChild(filter.cloneNode(true));
  }

  for (const gradient of allNaturalGradients) {
    globalGradientsDefs.appendChild(gradient.cloneNode(true));
  }

  for (const style of allNaturalStyles) {
    globalStylesDefs.appendChild(style.cloneNode(true));
  }

  for (const mask of allNaturalMasks) {
    globalNaturalMasksAndClipsDefs.appendChild(mask.cloneNode(true));
  }

  const globalMasksDef = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalMasksDef.setAttribute('id', 'globalMasks');
  svg.appendChild(globalMasksDef);

  let wrappingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const invertedMatrix = currMatrix.invert();
  wrappingGroup.style.transform = `matrix(${invertedMatrix.a}, ${invertedMatrix.b}, ${invertedMatrix.c}, ${invertedMatrix.d}, ${invertedMatrix.tx}, ${invertedMatrix.ty})`;

  svg.appendChild(wrappingGroup);

  for (const mask of masks) {
    const freshId = getUniqueID();
    const newMaskElement = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    newMaskElement.setAttribute('id', freshId);
    newMaskElement.innerHTML = mask;
    globalMasksDef.appendChild(newMaskElement);
    const maskingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    maskingGroup.setAttribute('style', `mask: url(#${freshId});`);
    wrappingGroup.appendChild(maskingGroup);
    wrappingGroup = maskingGroup;
  }

  wrappingGroup.innerHTML = content;
  if (applyColorMatrix) {
    rasterizeFilteredElements(globalMasksDef.querySelectorAll('*'), svg, document, applyColorMatrix, rasterize);
    //rasterizeFilteredElements(wrappingGroup.querySelectorAll('*'), svg, document, applyColorMatrix, rasterize);
  }

  return rasterize(svg);
}

export function rasterizeElement(element: Element, rootSVG: SVGSVGElement, rasterize: RasterizeFunction) {
  const { document } = new JSDOM(rootSVG.outerHTML, {
    pretendToBeVisual: true,
    contentType: 'image/svg+xml',
  }).window;

  const svg = document.querySelector('svg') as SVGSVGElement;

  const allVisibleElements = Array.from(document.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
  const allNaturalMasks = Array.from(document.querySelectorAll('mask, clipPath'));
  const allNaturalFilters = Array.from(document.querySelectorAll('filter'));
  const allNaturalGradients = Array.from(document.querySelectorAll('linearGradient, radialGradient'));
  const allNaturalStyles = Array.from(document.querySelectorAll('style'));

  for (const element of [...allVisibleElements, ...allNaturalMasks]) {
    element.remove();
  }

  const globalFiltersDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalFiltersDefs.setAttribute('id', 'globalFilters');
  svg.appendChild(globalFiltersDefs);

  const globalGradientsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalGradientsDefs.setAttribute('id', 'globalGradients');
  svg.appendChild(globalGradientsDefs);

  const globalStylesDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalStylesDefs.setAttribute('id', 'globalStyles');
  svg.appendChild(globalStylesDefs);

  const globalNaturalMasksAndClipsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalNaturalMasksAndClipsDefs.setAttribute('id', 'globalNaturalMasksAndClips');
  svg.appendChild(globalNaturalMasksAndClipsDefs);

  for (const filter of allNaturalFilters) {
    globalFiltersDefs.appendChild(filter.cloneNode(true));
  }

  for (const gradient of allNaturalGradients) {
    globalGradientsDefs.appendChild(gradient.cloneNode(true));
  }

  for (const style of allNaturalStyles) {
    globalStylesDefs.appendChild(style.cloneNode(true));
  }

  for (const mask of allNaturalMasks) {
    globalNaturalMasksAndClipsDefs.appendChild(mask.cloneNode(true));
  }

  svg.innerHTML += element.outerHTML;

  return rasterize(svg);
}
