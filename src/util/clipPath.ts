import { comboundPaths } from './booleanPath.js';

export function getClipPath(selector: string, svg: SVGSVGElement) {
  const element = svg.querySelector(selector);
  if (!element || element.nodeName !== 'clipPath') {
    return undefined;
  }
  const clipPathElement = element as SVGClipPathElement;

  //const shapes = Array.from(clipPathElement.querySelectorAll('circle, rect, polygon, polyline, ellipse, path, line'));

  return comboundPaths(Array.from(clipPathElement.children));
}
