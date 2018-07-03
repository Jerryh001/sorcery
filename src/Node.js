const { dirname, isAbsolute, join } = require("path");
const { decode } = require("sourcemap-codec");

class Node {
  constructor(file, content) {
    if (!file && content == null) {
      throw new Error("Sources must have a `file` path or `content` string");
    }
    this.file = typeof file === "string" ? file : null;
    this.content = typeof content === "string" ? content : null;

    this.map = null;
    this.mappings = null;
    this.sources = null;
    this.final = null; // `true` when all sources are null
  }

  loadMappings(opts) {
    if (this.mappings !== null) {
      return true;
    }
    if (this.map !== false) {
      let map = this.map || this._loadSourceMap(opts);
      if (typeof map === "string") {
        map = JSON.parse(map);
      }
      this.map = map;
      if (map !== false) {
        this.mappings = decode(map.mappings);
        return true;
      }
    }
    return false;
  }

  loadSources(opts) {
    const {map} = this;
    if (map) {
      const sourceRoot = this._getSourceRoot();
      const sourcesContent = map.sourcesContent || [];

      let final = true;
      this.sources = map.sources.map((source, i) => {
        const content = sourcesContent[i];
        if (source || content != null) {
          const file = source ? join(sourceRoot, source) : null;
          const node = new Node(file, content);
          // Avoid calling `opts.getMap` when the parent node has the same
          // filename, because this can easily cause infinite recursion.
          if (node.map || !node.file || node.file !== this.file) {
            node.loadMappings(opts) && node.loadSources(opts);
          }
          if (node.map) final = false;
          return node;
        }
        return null;
      });
      this.final = final;
      return true;
    }
    return false;
  }

  _getSourceRoot() {
    let {sources, sourceRoot} = this.map;

    // The source root isn't used when the only source is null.
    if (sources[0] || sources.length > 1) {
      if (!sourceRoot) {
        sourceRoot = "";
      } else if (isAbsolute(sourceRoot)) {
        return sourceRoot;
      }
      // The source root is relative to the generated file.
      if (this.file && isAbsolute(this.file)) {
        return join(dirname(this.file), sourceRoot);
      }
    }

    return "";
  }

  _loadSourceMap(opts) {
    // May be cached by the user.
    if (this.file !== null) {
      const map = opts.getMap(this.file);
      if (map != null) return map;
    }
    // The content may be cached by the user.
    if (this.content === null) {
      const content = opts.readFile(this.file);
      if (typeof content === "string") {
        this.content = content;
      } else return false;
    }

    // Look for a `sourceMappingURL` comment.
    const url = parseMapUrl(this.content);
    if (url === null) return false;

    // Check if `sourceMappingURL` is base64.
    if (/^data:/.test(url)) {
      const match = /;base64,([+a-z/0-9]+={0,2})$/i.exec(url);
      if (!match) {
        throw new Error("Sourcemap URL is not base64-encoded");
      }
      // Decode the `sourceMappingURL` from base64.
      return atob(match[1]);
    }

    // Try reading the `sourceMappingURL` as a file.
    return this.file !== null &&
      opts.readFile(join(dirname(this.file), decodeURI(url)));
  }
}

module.exports = Node;

// Decode a Base64 string.
function atob(base64) {
  return Buffer.from(base64, "base64").toString("utf8");
}

function parseMapUrl(str) {
  var index, substring, url, match;

  // assume we want the last occurence
  index = str.lastIndexOf("sourceMappingURL=");

  if (index === -1) {
    return null;
  }

  substring = str.substring(index + 17);
  match = /^[^\r\n]+/.exec(substring);

  url = match ? match[0] : null;

  // possibly a better way to do this, but we don't want to exclude whitespace
  // from the sourceMappingURL because it might not have been correctly encoded
  if (url && url.slice(-2) === "*/") {
    url = url.slice(0, -2).trim();
  }

  return url;
}
