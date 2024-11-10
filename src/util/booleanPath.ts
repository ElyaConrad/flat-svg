import { getAttrs } from '../helpers.js';
import { getTransformationsInOrder, getTransformOrigin } from './css.js';
import paper from 'paper';
import SVGPathCommander, { PathArray, PathSegment } from 'svg-path-commander';

paper.setup(new paper.Size(1080, 1080));
export type SVGShape = SVGRectElement | SVGCircleElement | SVGEllipseElement | SVGPolygonElement | SVGPolylineElement | SVGLineElement | SVGPathElement;
export type SVGShapeOrGroup = SVGShape | SVGGElement;

export function getShapeElementsAndGroupsAndPaths(elements: HTMLCollection | Element[]): SVGShapeOrGroup[] {
  return Array.from(elements).filter((element) => {
    return element.nodeName === 'circle' || element.nodeName === 'rect' || element.nodeName === 'polygon' || element.nodeName === 'polyline' || element.nodeName === 'ellipse' || element.nodeName === 'g' || element.nodeName === 'path';
  }) as SVGShapeOrGroup[];
}

export function getSeperatePaths(d: string) {
  const path = new SVGPathCommander(d).toAbsolute();

  return path.segments
    .reduce((acc, segment) => {
      const lastPathArray = acc[acc.length - 1];
      if (segment[0] === 'M' && (lastPathArray === undefined || lastPathArray[lastPathArray.length - 1][0] === 'Z')) {
        return [...acc, [segment]];
      } else {
        return [...acc.slice(0, -1), [...lastPathArray, segment]];
      }
    }, [] as PathSegment[][])
    .map((segments) => {
      return segments
        .map((segment) => {
          const command = segment[0];
          if (command === 'M' || command === 'm') {
            return `${command} ${segment[1]},${segment[2]}`;
          } else if (command === 'L' || command === 'l') {
            return `${command} ${segment[1]},${segment[2]}`;
          } else if (command === 'H' || command === 'h') {
            return `${command} ${segment[1]}`;
          } else if (command === 'V' || command === 'v') {
            return `${command} ${segment[1]}`;
          } else if (command === 'C' || command === 'c') {
            return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]} ${segment[5]},${segment[6]}`;
          } else if (command === 'S' || command === 's') {
            return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]}`;
          } else if (command === 'Q' || command === 'q') {
            return `${command} ${segment[1]},${segment[2]} ${segment[3]},${segment[4]}`;
          } else if (command === 'T' || command === 't') {
            return `${command} ${segment[1]},${segment[2]}`;
          } else if (command === 'A' || command === 'a') {
            return `${command} ${segment[1]},${segment[2]} ${segment[3]} ${segment[4]} ${segment[5]} ${segment[6]},${segment[7]}`;
          } else if (command === 'Z' || command === 'z') {
            return `${command}`;
          } else {
            throw new Error('Invalid command');
          }
        })
        .join(' ');
    });
}

export function bboxOverlaps(a: SVGPathCommander['bbox'], b: SVGPathCommander['bbox']) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function mergeSeperatePathsBackIfTheyOverlap(paths: string[]) {
  return paths
    .reduce((acc, d) => {
      const path = new SVGPathCommander(d);
      const lastPath = acc[acc.length - 1];
      if (!lastPath) {
        return [path];
      }

      if (bboxOverlaps(path.bbox, lastPath.bbox)) {
        return [...acc.slice(0, -1), new SVGPathCommander(`${lastPath.toString()} ${path.toString()}`)];
      } else {
        return [...acc, path];
      }
    }, [] as SVGPathCommander[])
    .map((path) => path.toString());
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

      // const [mainPath, ...subPaths] = getSeperatePaths(d);
      // const rootPath = new paper.Path(mainPath);

      // // console.log('root', rootPath.pathData);

      // // // const alternativeSubPaths = [new paper.Path(`M 160,120 L 170,120 170,130 160,130`)];

      // // rootPath.exclude(new paper.Path(`M 160,120 L 170,120 170,130 160,130`));

      // // return rootPath;

      // const mergedPath = subPaths.reduce((acc, subPath) => {
      //   const path = new paper.Path(subPath);
      //   path.exclude(acc);
      //   return acc.clone({ insert: false });
      // }, rootPath);

      // return new paper.Path(mergedPath.pathData);

      // if (subPaths.length === 0) {
      //   return new paper.Path(mainPath);
      // } else {
      //   const mainPathInstance = new paper.Path(mainPath);
      //   const secondPath = new paper.Path(subPaths[0]);

      //   secondPath.exclude(mainPathInstance);
      //   return secondPath;
      //   return subPaths.reduce((acc, subPath) => {
      //     acc.subtract(new paper.Path(subPath));
      //     return acc;
      //   }, mainPathInstance);
      // }
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

// export function arrangePaths(elements: Element[]) {
//   return getShapeElementsAndGroupsAndPaths(elements).map(getPaperPathItem);
// }

export function comboundPaths(elements: Element[]) {
  return unitePaths(getShapeElementsAndGroupsAndPaths(elements));
}
