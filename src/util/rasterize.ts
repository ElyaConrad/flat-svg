import { ensureNumber, getElementFilter, getElementMask, getUniqueID, IdentityMatrix, SimpleElementShape } from '../main.js';
import { arrayBufferToBase64 } from './arrayBuffer.js';

import { parseDOM } from './xml.js';

export type RasterImage = {
  left: number;
  top: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
};
export type ColorMatrix = number[];

export type RasterizeFunction = (svg: SVGSVGElement) => Promise<RasterImage | undefined>;
export type ApplyColorMatrixFunction = (data: ArrayBuffer, matrices: ColorMatrix[]) => Promise<ArrayBuffer>;

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

export async function rasterizeMasks(masks: string[], rootSVG: SVGSVGElement, currMatrix: paper.Matrix, rasterize: RasterizeFunction, applyColorMatrix: ApplyColorMatrixFunction | undefined, content: string) {
  const document = parseDOM(rootSVG.outerHTML, 'image/svg+xml');
  const svg = document.querySelector('svg') as SVGSVGElement;

  const allVisibleElements = Array.from(document.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
  const allDefs = Array.from(document.querySelectorAll('defs'));

  for (const element of [...allVisibleElements]) {
    element.remove();
  }

  for (const def of allDefs) {
    svg.appendChild(def);
  }

  const globalMasksDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  globalMasksDefs.setAttribute('id', 'globalMasks');
  svg.appendChild(globalMasksDefs);

  let wrappingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrappingGroup.setAttribute('class', 'contents-wrapper');
  svg.appendChild(wrappingGroup);

  for (const mask of masks) {
    const freshId = getUniqueID();
    const newMaskElement = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    newMaskElement.setAttribute('id', freshId);
    newMaskElement.insertAdjacentHTML('beforeend', mask);
    globalMasksDefs.appendChild(newMaskElement);
    const maskingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    maskingGroup.setAttribute('style', `mask: url(#${freshId});`);
    wrappingGroup.appendChild(maskingGroup);
    wrappingGroup = maskingGroup;
  }
  // console.log('SET CONTENT', content.slice(0, 100));

  const replaceElementWithColorMatricedRaster = async (element: Element) => {
    const colorMatrices = getElementColorMatrices(element, svg);
    if (colorMatrices.length === 0) {
      return;
    }
    const rasteredResult = await rasterizeElementWithColorMatrices(element, svg, colorMatrices, rasterize, applyColorMatrix!);
    if (rasteredResult === null) {
      return;
    }
    const newImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    newImage.setAttribute('x', rasteredResult.left.toString());
    newImage.setAttribute('y', rasteredResult.top.toString());
    newImage.setAttribute('width', rasteredResult.width.toString());
    newImage.setAttribute('height', rasteredResult.height.toString());
    newImage.setAttribute('href', `data:image/png;base64,${arrayBufferToBase64(rasteredResult.buffer)}`);
    element.replaceWith(newImage);
  };

  if (applyColorMatrix) {
    await Promise.all(Array.from(globalMasksDefs.querySelectorAll('*')).reverse().map(replaceElementWithColorMatricedRaster));
    await Promise.all(Array.from(wrappingGroup.querySelectorAll('*')).reverse().map(replaceElementWithColorMatricedRaster));
  }

  wrappingGroup.insertAdjacentHTML('beforeend', content);

  return rasterize(svg);
}

export async function rasterizeElementWithColorMatrices(element: Element, rootSVG: SVGSVGElement, colorMatrices: ColorMatrix[], rasterize: RasterizeFunction, applyColorMatrix: ApplyColorMatrixFunction) {
  if (colorMatrices.length === 0) {
    return null;
  }
  const clonedDoc = parseDOM(rootSVG.outerHTML, 'image/svg+xml');
  const clonedSVG = clonedDoc.querySelector('svg') as SVGSVGElement;
  const allVisibleElements = Array.from(clonedDoc.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
  const allDefs = Array.from(clonedDoc.querySelectorAll('defs'));
  for (const vElement of [...allVisibleElements]) {
    vElement.remove();
  }
  for (const def of allDefs) {
    clonedSVG.appendChild(def);
  }
  clonedSVG.insertAdjacentHTML('beforeend', element.outerHTML);

  const rasteredResult = await rasterize(clonedSVG);
  if (!rasteredResult) {
    return null;
  }

  return {
    left: rasteredResult.left,
    top: rasteredResult.top,
    width: rasteredResult.width,
    height: rasteredResult.height,
    buffer: await applyColorMatrix(rasteredResult.buffer, colorMatrices),
  };
}

// export async function rasterizeElement(element: Element, rootSVG: SVGSVGElement, rasterize: RasterizeFunction) {
//   const document = parseDOM(rootSVG.outerHTML, 'image/svg+xml');
//   const svg = document.querySelector('svg') as SVGSVGElement;

//   const allVisibleElements = Array.from(document.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
//   const allNaturalMasks = Array.from(document.querySelectorAll('mask, clipPath'));
//   const allNaturalFilters = Array.from(document.querySelectorAll('filter'));
//   const allNaturalGradients = Array.from(document.querySelectorAll('linearGradient, radialGradient'));
//   const allNaturalStyles = Array.from(document.querySelectorAll('style'));

//   for (const element of [...allVisibleElements, ...allNaturalMasks]) {
//     element.remove();
//   }

//   const globalFiltersDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
//   globalFiltersDefs.setAttribute('id', 'globalFilters');
//   svg.appendChild(globalFiltersDefs);

//   const globalGradientsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
//   globalGradientsDefs.setAttribute('id', 'globalGradients');
//   svg.appendChild(globalGradientsDefs);

//   const globalStylesDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
//   globalStylesDefs.setAttribute('id', 'globalStyles');
//   svg.appendChild(globalStylesDefs);

//   const globalNaturalMasksAndClipsDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
//   globalNaturalMasksAndClipsDefs.setAttribute('id', 'globalNaturalMasksAndClips');
//   svg.appendChild(globalNaturalMasksAndClipsDefs);

//   for (const filter of allNaturalFilters) {
//     globalFiltersDefs.appendChild(filter.cloneNode(true));
//   }

//   for (const gradient of allNaturalGradients) {
//     globalGradientsDefs.appendChild(gradient.cloneNode(true));
//   }

//   for (const style of allNaturalStyles) {
//     globalStylesDefs.appendChild(style.cloneNode(true));
//   }

//   for (const mask of allNaturalMasks) {
//     globalNaturalMasksAndClipsDefs.appendChild(mask.cloneNode(true));
//   }

//   svg.insertAdjacentHTML('beforeend', element.outerHTML);

//   return await rasterize(svg);
// }
