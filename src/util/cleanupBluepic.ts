import parseInlineStyle, { Declaration } from 'inline-style-parser';
import cssGradient2SVG from 'gradient2svg';
import { getUniqueID } from '../helpers.js';
import { ensureNumber } from '../main.js';

export function cleanupBluepicSVG(document: Document, preserve?: (document: Document) => Element[]) {
  // Get all mask wrappers that have invert and colorMasking set to false
  // and replace them with clipPaths
  const allBluepicMaskWrappers = document.querySelectorAll('[data-bx-mask-props]') as NodeListOf<SVGGElement>;
  const allBluepicMaskWithoutInvertOrOpacity = Array.from(allBluepicMaskWrappers).filter((maskWrapper) => {
    const propsStr = maskWrapper.getAttribute('data-bx-mask-props');
    const props = (() => {
      try {
        return JSON.parse(propsStr!);
      } catch {
        return undefined;
      }
    })();
    return props?.invert === false && props?.colorMasking === false;
  });
  for (const maskWrapper of allBluepicMaskWithoutInvertOrOpacity) {
    const maskEl = maskWrapper.querySelector('defs > mask');
    if (!maskEl) {
      continue;
    }
    const maskSlotWrapper = maskEl.querySelector('.slot-wrapper');
    if (!maskSlotWrapper) {
      continue;
    }

    const contentGroup = Array.from(maskWrapper.children).find((child) => child.tagName === 'g' && (child as SVGElement).style.mask) as SVGGElement;
    if (!contentGroup) {
      continue;
    }
    const clonedMaskSlotWrapper = maskSlotWrapper.cloneNode(true) as SVGElement;
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    const clipPathId = 'mask-clip-path-' + getUniqueID();
    clipPath.setAttribute('id', clipPathId);
    clipPath.appendChild(clonedMaskSlotWrapper);

    contentGroup.style.removeProperty('mask');
    contentGroup.style.clipPath = `url(#${clipPathId})`;

    maskEl.replaceWith(clipPath);
  }

  // Get all foreign objects that are representing gradients
  // and replace them with SVG gradients
  for (const foreignObjectGradient of Array.from(document.querySelectorAll('.foreign-object-gradient'))) {
    const foreignObject = foreignObjectGradient as SVGForeignObjectElement;
    const x = ensureNumber(foreignObject.getAttribute('x') ?? '0') ?? 0;
    const y = ensureNumber(foreignObject.getAttribute('y') ?? '0') ?? 0;
    const width = ensureNumber(foreignObject.getAttribute('width') ?? '0') ?? 0;
    const height = ensureNumber(foreignObject.getAttribute('height') ?? '0') ?? 0;

    const gradientDiv = foreignObject.querySelector('.foreign-gradient') as HTMLDivElement | null;
    if (!gradientDiv) {
      continue;
    }
    const style = parseInlineStyle(gradientDiv.getAttribute('style') ?? '');
    const backgroundImage = (style.find((declaration) => declaration.type === 'declaration' && declaration.property === 'background-image') as Declaration | undefined)?.value;
    if (!backgroundImage) {
      continue;
    }

    const gradientId = 'gradient-' + getUniqueID();
    const gradient = cssGradient2SVG(backgroundImage);
    if (!gradient) {
      continue;
    }
    // The parent stores the clip path that clips the foreigObject (we convert it to a path instead)
    const foreignObjectParent = foreignObject.parentElement as any as SVGGElement;
    const clipPath = foreignObjectParent.querySelector('clipPath');
    // Getting the clip path d attribute or creating a default one based on the the bbox of the foreignObject element
    const d = clipPath?.querySelector('path')?.getAttribute('d') ?? `M ${x},${y} h ${width} v ${height} h -${width} Z`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('style', `fill: url(#${gradientId});`);

    const gradientDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    gradientDefs.innerHTML = gradient;
    gradientDefs.querySelector('linearGradient, radialGradient')!.setAttribute('id', gradientId);

    // Replace the foreign object's parent element (whiocj is holding the clip path and the foreign object) with the gradient defs and the new path
    foreignObjectParent.replaceWith(gradientDefs, path);
  }

  for (const element of Array.from(document.querySelectorAll('.bx-alt-bbox-source'))) {
    element.remove();
  }
  if (preserve) {
    for (const element of preserve(document)) {
      element.setAttribute('data-keep', 'true');
    }
  }
}
