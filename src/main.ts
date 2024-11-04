import paper from 'paper';
import xmlFormat from 'xml-formatter';
import { createInlineStyle, getElementClipPath, getElementMask, getElementStyle, getTransformationsInOrder, getTransformOrigin } from './util/css.js';
import { ElementNode, makeElementNode, nodeToNode, parseXML, stringifyNode, XMLNode } from './util/xml.js';
import { getElementAttributes, getUniqueID } from './helpers.js';
import { getClipPath } from './util/clipPath.js';
import { RasterizeFunction, rasterizeMasks } from './util/rasterize.js';
import { arrayBufferToBase64 } from './util/arrayBuffer.js';

export * from './util/css.js';
export * from './util/xml.js';
export * from './helpers.js';
export * from './util/clipPath.js';
export * from './util/booleanPath.js';

paper.setup(new paper.Size(1080, 1080));

export type SimpleElementShape = {
  attributes: { [k: string]: string };
  style: { [k: string]: string };
  transform: paper.Matrix;
  clipPath?: paper.PathItem;
  mask?: ReturnType<RasterizeFunction>;
};

export type SimpleGroup = {
  type: 'group';
  children: SimpleElement[];
  transform: paper.Matrix;
};
export type SimpleRect = SimpleElementShape & {
  type: 'rect';
};
export type SimpleEllipse = SimpleElementShape & {
  type: 'ellipse';
};
export type SimplePath = SimpleElementShape & {
  type: 'path';
  d: string;
};
export type SimpleImage = SimpleElementShape & {
  type: 'image';
};
export type SimpleText = SimpleElementShape & {
  type: 'text';
  nodes: XMLNode[];
};
export type SimpleElement = SimpleGroup | SimpleRect | SimpleEllipse | SimplePath | SimpleImage | SimpleText;

function getAllGlobalFilters(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll('filter')).map(nodeToNode);
}
function getAllGlobalGradients(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll('linearGradient, radialGradient')).map(nodeToNode);
}

function getElementTransformationMatrix(element: Element) {
  const transforms = getTransformationsInOrder(element);
  const transformOrigin = getTransformOrigin(element);
  const matrix = new paper.Matrix();
  const originPoint = new paper.Point(transformOrigin[0], transformOrigin[1]);

  for (const transform of transforms) {
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
  }
  return matrix;
}

function simplifyElements(elements: Element[], rootSVG: SVGSVGElement, tracingTransformMatrix: paper.Matrix, tracingClipPath: paper.PathItem | undefined, tracingMasks: string[], opts: { keepGroupTransforms: boolean; rasterize?: RasterizeFunction }): SimpleElement[] {
  return elements
    .map((element) => {
      const topMatrix = tracingTransformMatrix.clone();

      // Get local matrix
      const localMatrix = getElementTransformationMatrix(element);
      // Get recursive matrix here
      const currMatrix = tracingTransformMatrix.clone().append(localMatrix);

      // Get local clip path
      const localClipPath = (() => {
        const localClipPathSelector = getElementClipPath(element);
        if (localClipPathSelector) {
          return getClipPath(localClipPathSelector, rootSVG);
        }
      })();

      // Intersect clip paths
      if (localClipPath) {
        localClipPath.transform(currMatrix);

        //localClipPath.transform(currMatrix);
        if (tracingClipPath) {
          tracingClipPath = tracingClipPath.intersect(localClipPath);
        } else {
          tracingClipPath = localClipPath;
        }
      }

      const localizedClipPath = tracingClipPath ? tracingClipPath.clone().transform(topMatrix.clone().invert()) : undefined;

      // Mask
      const localMaskingElements = (() => {
        const maskSelector = getElementMask(element);
        if (maskSelector) {
          const maskElement = rootSVG.querySelector(maskSelector);
          if (maskElement) {
            return Array.from(maskElement.children);
          }
        }
      })();

      const currentMasks = (() => {
        if (localMaskingElements) {
          const localMask = localMaskingElements
            .map((maskingElement) => {
              const clonedElement = maskingElement.cloneNode(true) as Element;
              const elementsMatrix = getElementTransformationMatrix(maskingElement);
              elementsMatrix.append(currMatrix.clone());
              clonedElement.removeAttribute('transform');
              (clonedElement as any).style.transform = `matrix(${elementsMatrix.a}, ${elementsMatrix.b}, ${elementsMatrix.c}, ${elementsMatrix.d}, ${elementsMatrix.tx}, ${elementsMatrix.ty})`;
              return clonedElement.outerHTML;
            })
            .join('');
          return [...tracingMasks, localMask];
        } else {
          return [...tracingMasks];
        }
      })();

      if (element.nodeName === 'g') {
        const group = element as SVGGElement;
        return {
          type: 'group',
          // If we are keeping the group transforms, we should apply the local matrix to the group
          // Otherwise, the group's matrix will be traced down to the final element which knows what to do with it
          transform: opts.keepGroupTransforms ? localMatrix : new paper.Matrix(),
          children: simplifyElements(Array.from(group.children), rootSVG, currMatrix, tracingClipPath, currentMasks, opts),
        };
      } else {
        // Rasterize masks using external function
        const mask = currentMasks.length > 0 && opts.rasterize ? rasterizeMasks(currentMasks, rootSVG, currMatrix.clone(), opts.rasterize) : undefined;
        // If the groups are keeping their transforms, we should apply the local matrix to the element instead of the traced down one (multiplied with the original identity matrix)
        const transform = opts.keepGroupTransforms ? localMatrix : currMatrix;
        // If the groups are keeping their transforms, we should apply the localized clip path to the element instead of the traced down one
        const clipPath = opts.keepGroupTransforms ? localizedClipPath : tracingClipPath;
        if (element.nodeName === 'rect') {
          const rect = element as SVGRectElement;
          const attributes = getElementAttributes(rect, ['style']);
          const style = getElementStyle(rect);
          return {
            type: 'rect',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'ellipse') {
          const ellipse = element as SVGEllipseElement;
          const attributes = getElementAttributes(ellipse, ['style']);
          const style = getElementStyle(ellipse);
          return {
            type: 'ellipse',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'circle') {
          const circle = element as SVGCircleElement;
          const attributes = getElementAttributes(circle, ['style']);
          const style = getElementStyle(circle);
          return {
            type: 'ellipse',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'path') {
          const path = element as SVGPathElement;
          const attributes = getElementAttributes(path, ['style']);
          const style = getElementStyle(path);
          return {
            type: 'path',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'line') {
          const line = element as SVGLineElement;
          const attributes = getElementAttributes(line, ['style']);
          const style = getElementStyle(line);
          return {
            type: 'path',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'polygon') {
          const polygon = element as SVGPolygonElement;
          const attributes = getElementAttributes(polygon, ['style']);
          const style = getElementStyle(polygon);
          return {
            type: 'path',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'polyline') {
          const polyline = element as SVGPolylineElement;
          const attributes = getElementAttributes(polyline, ['style']);
          const style = getElementStyle(polyline);
          return {
            type: 'path',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'image') {
          const image = element as SVGImageElement;
          const attributes = getElementAttributes(image, ['style']);
          const style = getElementStyle(image);
          return {
            type: 'image',
            attributes,
            style,
            transform,
            clipPath,
            mask,
          };
        } else if (element.nodeName === 'text') {
          const text = element as SVGTextElement;
          const attributes = getElementAttributes(text, ['style']);
          const style = getElementStyle(text);

          const nodes = Array.from(text.childNodes).map(nodeToNode);
          return {
            type: 'text',
            attributes,
            style,
            nodes,
            transform,
            clipPath,
            mask,
          };
        } else {
          return undefined;
        }
      }
    })
    .filter((element) => element !== undefined) as SimpleElement[];
}

export type FlattenSimpleSVGOptions = {
  clipPathAfterElementTranform?: boolean;
};
function flattenSimpleElement(element: SimpleElement): ElementNode[] {
  const is0Matrix = element.transform.equals(new paper.Matrix());
  const transformMatrix = !is0Matrix ? `matrix(${element.transform.a}, ${element.transform.b}, ${element.transform.c}, ${element.transform.d}, ${element.transform.tx}, ${element.transform.ty})` : undefined;
  const clipPathId = getUniqueID();
  const maskId = getUniqueID();
  const clipPathDefs = (() => {
    if (element.type !== 'group' && (element.clipPath || element.mask)) {
      const matrix = element.transform.clone().invert();
      element.clipPath?.transform(matrix);
      return makeElementNode('defs', {}, [
        ...(element.clipPath
          ? [
              makeElementNode('clipPath', { id: clipPathId }, [
                makeElementNode('path', {
                  d: element.clipPath.pathData,
                }),
              ]),
            ]
          : []),
        ...(element.mask
          ? [
              makeElementNode('mask', { id: maskId }, [
                makeElementNode('image', {
                  x: element.mask.left,
                  y: element.mask.top,
                  width: element.mask.width,
                  height: element.mask.height,
                  href: `data:image/png;base64,${arrayBufferToBase64(element.mask.buffer)}`,
                  //style: createInlineStyle({ transform: `matrix(${element.transform.clone().invert().values.join(',')})` }),
                }),
              ]),
            ]
          : []),
      ]);
    }
  })();
  const baseElements = (() => {
    if (element.type === 'group') {
      const childElements = flattenSimpleElements(element.children);
      if (is0Matrix) {
        return childElements;
      }
      return [
        makeElementNode(
          'g',
          {
            style: createInlineStyle({ transform: transformMatrix }),
          },
          childElements
        ),
      ];
    } else {
      const children = (() => {
        if (element.type === 'text') {
          return element.nodes;
        } else {
          return [];
        }
      })();

      return [
        makeElementNode(
          element.type,
          {
            ...element.attributes,
            style: createInlineStyle({
              ...element.style,
              transform: transformMatrix,
              'clip-path': element.clipPath ? `url('#${clipPathId}')` : undefined,
              mask: element.mask ? `url('#${maskId}')` : undefined,
            }),
          },
          children
        ),
      ];
    }
  })();

  if (clipPathDefs) {
    return [clipPathDefs, ...baseElements];
  }
  return baseElements;
}

function flattenSimpleElements(elements: SimpleElement[]) {
  return elements.map((element) => flattenSimpleElement(element)).flat(1);
}

/*
This method simplifies an SVG by doing the following:
  - Combining all global filters and gradients into a single defs element
  - Flattening every element's transform and clip path
    - You can choose to keep group transforms or dump them into the final identity matrix of the element too
    - You can choose to let the final clip path be applied after the element's transform or before it (if you want to be it applied after, we have to create a group element with the clip path applied to it because clip paths are applied before the element's transform when they are in the same element)
  - Just supports clip-paths
  - No support for embedded SVGs
*/
export function simplifySVG(
  svg: SVGSVGElement,
  opts: {
    keepGroupTransforms: boolean;
    rasterize?: RasterizeFunction;
  }
) {
  const filters = getAllGlobalFilters(svg);
  const gradients = getAllGlobalGradients(svg);

  const elements = simplifyElements(Array.from(svg.children), svg, new paper.Matrix(), undefined, [], {
    keepGroupTransforms: opts.keepGroupTransforms,
    rasterize: opts.rasterize,
  });

  const newSVG = makeElementNode(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: svg.getAttribute('viewBox') ?? undefined,
    },
    [makeElementNode('defs', { class: 'filters' }, [...filters]), makeElementNode('defs', { class: 'gradients' }, [...gradients]), ...flattenSimpleElements(elements)]
  );

  return parseXML(stringifyNode(newSVG)) as any as SVGSVGElement;
}
