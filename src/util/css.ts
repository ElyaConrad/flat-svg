import { ICSSFunction, ICSSPrimitive, parse as parseCSSExpression } from 'css-expression';
import parseInlineStyle, { Declaration } from 'inline-style-parser';
import * as changeCase from 'change-case';
import { Blur, ColorMatrix } from '../main.js';

export type PartialTransform = Partial<{
  translate: [number, number];
  scale: [number, number];
  rotate: number;
  skew: [number, number];
  matrix: [number, number, number, number, number, number];
}>;
export type TransformWithOrigin = PartialTransform & {
  origin: [number, number];
};

export function ensureNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function getStyleObjectFromInlineStyle(styleAttr: string | null) {
  const entries = styleAttr ? parseInlineStyle(styleAttr) : [];
  const declarations = entries.filter((entry) => entry.type === 'declaration') as Declaration[];

  return Object.fromEntries(declarations.map((declaration) => [declaration.property, declaration.value]));
}

export function getElementStyle(element: Element) {
  const styleAttr = element.getAttribute('style');
  return getStyleObjectFromInlineStyle(styleAttr);
}

export function ensureCSSValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const num = Number(value.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

export function getEleentOpacity(element: Element) {
  const opacityAttr = ensureNumber(element.getAttribute('opacity') ?? undefined) ?? 1;
  const styleAttr = element.getAttribute('style');
  const style = parseInlineStyle(styleAttr ?? '');
  const opacityDeclaration = style.find((entry) => entry.type === 'declaration' && entry.property === 'opacity') as Declaration | undefined;
  const cssOpacity = ensureNumber(opacityDeclaration?.value);
  if (cssOpacity) {
    return cssOpacity;
  } else {
    return opacityAttr;
  }
}

export function getElementBlur(element: Element, svg: SVGSVGElement): Blur | undefined {
  const filter = getElementFilter(element);
  if (!filter) {
    return;
  }
  const filterElement = svg.getElementById(filter.slice(1));
  if (!filterElement) {
    return;
  }
  const feGaussianBlur = svg.querySelector('feGaussianBlur');
  if (!feGaussianBlur) {
    return;
  }
  const stdDeviationBaseValue = (feGaussianBlur.getAttribute('stdDeviation') ?? '0')
    .split(' ')
    .map(ensureNumber)
    .filter((v) => v !== undefined);
  const stdDeviationX = stdDeviationBaseValue[0];
  const stdDeviationY = stdDeviationBaseValue[1] ?? stdDeviationX;

  return {
    stdDeviation: [stdDeviationX, stdDeviationY],
  };

  return {
    stdDeviation: [0, 0],
  };
}

export function getSVGValue(element: Element, propertyName: string) {
  const propNameCamelCase = changeCase.camelCase(propertyName);
  const propNameKebabCase = changeCase.kebabCase(propertyName);
  const attr = element.getAttribute(propNameKebabCase) ?? element.getAttribute(propNameCamelCase);
  const styleAttr = element.getAttribute('style');
  if (attr) {
    return attr;
  } else if (styleAttr) {
    const inlineStyleEntries = parseInlineStyle(styleAttr);
    const declaration = inlineStyleEntries.find((entry) => entry.type === 'declaration' && (entry.property === propNameKebabCase || entry.property === propNameCamelCase)) as Declaration | undefined;
    if (declaration) {
      return declaration.value;
    }
  }
}
function getSVGUrlValue(element: Element, propertyName: string) {
  const clipPathStr = getSVGValue(element, propertyName);
  if (!clipPathStr) {
    return undefined;
  }
  const expr = parseCSSExpression(clipPathStr);
  const urlFunc = expr.literals.find((literal) => literal.type === 'function' && (literal as ICSSFunction).name === 'url') as ICSSFunction | undefined;
  if (!urlFunc) {
    return undefined;
  }

  const id = urlFunc.args[0]?.raw;
  return id?.startsWith(`'`) || id?.startsWith(`"`) ? id.slice(1, -1) : id;
}

export function getElementClipPath(element: Element) {
  return getSVGUrlValue(element, 'clip-path');
}

export function getElementMask(element: Element) {
  return getSVGUrlValue(element, 'mask');
}

export function getElementFilter(element: Element) {
  return getSVGUrlValue(element, 'filter');
}

export function getTransformationsInOrder(element: Element): PartialTransform[] {
  const styleAttrStr = element.getAttribute('style');
  const inlineStyleEntries = styleAttrStr ? parseInlineStyle(styleAttrStr) : undefined;

  const transformRawValue = (() => {
    const transformAttrStr = element.getAttribute('transform');
    if (transformAttrStr) {
      return transformAttrStr;
    } else if (inlineStyleEntries) {
      const transformDeclaration = inlineStyleEntries.find((entry) => entry.type === 'declaration' && entry.property === 'transform') as Declaration | undefined;
      if (transformDeclaration) {
        return transformDeclaration.value;
      }
    }
  })();

  if (!transformRawValue) {
    return [];
  }
  const expr = parseCSSExpression(transformRawValue);
  const functions = expr.literals.filter((literal) => literal.type === 'function') as ICSSFunction[];

  return functions.map((func) => {
    switch (func.name) {
      case 'translate':
        const x = ensureCSSValue(func.args[0]?.raw) ?? 0;
        const y = ensureCSSValue(func.args[1]?.raw) ?? x;
        return { translate: [x, y] };
      case 'translateX':
        return { translate: [ensureCSSValue(func.args[0]?.raw) ?? 0, 0] };
      case 'translateY':
        return { translate: [0, ensureCSSValue(func.args[0]?.raw) ?? 0] };
      case 'scale':
        const sx = ensureCSSValue(func.args[0]?.raw) ?? 1;
        const sy = ensureCSSValue(func.args[1]?.raw) ?? sx;
        return { scale: [sx, sy] };
      case 'scaleX':
        return { scale: [ensureCSSValue(func.args[0]?.raw) ?? 1, 1] };
      case 'scaleY':
        return { scale: [1, ensureCSSValue(func.args[0]?.raw) ?? 1] };
      case 'rotate':
        return { rotate: ensureCSSValue(func.args[0]?.raw) ?? 0 };
      case 'skew':
        const skewX = ensureCSSValue(func.args[0]?.raw) ?? 0;
        const skewY = ensureCSSValue(func.args[1]?.raw) ?? 0;
        return { skew: [skewX, skewY] };
      case 'skewX':
        return { skew: [ensureCSSValue(func.args[0]?.raw) ?? 0, 0] };
      case 'skewY':
        return { skew: [0, ensureCSSValue(func.args[0]?.raw) ?? 0] };
      case 'matrix':
        const a = ensureCSSValue(func.args[0]?.raw) ?? 1;
        const b = ensureCSSValue(func.args[1]?.raw) ?? 0;
        const c = ensureCSSValue(func.args[2]?.raw) ?? 0;
        const d = ensureCSSValue(func.args[3]?.raw) ?? 1;
        const tx = ensureCSSValue(func.args[4]?.raw) ?? 0;
        const ty = ensureCSSValue(func.args[5]?.raw) ?? 0;
        // const translate = [e, f] as [number, number];
        // const scale = [Math.sqrt(a * a + b * b), Math.sqrt(c * c + d * d)] as [number, number];
        // const rotate = Math.atan2(b, a) * (180 / Math.PI);
        // const skew = [Math.atan2(-c, d) * (180 / Math.PI), Math.atan2(a, b) * (180 / Math.PI)] as [number, number];

        // return { translate, scale, skew, rotate };
        return { matrix: [a, b, c, d, tx, ty] as [number, number, number, number, number, number] };
      default:
        return {};
    }
  });
}

export function getTransformOrigin(element: Element) {
  const styleAttrStr = element.getAttribute('style');
  const inlineStyleEntries = styleAttrStr ? parseInlineStyle(styleAttrStr) : undefined;

  const transformOriginRawValue = (() => {
    const transformOriginAttrStr = element.getAttribute('transform-origin');
    if (transformOriginAttrStr) {
      return transformOriginAttrStr;
    } else if (inlineStyleEntries) {
      const transformOriginDeclaration = inlineStyleEntries.find((entry) => entry.type === 'declaration' && entry.property === 'transform-origin') as Declaration | undefined;
      if (transformOriginDeclaration) {
        return transformOriginDeclaration.value;
      }
    }
  })();

  if (transformOriginRawValue) {
    const expr = parseCSSExpression(transformOriginRawValue);
    const x = Number((expr.literals[0] as ICSSPrimitive)?.value) ?? 0;
    const y = Number((expr.literals[1] as ICSSPrimitive)?.value) ?? x;

    return [x, y] as [number, number];
  }
  return [0, 0] as [number, number];
}

export function createInlineStyle(values: { [k: string]: string | undefined }) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

export function extractCSSString(value: string) {
  return value.startsWith(`'`) || value.startsWith(`"`) ? value.slice(1, -1) : value;
}

export type DropShadow = {
  dx: number;
  dy: number;
  stdDeviation: number;
  floodColor: string;
  floodOpacity: number;
};

export function getElementDropShadow(element: Element, svg: SVGSVGElement): DropShadow | undefined {
  const filter = getElementFilter(element);
  if (!filter) {
    return;
  }
  const filterElement = svg.getElementById(filter.slice(1));
  if (!filterElement) {
    return;
  }
  const feDropShadow = filterElement.querySelector('feDropShadow');
  if (!feDropShadow) {
    return;
  }
  const dx = ensureNumber(feDropShadow.getAttribute('dx') ?? '0') ?? 0;
  const dy = ensureNumber(feDropShadow.getAttribute('dy') ?? '0') ?? 0;
  const stdDeviation = ensureNumber(feDropShadow.getAttribute('stdDeviation') ?? '0') ?? 0;
  const floodColor = feDropShadow.getAttribute('flood-color') ?? 'black';
  const floodOpacity = ensureNumber(feDropShadow.getAttribute('flood-opacity') ?? '1') ?? 1;

  return {
    dx,
    dy,
    stdDeviation,
    floodColor,
    floodOpacity,
  };
}
