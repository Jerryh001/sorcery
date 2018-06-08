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
  }

  loadMappings(opts) {
    let map = this.map || opts.getMap(this.file);
    if (map == null) {
      if (this.content == null) {
        this.content = opts.readFile(this.file);
        if (this.content == null) {
          throw new Error(`Source does not exist: '${this.file}'`);
        }
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
      return this.sources = map.sources.map((source, i) => {
        const file = source ? join(sourceRoot, source) : null;
        const content = sourcesContent[i];
        if (file || content != null) {
          const node = new Node(file, content);
          node.loadMappings(opts) && node.loadSources(opts);
          return node;
        }
        return null;
      });
    }
    return null;
  }

  trace(lineIndex, columnIndex, name) {
    // Tracing is not possible without a sourcemap.
    if (!this.map) {
      return {
        source: this.file,
        line: lineIndex + 1,
        column: columnIndex || 0,
        name: name
      };
    }

    // Otherwise, we need to figure out what this position in
    // the intermediate file corresponds to in *its* source
    const segments = this.mappings[lineIndex];
    if (!segments || segments.length === 0) {
      return null;
    }

    let segment = segments[0];
    let sourceColumn = null;

    // Hi-res column mapping
    if (columnIndex != null) {
      let i = 0, len = segments.length;
      while (segment[0] <= columnIndex) {
        if (segment[0] === columnIndex) {
          sourceColumn = segment[3];
          break; // The source column was found.
        }
        if (++i < len) {
          segment = segments[i];
        } else break;
      }
      if (i !== 0 && sourceColumn === null) {
        segment = segments[0];
      }
    }

    if (segment.length >= 4) {
      const parent = this.sources[segment[1]];
      return parent ? parent.trace(
        segment[2],
        sourceColumn,
        this.map.names[segment[4]] || name
      ) : {
        source: this.file,
        line: segment[2] + 1,
        column: sourceColumn || 0,
        name: this.map.names[segment[4]] || name
      };
    }
    return null;
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
