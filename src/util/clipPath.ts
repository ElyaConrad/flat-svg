import { TransformObject } from 'svg-path-commander';
import { comboundPaths, getShapeElementsAndGroupsAndPaths, SVGShape } from './booleanPath.js';
import { ensureNumber, getTransformationsInOrder, getTransformOrigin, PartialTransform, TransformWithOrigin } from './css.js';
import SVGPathCommander from 'svg-path-commander';
import intersect from 'path-intersection';

export function getClipPath(selector: string, svg: SVGSVGElement) {
  const element = svg.getElementById(selector.slice(1));
  if (!element || element.nodeName !== 'clipPath') {
    return undefined;
  }
  const clipPathElement = element as SVGClipPathElement;

  //const shapes = Array.from(clipPathElement.querySelectorAll('circle, rect, polygon, polyline, ellipse, path, line'));

  return comboundPaths(Array.from(clipPathElement.children));
}

function collectShapes(element: SVGClipPathElement | SVGGElement, transforms: TransformWithOrigin[]): SVGPathCommander[] {
  const shapes = getShapeElementsAndGroupsAndPaths(element.children);
  return shapes
    .map((shape) => {
      const transformOrigin = getTransformOrigin(shape as SVGGElement);
      const currTransforms = getTransformationsInOrder(shape as SVGGElement).map((transform) => ({ ...transform, origin: transformOrigin } as TransformWithOrigin));
      const allCurrentTransforms = [...transforms, ...currTransforms];
      if (shape.nodeName === 'g') {
        return collectShapes(shape as SVGGElement, allCurrentTransforms);
      } else if (shape.nodeName === 'path') {
        const d = (shape as SVGPathElement).getAttribute('d')!;
        const path = new SVGPathCommander(d).toAbsolute();
        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'rect') {
        const rect = shape as SVGRectElement;
        const x = ensureNumber(rect.getAttribute('x') ?? undefined) ?? 0;
        const y = ensureNumber(rect.getAttribute('y') ?? undefined) ?? 0;
        const width = ensureNumber(rect.getAttribute('width') ?? undefined) ?? 0;
        const height = ensureNumber(rect.getAttribute('height') ?? undefined) ?? 0;
        const rx = ensureNumber(rect.getAttribute('rx') ?? undefined) ?? 0;
        const ry = ensureNumber(rect.getAttribute('ry') ?? undefined) ?? 0;

        const path = new SVGPathCommander(`M ${x + rx},${y} H ${x + width - rx} Q ${x + width},${y} ${x + width},${y + ry} V ${y + height - ry} Q ${x + width},${y + height} ${x + width - rx},${y + height} H ${x + rx} Q ${x},${y + height} ${x},${y + height - ry} V ${y + ry} Q ${x},${y} ${x + rx},${y} Z`).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'ellipse') {
        const ellipse = shape as SVGEllipseElement;
        const cx = ensureNumber(ellipse.getAttribute('cx') ?? undefined) ?? 0;
        const cy = ensureNumber(ellipse.getAttribute('cy') ?? undefined) ?? 0;
        const rx = ensureNumber(ellipse.getAttribute('rx') ?? undefined) ?? 0;
        const ry = ensureNumber(ellipse.getAttribute('ry') ?? undefined) ?? 0;

        const path = new SVGPathCommander(`M ${cx + rx}, ${cy} A ${rx},${ry} 0 1,0 ${cx - rx},${cy} A ${rx},${ry} 0 1,0 ${cx + rx},${cy}`).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'circle') {
        const circle = shape as SVGCircleElement;
        const cx = ensureNumber(circle.getAttribute('cx') ?? undefined) ?? 0;
        const cy = ensureNumber(circle.getAttribute('cy') ?? undefined) ?? 0;
        const r = ensureNumber(circle.getAttribute('r') ?? undefined) ?? 0;

        const path = new SVGPathCommander(`M ${cx + r}, ${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy}`).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'line') {
        const line = shape as SVGLineElement;
        const x1 = ensureNumber(line.getAttribute('x1') ?? undefined) ?? 0;
        const y1 = ensureNumber(line.getAttribute('y1') ?? undefined) ?? 0;
        const x2 = ensureNumber(line.getAttribute('x2') ?? undefined) ?? 0;
        const y2 = ensureNumber(line.getAttribute('y2') ?? undefined) ?? 0;

        const path = new SVGPathCommander(`M ${x1},${y1} L ${x2},${y2}`).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'polygon') {
        const polygon = shape as SVGPolygonElement;
        const points = (polygon.getAttribute('points') ?? '').split(' ').map((point) => {
          const [x, y] = point.split(',').map(ensureNumber);
          return { x: x ?? 0, y: y ?? 0 };
        });
        const path = new SVGPathCommander(
          `M ${points[0].x},${points[0].y} ${Array.from(points)
            .slice(1)
            .map((point) => `L ${point.x},${point.y}`)
            .join(' ')} Z`
        ).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else if (shape.nodeName === 'polyline') {
        const polyline = shape as SVGPolylineElement;
        const points = (polyline.getAttribute('points') ?? '').split(' ').map((point) => {
          const [x, y] = point.split(',').map(ensureNumber);
          return { x: x ?? 0, y: y ?? 0 };
        });
        const path = new SVGPathCommander(
          `M ${points[0].x},${points[0].y} ${Array.from(points)
            .slice(1)
            .map((point) => `L ${point.x},${point.y}`)
            .join(' ')}`
        ).toAbsolute();

        return [allCurrentTransforms.reduce((acc, transform) => acc.transform(transform), path)];
      } else {
        return null;
      }
    })
    .filter((v) => v !== null)
    .flat();
}
// This a ugly workaround but here's why:
// paper.Path will destroy paths that have subpaths that intersect with each other
// So we're trying to combine all paths into one path if they don't intersect
// If this is the case, the recursive clip path resolver will take the simple clip path into account until it gets intersected by a another clip path (which makes the usage of paper.js be required)
export function getSimpleClipPath(selector: string, svg: SVGSVGElement) {
  const element = svg.getElementById(selector.slice(1));
  if (!element || element.nodeName !== 'clipPath') {
    return undefined;
  }
  const clipPathElement = element as SVGClipPathElement;
  const allPaths = collectShapes(clipPathElement, []);

  if (allPaths.length === 0) {
    return undefined;
  }

  if (allPaths.length === 1) {
    return allPaths[0];
  }

  let anyIntersection = false;
  const simpleSinglePath = allPaths.slice(1).reduce((acc, path) => {
    const d = path.toString();
    if (intersect(acc, d).length > 0) {
      anyIntersection = true;
    }
    if (acc.endsWith('Z')) {
      return `${acc} ${d}`;
    } else {
      return `${acc} Z ${d}`;
    }
  }, allPaths[0].toString());

  if (!anyIntersection) {
    const newPath = new SVGPathCommander(simpleSinglePath).toAbsolute();
    return newPath;
  }
}
