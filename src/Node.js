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
    let map = this.map || opts.getMap(this.file);
    if (map == null) {
      if (this.content === null) {
        const content = opts.readFile(this.file);
        if (typeof content === "string") {
          this.content = content;
        } else return false;
      }
      const url = parseMapUrl(this.content);
      if (url) {
        if (/^data:/.test(url)) {
          const match = /;base64,([+a-z/0-9]+={0,2})$/i.exec(url);
          if (!match) {
            throw new Error("Sourcemap URL is not base64-encoded");
          }
          map = atob(match[1]);
        } else if (this.file) {
          map = opts.readFile(join(dirname(this.file), decodeURI(url)));
        }
      }
    }
    if (map) {
      if (typeof map == "string") {
        map = JSON.parse(map);
      }
      this.map = map;
      this.mappings = decode(map.mappings);
      return true;
    }
    return false;
  }

  loadSources(opts) {
    const {map} = this;
    if (map) {
      let sourceRoot = map.sourceRoot || "";
      if (map.sources[0] || map.sources.length > 1) {
        if (this.file && !isAbsolute(sourceRoot)) {
          // When the generated file is relative (eg: ../foo.js),
          // we cannot easily convert `sourceRoot` into an absolute path.
          // Instead, we have to hope the `sourcesContent` array is populated,
          // or support relative paths in our `readFile` and `getMap` functions.
          if (!map.file || map.file[0] !== ".") {
            sourceRoot = join(dirname(this.file), sourceRoot);
          }
        }
      }

      const sourcesContent = map.sourcesContent || [];

      let final = true;
      this.sources = map.sources.map((source, i) => {
        const content = sourcesContent[i];
        if (source || content != null) {
          const file = source ? join(sourceRoot, source) : null;
          const node = new Node(file, content);
          if (node.loadMappings(opts)) node.loadSources(opts);
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
