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
  const propValStr = getSVGValue(element, propertyName);
  if (!propValStr) {
    return undefined;
  }
  const url = propValStr.match(/url\(\s*(?:['"])?([^'")\s]+)(?:['"])?\s*\)/i)?.[1];
  if (!url) {
    return undefined;
  }
  return url;
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
function parseValueWithUnit(valueString: string): { value: number; unit: string } | null {
  valueString = valueString.trim();

  if (!valueString) {
    return null;
  }

  // Regex für Zahlen (inkl. negativ, Dezimalzahlen, wissenschaftliche Notation)
  // und optionale Unit
  const valueRegex = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z%]*)$/;

  const match = valueString.match(valueRegex);

  if (!match) {
    // Wenn der Wert nicht geparst werden kann, versuche es trotzdem als Zahl
    const numValue = parseFloat(valueString);
    if (!isNaN(numValue)) {
      return { value: numValue, unit: '' };
    }
    return null;
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || '';

  if (isNaN(value)) {
    return null;
  }

  return { value, unit };
}
function parseTransformValues(valuesString: string): Array<{ value: number; unit: string }> {
  const values: Array<{ value: number; unit: string }> = [];

  const parts = valuesString
    .split(/,/)
    .flatMap((part) => part.trim().split(/\s+/))
    .filter((part) => part.length > 0);

  for (const part of parts) {
    const parsed = parseValueWithUnit(part);
    if (parsed !== null) {
      values.push(parsed);
    }
  }

  return values;
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

  const functions: PartialTransform[] = [];

  const functionRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = functionRegex.exec(transformRawValue)) !== null) {
    const functionName = match[1].trim();
    const paramsString = match[2].trim();

    const parsedValues = parseTransformValues(paramsString);

    switch (functionName) {
      case 'translate':
        {
          const x = parsedValues[0]?.value ?? 0;
          const y = parsedValues[1]?.value ?? x;
          functions.push({ translate: [x, y] });
        }
        break;
      case 'translateX':
        {
          const x = parsedValues[0]?.value ?? 0;
          functions.push({ translate: [x, 0] });
        }
        break;
      case 'translateY':
        {
          const y = parsedValues[0]?.value ?? 0;
          functions.push({ translate: [0, y] });
        }
        break;
      case 'scale':
        {
          const sx = parsedValues[0]?.value ?? 1;
          const sy = parsedValues[1]?.value ?? sx;
          functions.push({ scale: [sx, sy] });
        }
        break;
      case 'scaleX':
        {
          const sx = parsedValues[0]?.value ?? 1;
          functions.push({ scale: [sx, 1] });
        }
        break;
      case 'scaleY':
        {
          const sy = parsedValues[0]?.value ?? 1;
          functions.push({ scale: [1, sy] });
        }
        break;
      case 'rotate':
        {
          const angle = parsedValues[0]?.value ?? 0;
          functions.push({ rotate: angle });
        }
        break;
      case 'skew':
        {
          const skewX = parsedValues[0]?.value ?? 0;
          const skewY = parsedValues[1]?.value ?? 0;
          functions.push({ skew: [skewX, skewY] });
        }
        break;
      case 'skewX':
        {
          const skewX = parsedValues[0]?.value ?? 0;
          functions.push({ skew: [skewX, 0] });
        }
        break;
      case 'skewY':
        {
          const skewY = parsedValues[0]?.value ?? 0;
          functions.push({ skew: [0, skewY] });
        }
        break;
      case 'matrix':
        {
          const a = parsedValues[0]?.value ?? 1;
          const b = parsedValues[1]?.value ?? 0;
          const c = parsedValues[2]?.value ?? 0;
          const d = parsedValues[3]?.value ?? 1;
          const e = parsedValues[4]?.value ?? 0;
          const f = parsedValues[5]?.value ?? 0;
          functions.push({ matrix: [a, b, c, d, e, f] });
        }
        break;
      default:
        break;
    }
  }

  return functions;
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
    const values = transformOriginRawValue.split(/[, ]+/).map((v) => v.trim());
    const x = ensureCSSValue(values[0]) ?? 0;
    const y = ensureCSSValue(values[1]) ?? 0;

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
