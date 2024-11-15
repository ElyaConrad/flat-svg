import paper from 'paper';
import { createInlineStyle, DropShadow, ensureNumber, getEleentOpacity, getElementBlur, getElementClipPath, getElementDropShadow, getElementMask, getElementStyle, getStyleObjectFromInlineStyle, getTransformationsInOrder, getTransformOrigin, PartialTransform } from './util/css.js';
import { ElementNode, makeElementNode, nodeToNode, parseDOM, preloadJSDOM, stringifyNode, XMLNode } from './util/xml.js';
import { getElementAttributes, getUniqueID } from './helpers.js';
import { getClipPath, getSimpleClipPath } from './util/clipPath.js';
import { ApplyColorMatrixFunction, ColorMatrix, getElementColorMatrices, RasterizeFunction, rasterizeMasks } from './util/rasterize.js';
import { arrayBufferToBase64 } from './util/arrayBuffer.js';
import { textElementToPath } from './util/textToPath.js';
import SVGPathCommander from 'svg-path-commander';
import { transformPath } from './main.js';

export * from './util/css.js';
export * from './util/xml.js';
export * from './helpers.js';
export * from './util/clipPath.js';
export * from './util/booleanPath.js';
export * from './util/cleanupBluepic.js';
export * from './util/rasterize.js';
export * from './util/textToPath.js';
export * from './util/resolveFonts.js';

export type StdDeviation = [number, number];
export type Blur = {
  stdDeviation: StdDeviation;
};

function combineBlurs(blurs: Blur[]): StdDeviation {
  let combinedX = 0;
  let combinedY = 0;

  for (const { stdDeviation } of blurs) {
    combinedX += stdDeviation[0] ** 2;
    combinedY += stdDeviation[1] ** 2;
  }

  // Quadratwurzel der Summen ergibt den kombinierten Standardabweichungswert
  return [Math.sqrt(combinedX), Math.sqrt(combinedY)];
}

export type SimpleElementShape = {
  attributes: { [k: string]: string };
  style: { [k: string]: string };
  transform: paper.Matrix;
  clipPath?: paper.PathItem;
  simpleClipPath?: SVGPathCommander;
  mask?: Awaited<ReturnType<RasterizeFunction>>;
  colorMatrices: ColorMatrix[];
  opacity: number;
  blurs: Blur[];
  dropShadow?: DropShadow;
};

export type SimpleGroup = {
  type: 'group';
  children: SimpleElement[];
  transform: paper.Matrix;
  keep: boolean;
  dropShadow?: DropShadow;
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
function getAllGlobalStyles(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll('style')).map(nodeToNode);
}

export function getElementTransformationMatrix(element: Element) {
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
      matrix.skew(transform.skew[0], transform.skew[1], originPoint);
    }
    if (transform.matrix) {
      const currMatrix = new paper.Matrix(transform.matrix);
      matrix.append(currMatrix);
    }
  }
  return matrix;
}

function decomposeMatrix(matrix: paper.Matrix) {
  const { a, b, c, d, tx, ty } = matrix;

  // Translation component is directly from e and f
  const translate: [number, number] = [tx, ty];

  // Scale components are the lengths of the vectors (a, b) and (c, d)
  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);

  // Ensure the scale is positive to avoid flipping/skew issues
  const scale: [number, number] = [scaleX, scaleY];

  // Normalize the matrix to extract skew components
  const aNorm = a / scaleX;
  const bNorm = b / scaleX;
  const cNorm = c / scaleY;
  const dNorm = d / scaleY;

  // Skew components are derived from the normalized matrix
  const skewX = Math.atan2(aNorm * cNorm + bNorm * dNorm, aNorm * dNorm - bNorm * cNorm);
  const skewY = Math.atan2(bNorm, aNorm);

  // Convert skew values from radians to degrees
  const skew: [number, number] = [
    (skewX * 180) / Math.PI, // skewX in degrees
    (skewY * 180) / Math.PI, // skewY in degrees
  ];

  return {
    translate,
    scale,
    skew,
  };
}

async function simplifyElements(elements: Element[], rootSVG: SVGSVGElement, tracingTransformMatrix: paper.Matrix, tracingClipPath: paper.PathItem | undefined, tracingSimpleClipPath: SVGPathCommander | undefined, tracingMasks: string[], tracingColorMatrixes: number[][], tracingOpacity: number, tracingBlurs: Blur[], tracingDropShadows: DropShadow[], opts: { keepGroupTransforms: boolean; rasterize?: RasterizeFunction; applyColorMatrix?: ApplyColorMatrixFunction; rasterizeAllMasks: boolean }): Promise<SimpleElement[]> {
  return (
    await Promise.all(
      elements
        .filter((element) => element.nodeName !== 'defs')
        .map(async (element) => {
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

          // The simple clip path is a clip path that does not uses unite() of paper.js but just merges the d-strings of the paths together
          // There will be such a simple clip path if the the clip path's elements do not intersect with each other
          let localSimpleClipPath = (() => {
            const localClipPathSelector = getElementClipPath(element);
            if (localClipPathSelector) {
              return getSimpleClipPath(localClipPathSelector, rootSVG);
            }
          })();

          // Transforming the simple clip path is what it is
          if (localSimpleClipPath) {
            // Deprected
            //localSimpleClipPath = localSimpleClipPath.transform(decomposeMatrix(currMatrix));
            localSimpleClipPath = transformPath(localSimpleClipPath, currMatrix);
          }
          // If there is already an existing tracing clip path, we delete the simple clip path here
          if ((tracingSimpleClipPath || tracingClipPath) && localSimpleClipPath) {
            tracingSimpleClipPath = undefined;
          } else if (localSimpleClipPath) {
            tracingSimpleClipPath = new SVGPathCommander(localSimpleClipPath.toString());
          }

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

          const localizedClipPath = tracingClipPath
            ? (() => {
                const newClipPath = tracingClipPath.clone();
                newClipPath.transform(topMatrix.clone().invert());
                return newClipPath;
              })()
            : undefined;
          const localizedSimpleClipPath = tracingSimpleClipPath ? transformPath(tracingSimpleClipPath, topMatrix.clone().invert()) : undefined;

          // Mask
          const localMaskingElements = (() => {
            const maskSelector = getElementMask(element);
            if (maskSelector) {
              const maskElement = rootSVG.getElementById(maskSelector.slice(1));
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

          const localColorMatrices = getElementColorMatrices(element, rootSVG);
          if (localColorMatrices) {
            tracingColorMatrixes = [...tracingColorMatrixes, ...localColorMatrices];
          }

          const localOpacity = getEleentOpacity(element);

          const localBlur = getElementBlur(element, rootSVG);
          if (localBlur) {
            tracingBlurs = [...tracingBlurs, localBlur];
          }

          tracingOpacity *= localOpacity;

          const localDropShadow = getElementDropShadow(element, rootSVG);

          if (localDropShadow) {
            tracingDropShadows = [...tracingDropShadows, localDropShadow];
          }
          // Actually, we're just supporting one drop shadow for now
          const dropShadow = localDropShadow;

          const frozenTracingClipPath = tracingClipPath?.clone();

          if (element.nodeName === 'g') {
            const group = element as SVGGElement;
            return {
              type: 'group',
              // If we are keeping the group transforms, we should apply the local matrix to the group
              // Otherwise, the group's matrix will be traced down to the final element which knows what to do with it
              transform: opts.keepGroupTransforms ? localMatrix : new paper.Matrix(),
              children: await simplifyElements(Array.from(group.children), rootSVG, currMatrix, frozenTracingClipPath, tracingSimpleClipPath, currentMasks, tracingColorMatrixes, tracingOpacity, tracingBlurs, tracingDropShadows, opts),
              keep: element.getAttribute('data-keep') === 'true',
              dropShadow,
            };
          } else {
            // Rasterize masks using external function
            const mask = await (async () => {
              if (currentMasks.length > 0 && opts.rasterize) {
                // Raster the element with the masks straightforward
                if (opts.rasterizeAllMasks) {
                  return await rasterizeMasks(currentMasks, rootSVG, currMatrix.clone(), opts.rasterize, opts.applyColorMatrix, element.outerHTML);
                }
                // Just rasterize the masks itself with a white background
                else {
                  return await rasterizeMasks(currentMasks, rootSVG, currMatrix.clone(), opts.rasterize, opts.applyColorMatrix, `<rect x="0%" y="0%" width="100%" height="100%" style="fill: white;" />`);
                }
              }
            })();

            // If the groups are keeping their transforms, we should apply the local matrix to the element instead of the traced down one (multiplied with the original identity matrix)
            const transform = opts.keepGroupTransforms ? localMatrix : currMatrix;
            // If the groups are keeping their transforms, we should apply the localized clip path to the element instead of the traced down one
            const clipPath = opts.keepGroupTransforms ? localizedClipPath : frozenTracingClipPath;
            const simpleClipPath = opts.keepGroupTransforms ? localizedSimpleClipPath : tracingSimpleClipPath ? new SVGPathCommander(tracingSimpleClipPath.toString()) : undefined;

            const colorMatrices = tracingColorMatrixes;

            // const colorMatrix = combineColorMatrices(tracingColorMatrixes);
            // Masked return
            if (opts.rasterizeAllMasks && mask) {
              return {
                type: 'image',
                attributes: {
                  x: mask.left,
                  y: mask.top,
                  width: mask.width,
                  height: mask.height,
                  href: `data:image/png;base64,${arrayBufferToBase64(mask.buffer)}`,
                  //'data-rasterized-mask': 'true',
                },
                style: {},
                mask: undefined,
                clipPath,
                simpleClipPath,
                transform,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
              };
            } else if (element.nodeName === 'rect') {
              const rect = element as SVGRectElement;
              const attributes = getElementAttributes(rect, ['style']);
              const style = getElementStyle(rect);
              return {
                type: 'rect',
                attributes,
                style,
                transform,
                clipPath,
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
              };
            } else if (element.nodeName === 'circle') {
              const circle = element as SVGCircleElement;
              const attributes = getElementAttributes(circle, ['style']);
              const radius = ensureNumber(attributes.r) ?? 0;
              const cx = ensureNumber(attributes.cx) ?? 0;
              const cy = ensureNumber(attributes.cy) ?? 0;
              delete attributes.r;
              attributes.rx = `${radius}`;
              attributes.ry = `${radius}`;
              const style = getElementStyle(circle);
              return {
                type: 'ellipse',
                attributes,
                style,
                transform,
                clipPath,
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
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
                simpleClipPath,
                mask,
                colorMatrices,
                opacity: tracingOpacity,
                blurs: tracingBlurs,
                dropShadow,
              };
            } else {
              return undefined;
            }
          }
        })
    )
  ).filter((element) => element !== undefined) as SimpleElement[];
}

export type FlattenSimpleSVGOptions = {
  clipPathAfterElementTranform?: boolean;
};
export const IdentityMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
function flattenSimpleElement(element: SimpleElement): ElementNode[] {
  const is0Matrix = element.transform.equals(new paper.Matrix());
  const is0Filter = element.type !== 'group' ? element.colorMatrices.every((matrix) => matrix.every((v, i) => IdentityMatrix[i] === v)) : true;

  const transformMatrix = !is0Matrix ? `matrix(${element.transform.a}, ${element.transform.b}, ${element.transform.c}, ${element.transform.d}, ${element.transform.tx}, ${element.transform.ty})` : undefined;
  const clipPathId = getUniqueID();
  const maskId = getUniqueID();
  const filterId = getUniqueID();

  const dropShadowFilter = element.dropShadow
    ? makeElementNode('filter', { id: filterId, filterUnits: 'userSpaceOnUse' }, [
        makeElementNode('feDropShadow', {
          in: 'SourceGraphic',
          stdDeviation: element.dropShadow.stdDeviation,
          dx: element.dropShadow.dx,
          dy: element.dropShadow.dy,
          floodColor: element.dropShadow.floodColor,
          floodOpacity: element.dropShadow.floodOpacity.toString(),
        }),
      ])
    : undefined;

  const clipPathDefs = (() => {
    if (element.type !== 'group' && (element.clipPath || element.mask)) {
      const matrix = element.transform.clone().invert();
      element.clipPath?.transform(matrix);
      const newSimpleClipPath = element.simpleClipPath ? transformPath(element.simpleClipPath, matrix) : undefined;
      return makeElementNode('defs', {}, [
        ...(element.clipPath
          ? [
              makeElementNode('clipPath', { id: clipPathId }, [
                makeElementNode('path', {
                  d: newSimpleClipPath ? newSimpleClipPath.toString() : element.clipPath.pathData,
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
        ...((element.colorMatrices.length > 0 && !is0Filter) || element.blurs.length > 0 || element.dropShadow
          ? [
              makeElementNode('filter', { id: filterId }, [
                ...(element.colorMatrices.length > 0 && !is0Filter
                  ? element.colorMatrices.map((matrix) => {
                      return makeElementNode('feColorMatrix', {
                        type: 'matrix',
                        values: matrix.join(' '),
                      });
                    })
                  : []),
                ...(element.blurs.length > 0
                  ? [
                      makeElementNode('feGaussianBlur', {
                        in: 'SourceGraphic',
                        stdDeviation: combineBlurs(element.blurs).join(' '),
                      }),
                    ]
                  : []),
                ...(dropShadowFilter ? [dropShadowFilter] : []),
              ]),
            ]
          : []),
      ]);
    } else {
      if (dropShadowFilter) {
        return makeElementNode('defs', {}, [dropShadowFilter]);
      }
    }
  })();
  const baseElements = (() => {
    if (element.type === 'group') {
      const childElements = flattenSimpleElements(element.children);

      if (is0Matrix && !element.keep && !dropShadowFilter) {
        return childElements;
      }
      return [
        makeElementNode(
          'g',
          {
            style: transformMatrix || dropShadowFilter ? createInlineStyle({ transform: transformMatrix, filter: dropShadowFilter ? `url('#${filterId}')` : undefined }) : undefined,
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
      //console.log(element, element.a);
      const style = createInlineStyle({
        ...element.style,
        transform: transformMatrix,
        clipPath: undefined,
        'clip-path': element.clipPath ? `url('#${clipPathId}')` : undefined,
        mask: element.mask ? `url('#${maskId}')` : undefined,
        filter: (element.colorMatrices.length > 0 && !is0Filter) || element.blurs.length > 0 || dropShadowFilter ? `url('#${filterId}')` : undefined,
        opacity: element.opacity.toString(),
      });

      return [
        makeElementNode(
          element.type,
          {
            ...element.attributes,
            style,
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
export async function simplifySVG(
  document: Document,
  opts: {
    rasterizeAllMasks: boolean;
    keepGroupTransforms: boolean;
    vectorizeAllTexts: boolean;
    rasterize?: RasterizeFunction;
    applyColorMatrix?: ApplyColorMatrixFunction;
  }
) {
  const svg = document.querySelector('svg')!;
  const filters = getAllGlobalFilters(svg);
  const gradients = getAllGlobalGradients(svg);
  const styles = getAllGlobalStyles(svg);

  const viewBox = (svg.getAttribute('viewBox') ?? '0 0 100 100')
    .split(' ')
    .map(ensureNumber)
    .filter((v) => v !== undefined);

  paper.setup(new paper.Size(viewBox[2] * 10, viewBox[3] * 10));

  // Just to make sure we have a JSDOM instance ready that will be uased instead of the browser's DOMParser
  await preloadJSDOM();

  console.time('text-to-path');

  // We cannot merge texts in clip paths, so we have to convert them to paths
  for (const textElement of Array.from(svg.querySelectorAll(opts.vectorizeAllTexts ? 'text' : 'clipPath text, mask text') as NodeListOf<SVGTextElement>)) {
    const clipPath = getElementClipPath(textElement);
    const mask = getElementMask(textElement);
    if (clipPath || mask) {
      console.log(textElement, clipPath, mask);
    }
    const { paths, text } = await textElementToPath(textElement, svg);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-keep', 'true');
    g.setAttribute('class', 'text-element');

    g.setAttribute('data-text', text);
    const allPaths = paths.map((p) => p.paths.map((path) => ({ style: p.style, path }))).flat();

    // let anyIntersection = false;
    // const singlePath = allPaths.slice(1).reduce((accD, path) => {
    //   const d = path.toString();
    //   if (intersect(accD, d).length > 0) {
    //     anyIntersection = true;
    //   }
    //   accD = accD.replace(/Z/g, '');
    //   return `${accD} ${d}`;
    // }, allPaths[0].toString());

    for (const { path, style } of allPaths) {
      const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathElement.setAttribute('d', path.toString());
      const styleStr = createInlineStyle({
        ...getStyleObjectFromInlineStyle(style ?? ''),
        mask: mask ? `url('${mask}')` : undefined,
        clipPath: clipPath ? `url('${clipPath}')` : undefined,
      });
      if (styleStr) {
        pathElement.setAttribute('style', styleStr);
      }

      g.appendChild(pathElement);
    }

    textElement.replaceWith(g);
  }

  console.timeEnd('text-to-path');

  const elements = await simplifyElements(Array.from(svg.children), svg, new paper.Matrix(), undefined, undefined, [], [], 1, [], [], {
    keepGroupTransforms: opts.keepGroupTransforms,
    rasterizeAllMasks: opts.rasterizeAllMasks,
    applyColorMatrix: opts.applyColorMatrix,
    rasterize: opts.rasterize,
  });

  const newSVG = makeElementNode(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: svg.getAttribute('viewBox') ?? undefined,
    },
    [makeElementNode('defs', { class: 'styles' }, [...styles]), makeElementNode('defs', { class: 'filters' }, [...filters]), makeElementNode('defs', { class: 'gradients' }, [...gradients]), ...flattenSimpleElements(elements)]
  );

  return parseDOM(stringifyNode(newSVG), 'image/svg+xml');
}
