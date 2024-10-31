export function getElementAttributes(element: Element, exclude: string[] = []) {
  return Object.fromEntries(
    Array.from(element.attributes)
      .map((attr) => [attr.name, attr.value])
      .filter(([, value]) => value !== null)
      .filter(([key]) => !exclude.includes(key))
  ) as { [k: string]: string };
}

export function getUniqueID(prefix?: string) {
  const id = Math.random().toString(36).substring(2, 15);
  if (prefix) {
    return `${prefix}_${id}`;
  }
  return id;
}

type AttrFunctions<T> = {
  [K in keyof T]: (element: SVGElement) => T[K];
};

export function getAttrs<T>(element: SVGElement, attrMap: AttrFunctions<T>): T {
  return Object.fromEntries(
    (Object.entries(attrMap) as any as [string, (value: string | null) => T[keyof T]][]).map(([keyBy, fn]) => {
      return [keyBy, fn(element.getAttribute(keyBy))];
    })
  ) as any as T;
}
