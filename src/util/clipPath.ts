import { comboundPaths } from './booleanPath.js';

export function getClipPath(selector: string, svg: SVGSVGElement) {
  const element = svg.querySelector(selector);
  if (!element || element.nodeName !== 'clipPath') {
    return undefined;
  }
  const clipPathElement = element as SVGClipPathElement;
  return comboundPaths(Array.from(clipPathElement.children));
}
