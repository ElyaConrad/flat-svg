import formatXml from 'xml-formatter';
import { getUniqueID } from '../main.js';
import { JSDOM } from 'jsdom';

export type RasterizeFunction = (svg: SVGSVGElement) =>
  | {
      left: number;
      top: number;
      width: number;
      height: number;
      buffer: ArrayBuffer;
    }
  | undefined;

export function rasterizeMasks(masks: string[], rootSVG: SVGSVGElement, currMatrix: paper.Matrix, rasterize: RasterizeFunction) {
  const dom = new JSDOM(rootSVG.outerHTML, { contentType: 'image/svg+xml' });
  const document = dom.window.document;

  const svg = document.querySelector('svg') as SVGSVGElement;

  const allVisibleElements = Array.from(document.querySelectorAll('*')).filter((element) => element.closest('defs') === null);
  const allNaturalMasks = Array.from(document.querySelectorAll('mask, clipPath'));

  for (const element of [...allVisibleElements, ...allNaturalMasks]) {
    element.remove();
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

  const baseShape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  baseShape.setAttribute('x', '0%');
  baseShape.setAttribute('y', '0%');
  baseShape.setAttribute('width', '100%');
  baseShape.setAttribute('height', '100%');
  baseShape.setAttribute('fill', 'white');

  wrappingGroup.appendChild(baseShape);

  return rasterize(svg);
}
