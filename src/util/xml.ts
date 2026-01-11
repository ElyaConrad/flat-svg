// // @ts-expect-error well
// import * as a from '@js-bits/dom-parser';

// const xmlFormat = (str: string, opts: any) => str;

// export function parseXML(str: string): ReturnType<typeof a> {
//   return (a as any).default(str);
// // @ts-expect-error no types
// import beautify from 'xml-beautifier';
// }
const isNode = typeof window === 'undefined';
//let __JSDOM__: any;
export async function preloadJSDOM() {
  if (isNode) {
    //__JSDOM__ = await import('jsdom');
  }
}

export function parseDOM(str: string, contentType: DOMParserSupportedType) {
  if (isNode) {
    // const { JSDOM } = __JSDOM__;
    // const dom = new JSDOM(str, { pretendToBeVisual: true, contentType });
    // return dom.window.document as Document;
    throw new Error('Not implemented in Node.js environment yet.');
  } else {
    const parser = new DOMParser();
    return parser.parseFromString(str, contentType);
  }
}

export function parseXML(str: string) {
  return parseDOM(str, 'image/svg+xml').documentElement;
}

export type XMLDocumentExport = {
  root: ElementNode;
  src: string;
};

export type XMLProcessingInstruction = {
  name: string;
  attributes: { [k: string]: string | number | boolean };
};
export const XMLProcessingInstructionXML = {
  name: 'xml',
  attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' },
};
export const XMLProcessingInstructionAID = {
  name: 'aid',
  attributes: { style: 50, type: 'document', readerVersion: '6.0', featureSet: 257, product: '20.0(95)' },
};

// function stringifyXmlProcessingInstruction({ name, attributes }: XMLProcessingInstruction) {
//   const attrStr = Object.entries(attributes)
//     .map(([key, value]) => `${key}="${value}"`)
//     .join(' ');
//   return `<?${name} ${attrStr}?>`;
// }

// export function stringifyXMLDocument(root: ElementNode, pi: XMLProcessingInstruction[], pretty = false) {
//   const docRaw = `${pi.map(stringifyXmlProcessingInstruction).join('\n')}\n${stringifyNode(root)}`;
//   if (pretty) {
//     return xmlFormat(docRaw, {
//       collapseContent: true,
//     });
//   } else {
//     return docRaw;
//   }
// }

export type ElementNode = {
  type: 'element';
  tagName: string;
  attributes?: { [k: string]: string | number | boolean | undefined };
  children?: XMLNode[];
};
export type TextNode = {
  type: 'text';
  text: string;
};
export type CDataNode = {
  type: 'cdata';
  data: string;
};
export type CommentNode = {
  type: 'comment';
  comment: string;
};
export type XMLNode = ElementNode | TextNode | CDataNode | CommentNode;
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isValidTagName(tagName: string): boolean {
  return /^[a-zA-Z_][\w.-]*(:[\w.-]+)?$/.test(tagName);
}

export function stringifyNode(node: XMLNode): string {
  if (node.type === 'element') {
    if (!isValidTagName(node.tagName)) {
      throw new Error(`Invalid tag name: ${node.tagName}`);
    }
    const attrsStr = Object.entries(node.attributes ?? {})
      .map(([key, value]) => {
        return `${key}="${escapeAttribute(String(value))}"`;
      })
      .join(' ');
    if (node.children === undefined || node.children.length === 0) {
      return `<${node.tagName} ${attrsStr} />`;
    } else {
      return `<${node.tagName} ${attrsStr}>${node.children.map(stringifyNode).join('')}</${node.tagName}>`;
    }
  } else if (node.type === 'cdata') {
    return `<![CDATA[${node.data}]]>`;
  } else if (node.type === 'comment') {
    return `<!--${node.comment}-->`;
  } else {
    return escapeText(node.text);
  }
}

// export function stringifyXML(node: XMLNode, pretty = false) {
//   if (pretty) {
//     return xmlFormat(stringifyNode(node), {
//       collapseContent: true,
//     });
//   }
//   return stringifyNode(node);
// }

export function makeElementNode(tagName: string, attributes?: { [k: string]: string | number | boolean | undefined }, children?: XMLNode[]): ElementNode {
  return {
    type: 'element',
    tagName,
    attributes: Object.fromEntries(Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined)),
    children,
  };
}
export function makeTextNode(value: string | number | boolean): TextNode {
  return { type: 'text', text: String(value) };
}
export function makeCDataNode(value: string | number | boolean): CDataNode {
  return { type: 'cdata', data: String(value) };
}

export function getAttributes(element: Element) {
  return Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, element.getAttribute(attr.name) ?? undefined]));
}

export function nodeToNode(node: Node): XMLNode {
  if (node.nodeType === 1) {
    const element = node as Element;
    return makeElementNode(
      element.tagName,
      getAttributes(element),
      Array.from(element.childNodes)
        .map(nodeToNode)
        .filter((n) => n !== null)
    );
  } else if (node.nodeType === 3) {
    const text = node as Text;
    return makeTextNode(text.textContent ?? '');
  } else if (node.nodeType === 4) {
    const cdata = node as CDATASection;
    return makeCDataNode(cdata.textContent ?? '');
  } else if (node.nodeType === 8) {
    const commentText = node.nodeValue ?? '';
    return { type: 'comment', comment: commentText };
  } else {
    console.log('????', node.nodeType, node);

    throw new Error('Unsupported node type: ' + node.nodeType);
  }
}
export function domNodeToXMLNode(node: Node, skipElements: string[]) {
  const xmlNode = nodeToNode(node) as XMLNode;
  if (xmlNode.type !== 'element') {
    throw new Error('Root node must be an element');
  }
  xmlNode.children = xmlNode.children?.filter((child) => child.type !== 'element' || !skipElements.includes(child.tagName)) ?? [];
  return xmlNode as ElementNode & { children: XMLNode[] };
}

// export function stringifyXML(node: XMLNode, preprocessingInstructions: XMLProcessingInstruction[], pretty = false) {
//   const raw =
//     preprocessingInstructions
//       .map(
//         (pi) =>
//           `<?${pi.name} ${Object.entries(pi.attributes)
//             .map(([key, value]) => `${key}="${value}"`)
//             .join(' ')}?>`
//       )
//       .join('\n') +
//     '\n' +
//     stringifyNode(node);

//   return pretty ? xmlFormat(raw, { collapseContent: true }) : raw;
// }
