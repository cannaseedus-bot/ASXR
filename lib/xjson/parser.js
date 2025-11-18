/**
 * XJSON Parser
 * Universal data definition language for shards, APIs, UIs, and virtual servers
 * Handles both standard JSON and XJSON with ⟁ prefix notation
 */

export class XJSONParser {
  constructor() {
    this.prefix = '⟁';
  }

  /**
   * Parse XJSON string or object
   */
  parse(input) {
    if (typeof input === 'object') {
      return this.normalize(input);
    }

    try {
      const obj = JSON.parse(input);
      return this.normalize(obj);
    } catch (err) {
      throw new Error(`XJSON parse error: ${err.message}`);
    }
  }

  /**
   * Normalize XJSON object (convert ⟁prefix to standard keys)
   */
  normalize(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.normalize(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const normalized = {};

      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = key.startsWith(this.prefix) ? key.slice(1) : key;
        normalized[cleanKey] = this.normalize(value);
      }

      return normalized;
    }

    return obj;
  }

  /**
   * Stringify to XJSON format
   */
  stringify(obj, options = {}) {
    const usePrefix = options.usePrefix !== false;
    const compressed = options.compressed || false;

    const stringified = usePrefix
      ? this.addPrefixes(obj)
      : obj;

    return JSON.stringify(
      stringified,
      null,
      compressed ? 0 : 2
    );
  }

  /**
   * Add ⟁ prefixes to all keys
   */
  addPrefixes(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.addPrefixes(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const prefixed = {};

      for (const [key, value] of Object.entries(obj)) {
        const prefixedKey = this.prefix + key;
        prefixed[prefixedKey] = this.addPrefixes(value);
      }

      return prefixed;
    }

    return obj;
  }

  /**
   * Compile XJSON view to HTML
   */
  compileView(viewDef) {
    const html = viewDef.html || viewDef['⟁html'];
    if (!html) return '';

    const body = html.body || html['⟁body'];
    if (!body) return '';

    return this.compileNode(body);
  }

  /**
   * Compile XJSON node to HTML string
   */
  compileNode(node) {
    if (typeof node === 'string') {
      return node;
    }

    const tag = node.node || node['⟁node'] || 'div';
    const attrs = node.attrs || node['⟁attrs'] || {};
    const children = node.children || node['⟁children'] || [];

    const attrStr = Object.entries(attrs)
      .map(([k, v]) => {
        const key = k.startsWith(this.prefix) ? k.slice(1) : k;
        const attrKey = key === 'cls' ? 'class' : key;
        return `${attrKey}="${v}"`;
      })
      .join(' ');

    const childrenHtml = children
      .map(child => this.compileNode(child))
      .join('');

    return `<${tag}${attrStr ? ' ' + attrStr : ''}>${childrenHtml}</${tag}>`;
  }

  /**
   * Parse HTML to XJSON node structure
   */
  parseHTML(htmlString) {
    // Simple HTML parser (for basic cases)
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    return this.domToXJSON(doc.body.firstChild);
  }

  /**
   * Convert DOM node to XJSON
   */
  domToXJSON(domNode) {
    if (domNode.nodeType === 3) {
      // Text node
      return domNode.textContent;
    }

    const node = {
      node: domNode.tagName.toLowerCase()
    };

    // Attributes
    if (domNode.attributes.length > 0) {
      const attrs = {};
      for (const attr of domNode.attributes) {
        const key = attr.name === 'class' ? 'cls' : attr.name;
        attrs[key] = attr.value;
      }
      node.attrs = attrs;
    }

    // Children
    if (domNode.childNodes.length > 0) {
      node.children = Array.from(domNode.childNodes)
        .map(child => this.domToXJSON(child))
        .filter(Boolean);
    }

    return node;
  }
}

/**
 * XJSON API Definition Compiler
 */
export class XJSONAPICompiler {
  /**
   * Compile API definition to route handlers
   */
  compile(apiDef) {
    const routes = [];

    for (const route of apiDef) {
      const path = route.path || route['⟁path'];
      const method = route.method || route['⟁method'] || 'GET';
      const handler = route.handler || route['⟁handler'];

      routes.push({
        path,
        method,
        handler: typeof handler === 'string'
          ? handler
          : handler
      });
    }

    return routes;
  }
}
