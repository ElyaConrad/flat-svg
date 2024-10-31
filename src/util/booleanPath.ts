import { getAttrs } from '../helpers.js';
import { getTransformationsInOrder, getTransformOrigin } from './css.js';
import paper from 'paper';

paper.setup(new paper.Size(1080, 1080));

export type SVGShapeOrGroup = SVGRectElement | SVGCircleElement | SVGEllipseElement | SVGPolygonElement | SVGPolylineElement | SVGLineElement | SVGGElement | SVGPathElement;

function getShapeElementsAndGroupsAndPaths(elements: HTMLCollection | Element[]): SVGShapeOrGroup[] {
  return Array.from(elements).filter((element) => {
    return element.nodeName === 'circle' || element.nodeName === 'rect' || element.nodeName === 'polygon' || element.nodeName === 'polyline' || element.nodeName === 'ellipse' || element.nodeName === 'g' || element.nodeName === 'path';
  }) as SVGShapeOrGroup[];
}

export function getPaperPathItem(element: SVGShapeOrGroup): paper.PathItem {
  const transformOrigin = getTransformOrigin(element);
  const transformations = getTransformationsInOrder(element);
  const pathItem = (() => {
    if (element.nodeName === 'circle') {
      const { cx, cy, r } = getAttrs(element, { cx: Number, cy: Number, r: Number });
      return new paper.Path.Circle(new paper.Point(cx, cy), r);
    } else if (element.nodeName === 'rect') {
      const { x, y, width, height, rx, ry } = getAttrs(element, { x: Number, y: Number, width: Number, height: Number, rx: Number, ry: Number });
      return new paper.Path.Rectangle(new paper.Rectangle(x, y, width, height), new paper.Size(rx, ry));
    } else if (element.nodeName === 'ellipse') {
      const { cx, cy, rx, ry } = getAttrs(element, { cx: Number, cy: Number, rx: Number, ry: Number });
      return new paper.Path.Ellipse(new paper.Rectangle(cx - rx, cy - ry, rx * 2, ry * 2));
    } else if (element.nodeName === 'polygon') {
      const points =
        element
          .getAttribute('points')
          ?.split(' ')
          .map((point) => point.split(',').map(Number)) ?? [];
      return new paper.Path(points);
    } else if (element.nodeName === 'polyline') {
      const points =
        element
          .getAttribute('points')
          ?.split(' ')
          .map((point) => point.split(',').map(Number)) ?? [];
      return new paper.Path(points);
    } else if (element.nodeName === 'path') {
      const d = element.getAttribute('d') ?? '';
      return new paper.Path(d);
    } else if (element.nodeName === 'line') {
      const { x1, y1, x2, y2 } = getAttrs(element, { x1: Number, y1: Number, x2: Number, y2: Number });
      return new paper.Path.Line(new paper.Point(x1, y1), new paper.Point(x2, y2));
    } else if (element.nodeName === 'g') {
      return unitePaths(getShapeElementsAndGroupsAndPaths(element.children));
    } else {
      throw new Error('Invalid element');
    }
  })();

  const originPoint = new paper.Point(transformOrigin[0], transformOrigin[1]);

  for (const transform of transformations.reverse()) {
    const matrix = new paper.Matrix();
    if (transform.translate) {
      matrix.translate(new paper.Point(transform.translate[0], transform.translate[1]));
    }
    if (transform.scale) {
      matrix.scale(transform.scale[0], transform.scale[1], originPoint);
    }
    if (transform.rotate) {
      matrix.rotate(transform.rotate, originPoint);
    }
    if (transform.skew) {
      const skewXRadians = (Math.PI / 180) * transform.skew[0];
      const skewYRadians = (Math.PI / 180) * transform.skew[1];
      matrix.skew(skewXRadians, skewYRadians, originPoint);
    }
    pathItem.transform(matrix);
  }

  return pathItem;
}

export function unitePaths(elements: SVGShapeOrGroup[]) {
  const allChildPaths = elements.map(getPaperPathItem);
  return allChildPaths.slice(1).reduce((unitedPath, currPath) => unitedPath.unite(currPath), allChildPaths[0]);
}

export function comboundPaths(elements: Element[]) {
  return unitePaths(getShapeElementsAndGroupsAndPaths(elements));
}
