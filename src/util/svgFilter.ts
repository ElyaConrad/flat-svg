import { ensureNumber, getElementFilter } from './css.js';

export type ColorMatrix = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
export type ColorTable = [number, number, number, number];

export const IdentityMatrix: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

function getMatrix<T extends number[]>(stringVal: string | null, identityMatrix: T) {
  const baseValues = (stringVal ?? '')
    .split(' ')
    .map(ensureNumber)
    .filter((n) => n !== undefined) as number[];

  return identityMatrix.map((identity, i) => baseValues[i] ?? identity) as T;
}

export type FeSuper = {
  in?: 'SourceGraphic' | 'SourceAlpha' | string;
  in2?: 'SourceGraphic' | 'SourceAlpha' | string;
  result?: string;
};

export type FeColorMatrixMatrix = FeSuper & {
  fe: 'feColorMatrix';
  type: 'matrix';
  matrix: ColorMatrix;
};
export type FeColorMatrixSaturate = FeSuper & {
  fe: 'feColorMatrix';
  type: 'saturate';
  saturate: number;
};
export type FeColorMatrixHueRotate = FeSuper & {
  fe: 'feColorMatrix';
  type: 'hueRotate';
  angle: number;
};
export type FeColorMatrixLuminanceToAlpha = FeSuper & {
  fe: 'feColorMatrix';
  type: 'luminanceToAlpha';
};
export type FeColorMatrix = FeColorMatrixMatrix | FeColorMatrixSaturate | FeColorMatrixHueRotate | FeColorMatrixLuminanceToAlpha;

export type FeFuncIdentity = {
  type: 'identity';
};
export type FeFuncTable = {
  type: 'table';
  tableValues: ColorTable;
};
export type FeFuncDiscrete = {
  type: 'discrete';
  tableValues: ColorTable;
};
export type FeFuncLinear = {
  type: 'linear';
  slope: number;
  intercept: number;
};
export type FeFuncGamma = {
  type: 'gamma';
  amplitude: number;
  exponent: number;
  offset: number;
};
export type FeFunc = FeFuncIdentity | FeFuncTable | FeFuncDiscrete | FeFuncLinear | FeFuncGamma;
export type FeComponentTransfer = FeSuper & {
  fe: 'feComponentTransfer';
  funcR: FeFunc;
  funcG: FeFunc;
  funcB: FeFunc;
  funcA: FeFunc;
};

function parseFeColorMatrix(feColorMatrix: SVGFEColorMatrixElement): FeColorMatrix {
  const type = feColorMatrix.getAttribute('type') ?? 'matrix';
  const baseValues = getMatrix(feColorMatrix.getAttribute('values'), IdentityMatrix);
  const in1 = feColorMatrix.getAttribute('in') ?? undefined;
  const in2 = feColorMatrix.getAttribute('in2') ?? undefined;
  const result = feColorMatrix.getAttribute('result') ?? undefined;
  if (type === 'matrix') {
    return {
      fe: 'feColorMatrix',
      in: in1,
      in2: in2,
      result: result,
      type: 'matrix',
      matrix: IdentityMatrix.map((identity, i) => baseValues[i] ?? identity) as ColorMatrix,
    };
  } else if (type === 'saturate') {
    return {
      fe: 'feColorMatrix',
      in: in1,
      in2: in2,
      result: result,
      type: 'saturate',
      saturate: baseValues[0] ?? 1,
    };
  } else if (type === 'hueRotate') {
    return {
      fe: 'feColorMatrix',
      in: in1,
      in2: in2,
      result: result,
      type: 'hueRotate',
      angle: baseValues[0] ?? 0,
    };
  } else if (type === 'luminanceToAlpha') {
    return {
      fe: 'feColorMatrix',
      in: in1,
      in2: in2,
      result: result,
      type: 'luminanceToAlpha',
    };
  } else {
    throw new Error('Unsupported feColorMatrix type: ' + type);
  }
}
function parseFeFunc(feFunc: SVGFEFuncRElement): FeFunc {
  const type = feFunc.getAttribute('type') ?? 'identity';
  if (type === 'identity') {
    return { type: 'identity' };
  } else if (type === 'table') {
    const tableValues = feFunc
      .getAttribute('values')
      ?.split(' ')
      ?.map(ensureNumber)
      .filter((v) => v !== undefined)
      .slice(0, 4) as ColorTable;
    return { type: 'table', tableValues };
  } else if (type === 'discrete') {
    const tableValues = feFunc
      .getAttribute('values')
      ?.split(' ')
      ?.map(ensureNumber)
      .filter((v) => v !== undefined)
      .slice(0, 4) as ColorTable;
    return { type: 'discrete', tableValues };
  } else if (type === 'linear') {
    const slope = ensureNumber(feFunc.getAttribute('slope') ?? undefined) ?? 1;
    const intercept = ensureNumber(feFunc.getAttribute('intercept') ?? undefined) ?? 0;
    return { type: 'linear', slope, intercept };
  } else if (type === 'gamma') {
    const amplitude = ensureNumber(feFunc.getAttribute('amplitude') ?? undefined) ?? 1;
    const exponent = ensureNumber(feFunc.getAttribute('exponent') ?? undefined) ?? 1;
    const offset = ensureNumber(feFunc.getAttribute('offset') ?? undefined) ?? 0;
    return { type: 'gamma', amplitude, exponent, offset };
  } else {
    throw new Error('Unsupported feFunc type: ' + type);
  }
}

function parseFeComponentTransfer(feComponentTransfer: SVGFEComponentTransferElement): FeComponentTransfer {
  const funcR = feComponentTransfer.querySelector('feFuncR');
  const funcG = feComponentTransfer.querySelector('feFuncG');
  const funcB = feComponentTransfer.querySelector('feFuncB');
  const funcA = feComponentTransfer.querySelector('feFuncA');

  const in1 = feComponentTransfer.getAttribute('in') ?? undefined;
  const in2 = feComponentTransfer.getAttribute('in2') ?? undefined;
  const result = feComponentTransfer.getAttribute('result') ?? undefined;

  return {
    fe: 'feComponentTransfer',
    in: in1,
    in2: in2,
    result: result,
    funcR: funcR ? parseFeFunc(funcR) : { type: 'identity' },
    funcG: funcG ? parseFeFunc(funcG) : { type: 'identity' },
    funcB: funcB ? parseFeFunc(funcB) : { type: 'identity' },
    funcA: funcA ? parseFeFunc(funcA) : { type: 'identity' },
  };
}

export function serializeElementFilter(element: Element) {
  const filter = getElementFilter(element);
  if (!filter) return;
  const filterElement = element.ownerDocument?.getElementById(filter.slice(1));
  if (!filterElement) return;

  const filterPrimitiveElements = Array.from(filterElement.children)
    .map((childElement) => {
      switch (childElement.nodeName) {
        case 'feColorMatrix':
          return parseFeColorMatrix(childElement as SVGFEColorMatrixElement);
        case 'feComponentTransfer':
          return parseFeComponentTransfer(childElement as SVGFEComponentTransferElement);

        default:
          return undefined;
      }
    })
    .filter((fe) => fe !== undefined);
}
