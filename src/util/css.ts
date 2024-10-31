import {
  ICSSFunction,
  ICSSPrimitive,
  parse as parseCSSExpression,
} from "css-expression";
import parseInlineStyle, { Declaration } from "inline-style-parser";

export type PartialTransform = Partial<{
  translate: [number, number];
  scale: [number, number];
  rotate: number;
  skew: [number, number];
}>;
export type TransformWithOrigin = PartialTransform & {
  origin: [number, number];
};

export function getElementStyle(element: Element) {
  const styleAttr = element.getAttribute("style");
  const entries = styleAttr ? parseInlineStyle(styleAttr) : [];
  const declarations = entries.filter(
    (entry) => entry.type === "declaration"
  ) as Declaration[];

  return Object.fromEntries(
    declarations.map((declaration) => [declaration.property, declaration.value])
  );
}

export function ensureCSSValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const num = Number(value.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

export function getElementClipPath(element: Element) {
  const clipPathAttr = element.getAttribute("clip-path");
  const styleAttr = element.getAttribute("style");
  const clipPathStr = (() => {
    if (clipPathAttr) {
      return clipPathAttr;
    } else if (styleAttr) {
      const inlineStyleEntries = parseInlineStyle(styleAttr);
      const clipPathDeclaration = inlineStyleEntries.find(
        (entry) =>
          entry.type === "declaration" && entry.property === "clip-path"
      ) as Declaration | undefined;
      if (clipPathDeclaration) {
        return clipPathDeclaration.value;
      }
    }
  })();
  if (!clipPathStr) {
    return undefined;
  }
  const expr = parseCSSExpression(clipPathStr);
  const urlFunc = expr.literals.find(
    (literal) =>
      literal.type === "function" && (literal as ICSSFunction).name === "url"
  ) as ICSSFunction | undefined;
  if (!urlFunc) {
    return undefined;
  }

  const id = urlFunc.args[0]?.raw;
  return id?.startsWith(`'`) || id?.startsWith(`"`) ? id.slice(1, -1) : id;
}

export function getTransformationsInOrder(
  element: Element
): Partial<PartialTransform>[] {
  const styleAttrStr = element.getAttribute("style");
  const inlineStyleEntries = styleAttrStr
    ? parseInlineStyle(styleAttrStr)
    : undefined;

  const transformRawValue = (() => {
    const transformAttrStr = element.getAttribute("transform");
    if (transformAttrStr) {
      return transformAttrStr;
    } else if (inlineStyleEntries) {
      const transformDeclaration = inlineStyleEntries.find(
        (entry) =>
          entry.type === "declaration" && entry.property === "transform"
      ) as Declaration | undefined;
      if (transformDeclaration) {
        return transformDeclaration.value;
      }
    }
  })();

  if (!transformRawValue) {
    return [];
  }
  const expr = parseCSSExpression(transformRawValue);
  const functions = expr.literals.filter(
    (literal) => literal.type === "function"
  ) as ICSSFunction[];

  return functions.map((func) => {
    switch (func.name) {
      case "translate":
        const x = ensureCSSValue(func.args[0]?.raw) ?? 0;
        const y = ensureCSSValue(func.args[1]?.raw) ?? x;
        return { translate: [x, y] };
      case "translateX":
        return { translate: [ensureCSSValue(func.args[0]?.raw) ?? 0, 0] };
      case "translateY":
        return { translate: [0, ensureCSSValue(func.args[0]?.raw) ?? 0] };
      case "scale":
        const sx = ensureCSSValue(func.args[0]?.raw) ?? 1;
        const sy = ensureCSSValue(func.args[1]?.raw) ?? sx;
        return { scale: [sx, sy] };
      case "scaleX":
        return { scale: [ensureCSSValue(func.args[0]?.raw) ?? 1, 1] };
      case "scaleY":
        return { scale: [1, ensureCSSValue(func.args[0]?.raw) ?? 1] };
      case "rotate":
        return { rotate: ensureCSSValue(func.args[0]?.raw) ?? 0 };
      case "skew":
        const skewX = ensureCSSValue(func.args[0]?.raw) ?? 0;
        const skewY = ensureCSSValue(func.args[1]?.raw) ?? 0;
        return { skew: [skewX, skewY] };
      case "skewX":
        return { skew: [ensureCSSValue(func.args[0]?.raw) ?? 0, 0] };
      case "skewY":
        return { skew: [0, ensureCSSValue(func.args[0]?.raw) ?? 0] };
      case "matrix":
        const a = ensureCSSValue(func.args[0]?.raw) ?? 1;
        const b = ensureCSSValue(func.args[1]?.raw) ?? 0;
        const c = ensureCSSValue(func.args[2]?.raw) ?? 0;
        const d = ensureCSSValue(func.args[3]?.raw) ?? 1;
        const e = ensureCSSValue(func.args[4]?.raw) ?? 0;
        const f = ensureCSSValue(func.args[5]?.raw) ?? 0;
        return { translate: [e, f], scale: [a, d], skew: [c, b] };
      default:
        return {};
    }
  });
}

export function getTransformOrigin(element: Element) {
  const styleAttrStr = element.getAttribute("style");
  const inlineStyleEntries = styleAttrStr
    ? parseInlineStyle(styleAttrStr)
    : undefined;

  const transformOriginRawValue = (() => {
    const transformOriginAttrStr = element.getAttribute("transform-origin");
    if (transformOriginAttrStr) {
      return transformOriginAttrStr;
    } else if (inlineStyleEntries) {
      const transformOriginDeclaration = inlineStyleEntries.find(
        (entry) =>
          entry.type === "declaration" && entry.property === "transform-origin"
      ) as Declaration | undefined;
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
    .join("; ");
}
