// import { Path2D, PathOp } from '@napi-rs/canvas';
import { getAttrs } from '../helpers.js';
import { getTransformationsInOrder, getTransformOrigin } from './css.js';
import paper from 'paper';
import SVGPathCommander, { PathSegment } from 'svg-path-commander';
import { applyToPoint, fromObject } from 'transformation-matrix';

// paper.setup(new paper.Size(1080, 1080));
export type SVGShape = SVGRectElement | SVGCircleElement | SVGEllipseElement | SVGPolygonElement | SVGPolylineElement | SVGLineElement | SVGPathElement;
export type SVGShapeOrGroup = SVGShape | SVGGElement;

export function getShapeElementsAndGroupsAndPaths(elements: HTMLCollection | Element[]): SVGShapeOrGroup[] {
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
      matrix.skew(transform.skew[0], transform.skew[1], originPoint);
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

// v2

export function transformPath(path: SVGPathCommander, matrix: paper.Matrix) {
  const { a, b, c, d, tx, ty } = matrix;

  const absolutePath = path.toAbsolute();

  const _matrix = fromObject({ a, b, c, d, e: tx, f: ty });

  let lastPoint = { x: 0, y: 0 };
  const segments = absolutePath.segments.map((segment, index) => {
    const lastSegment = absolutePath.segments[index - 1] as PathSegment | undefined;
    const [command] = segment;

    if (command === 'M' || command === 'L') {
      const [, ...coords] = segment;
      const point = { x: coords[0], y: coords[1] };
      lastPoint = { x: point.x, y: point.y };
      const transformedPoint = applyToPoint(_matrix, point);
      return [command, transformedPoint.x, transformedPoint.y];
    } else if (command === 'H') {
      const [, ...coords] = segment;
      const point = { x: coords[0], y: lastPoint.y };
      lastPoint = { x: point.x, y: point.y };
      const transformedPoint = applyToPoint(_matrix, point);
      return ['L', transformedPoint.x, transformedPoint.y];
    } else if (command === 'V') {
      const [, ...coords] = segment;
      const point = { x: lastPoint.x, y: coords[0] };
      lastPoint = { x: point.x, y: point.y };
      const transformedPoint = applyToPoint(_matrix, point);
      return ['L', transformedPoint.x, transformedPoint.y];
    } else if (command === 'C') {
      const [, ...coords] = segment;
      const controlPoint1 = { x: coords[0], y: coords[1] };
      const controlPoint2 = { x: coords[2], y: coords[3] };
      const point = { x: coords[4], y: coords[5] };
      lastPoint = { x: point.x, y: point.y };
      const transformedControlPoint1 = applyToPoint(_matrix, controlPoint1);
      const transformedControlPoint2 = applyToPoint(_matrix, controlPoint2);
      const transformedPoint = applyToPoint(_matrix, point);
      return ['C', transformedControlPoint1.x, transformedControlPoint1.y, transformedControlPoint2.x, transformedControlPoint2.y, transformedPoint.x, transformedPoint.y];
    } else if (command === 'S') {
      const [, ...coords] = segment;
      const controlPoint2 = { x: coords[0], y: coords[1] };
      const point = { x: coords[2], y: coords[3] };
      lastPoint = { x: point.x, y: point.y };
      const transformedControlPoint2 = applyToPoint(_matrix, controlPoint2);
      const transformedPoint = applyToPoint(_matrix, point);
      return ['S', transformedControlPoint2.x, transformedControlPoint2.y, transformedPoint.x, transformedPoint.y];
    } else if (command === 'T') {
      const [, ...coords] = segment;
      const point = { x: coords[0], y: coords[1] };
      lastPoint = { x: point.x, y: point.y };
      const transformedPoint = applyToPoint(_matrix, point);
      return ['T', transformedPoint.x, transformedPoint.y];
    } else if (command === 'Q') {
      const [, ...coords] = segment;
      const controlPoint = { x: coords[0], y: coords[1] };
      const point = { x: coords[2], y: coords[3] };
      lastPoint = { x: point.x, y: point.y };
      const transformedControlPoint = applyToPoint(_matrix, controlPoint);
      const transformedPoint = applyToPoint(_matrix, point);
      return ['Q', transformedControlPoint.x, transformedControlPoint.y, transformedPoint.x, transformedPoint.y];
    } else if (command === 'A') {
      const [, ...coords] = segment;
      const rx = coords[0];
      const ry = coords[1];
      const xAxisRotation = coords[2];
      const largeArcFlag = coords[3];
      const sweepFlag = coords[4];
      const point = { x: coords[5], y: coords[6] };
      lastPoint = { x: point.x, y: point.y };
      const transformedPoint = applyToPoint(_matrix, point);
      return ['A', rx, ry, xAxisRotation, largeArcFlag, sweepFlag, transformedPoint.x, transformedPoint.y];
    } else if (command === 'Z') {
      return [command];
    } else {
      throw new Error('Invalid command');
    }
  }) as PathSegment[];

  const newD = segments
    .map((segment) => {
      const [command] = segment;
      switch (command) {
        case 'L':
        case 'M':
          return `${command} ${segment[1]},${segment[2]}`;
        case 'V':
          return `${command} ${segment[1]}`;
        case 'H':
          return `${command} ${segment[1]}`;
        case 'C':
          return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]} ${segment[5]},${segment[6]}`;
        case 'S':
          return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]}`;
        case 'Q':
          return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]}`;
        case 'T':
          return `${command} ${segment[1]},${segment[2]}`;
        case 'A':
          return `${command} ${segment[1]},${segment[2]} ${segment[3]} ${segment[4]} ${segment[5]} ${segment[6]},${segment[7]}`;
        case 'Z':
          return `${command}`;
        default:
          throw new Error('Invalid command');
      }
    })
    .join(' ');

  return new SVGPathCommander(newD);
}

// export function pathUnite(pathA: SVGPathCommander, pathB: SVGPathCommander) {
//   const path2dA = new Path2D(pathA.toString());
//   const path2dB = new Path2D(pathB.toString());

//   return new SVGPathCommander(path2dA.op(path2dB, PathOp.Union).toSVGString());
// }
// export function pathIntersect(pathA: SVGPathCommander, pathB: SVGPathCommander) {
//   const path2dA = new Path2D(pathA.toString());
//   const path2dB = new Path2D(pathB.toString());

//   return new SVGPathCommander(path2dA.op(path2dB, PathOp.Intersect).toSVGString());
// }

// function circleToPath(cx: number, cy: number, r: number) {
//   return `M ${cx + r}, ${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy}`;
// }
// function ellipseToPath(cx: number, cy: number, rx: number, ry: number) {
//   return `M ${cx + rx}, ${cy} A ${rx},${ry} 0 1,0 ${cx - rx},${cy} A ${rx},${ry} 0 1,0 ${cx + rx},${cy}`;
// }
// function lineToPath(x1: number, y1: number, x2: number, y2: number) {
//   return `M ${x1},${y1} L ${x2},${y2}`;
// }
// function polygonToPath(points: [number, number][]) {
//   return `M ${points[0][0]},${points[0][1]} ${Array.from(points)
//     .slice(1)
//     .map((point) => `L ${point[0]},${point[1]}`)
//     .join(' ')} Z`;
// }
// function polylineToPath(points: [number, number][]) {
//   return `M ${points[0][0]},${points[0][1]} ${Array.from(points)
//     .slice(1)
//     .map((point) => `L ${point[0]},${point[1]}`)
//     .join(' ')}`;
// }
// function rectToPath(x: number, y: number, width: number, height: number, rx: number, ry: number) {
//   return `M ${x + rx},${y} H ${x + width - rx} Q ${x + width},${y} ${x + width},${y + ry} V ${y + height - ry} Q ${x + width},${y + height} ${x + width - rx},${y + height} H ${x + rx} Q ${x},${y + height} ${x},${y + height - ry} V ${y + ry} Q ${x},${y} ${x + rx},${y} Z`;
// }

// export function getPathCommander(element: SVGShapeOrGroup): SVGPathCommander {
//   const transformOrigin = getTransformOrigin(element);
//   const transformations = getTransformationsInOrder(element);
//   const pathCommander = (() => {
//     if (element.nodeName === 'circle') {
//       const { cx, cy, r } = getAttrs(element, { cx: Number, cy: Number, r: Number });
//       const d = circleToPath(cx, cy, r);
//       return new SVGPathCommander(d);
//       //return new paper.Path.Circle(new paper.Point(cx, cy), r);
//     } else if (element.nodeName === 'rect') {
//       const { x, y, width, height, rx, ry } = getAttrs(element, { x: Number, y: Number, width: Number, height: Number, rx: Number, ry: Number });
//       const d = rectToPath(x, y, width, height, rx, ry);
//       return new SVGPathCommander(d);
//       //return new paper.Path.Rectangle(new paper.Rectangle(x, y, width, height), new paper.Size(rx, ry));
//     } else if (element.nodeName === 'ellipse') {
//       const { cx, cy, rx, ry } = getAttrs(element, { cx: Number, cy: Number, rx: Number, ry: Number });
//       const d = ellipseToPath(cx, cy, rx, ry);
//       return new SVGPathCommander(d);

//       // return new paper.Path.Ellipse(new paper.Rectangle(cx - rx, cy - ry, rx * 2, ry * 2));
//     } else if (element.nodeName === 'polygon') {
//       const points =
//         element
//           .getAttribute('points')
//           ?.split(' ')
//           .map((point) => point.split(',').map(Number)) ?? [];
//       // return new paper.Path(points);
//       const d = polygonToPath(points as [number, number][]);
//       return new SVGPathCommander(d);
//     } else if (element.nodeName === 'polyline') {
//       const points =
//         element
//           .getAttribute('points')
//           ?.split(' ')
//           .map((point) => point.split(',').map(Number)) ?? [];
//       const d = polylineToPath(points as [number, number][]);
//       return new SVGPathCommander(d);
//     } else if (element.nodeName === 'path') {
//       const d = element.getAttribute('d') ?? '';

//       return new SVGPathCommander(d);
//     } else if (element.nodeName === 'line') {
//       const { x1, y1, x2, y2 } = getAttrs(element, { x1: Number, y1: Number, x2: Number, y2: Number });
//       const d = lineToPath(x1, y1, x2, y2);
//       return new SVGPathCommander(d);
//     } else if (element.nodeName === 'g') {
//       return unitePathsV2(getShapeElementsAndGroupsAndPaths(element.children));
//     } else {
//       throw new Error('Invalid element');
//     }
//   })();

//   const originPoint = new paper.Point(transformOrigin[0], transformOrigin[1]);

//   // let currPath = pathItem;

//   return transformations.reverse().reduce((currPathCommander, transform) => {
//     const matrix = new paper.Matrix();
//     if (transform.translate) {
//       matrix.translate(new paper.Point(transform.translate[0], transform.translate[1]));
//     }
//     if (transform.scale) {
//       matrix.scale(transform.scale[0], transform.scale[1], originPoint);
//     }
//     if (transform.rotate) {
//       matrix.rotate(transform.rotate, originPoint);
//     }
//     if (transform.skew) {
//       matrix.skew(transform.skew[0], transform.skew[1], originPoint);
//     }
//     return transformPath(currPathCommander, matrix);
//   }, pathCommander);
// }

// export function unitePathsV2(elements: SVGShapeOrGroup[]) {
//   const allChildPaths = elements.map(getPathCommander);

//   return allChildPaths.slice(1).reduce((unitedPath, currPath) => pathUnite(unitedPath, currPath), allChildPaths[0]);
// }
// export function comboundPathsV2(elements: Element[]) {
//   return unitePathsV2(getShapeElementsAndGroupsAndPaths(elements));
// }
