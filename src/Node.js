const { dirname, isAbsolute, join } = require("path");
const { decode } = require("sourcemap-codec");

class Node {
  constructor(opts) {
    if (!opts.file && opts.content == null) {
      throw new Error("Sources must have a `file` path or `content` string");
    }

    this.file = opts.file || null;
    this.content = opts.content;

    this.map = null;
    this.mappings = null;
    this.sources = null;
    this.isOriginalSource = false;
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
          const match = /;base64,([+a-z/0-9]+)$/.exec(url);
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

    // Mark this node as the original since no sourcemap exists.
    this.isOriginalSource = true;
    return false;
  }

  loadSources(opts) {
    if (!this.isOriginalSource) {
      const {map} = this;
      if (!map) {
        throw new Error("Cannot load sources without a sourcemap");
      }

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

      let k = 0; // number of known sources
      let sourcesContent = map.sourcesContent || [];
      this.sources = map.sources.map((source, i) => {
        const file = source ? join(sourceRoot, source) : null;
        const content = sourcesContent[i];
        if (file || content != null) {
          const node = new Node({ file, content });
          if (node.loadMappings(opts)) {
            node.loadSources(opts);
          }
          k += 1;
          return node;
        }
        return null;
      });

      if (k !== 0) {
        return true;
      }

      // Mark this node as the original, since no source nodes exist.
      this.isOriginalSource = true;
    }
    return false;
  }

  trace(lineIndex, columnIndex, name) {
    // If this node doesn't have a source map, we have
    // to assume it is the original source
    if (this.isOriginalSource) {
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

    if (columnIndex != null) {
      let len = segments.length;
      let i;

      for (i = 0; i < len; i += 1) {
        let generatedCodeColumn = segments[i][0];

        if (generatedCodeColumn > columnIndex) {
          break;
        }

        if (generatedCodeColumn === columnIndex) {
          if (segments[i].length < 4) return null;

          let sourceFileIndex = segments[i][1];
          let sourceCodeLine = segments[i][2];
          let sourceCodeColumn = segments[i][3];
          let nameIndex = segments[i][4];

          let parent = this.sources[sourceFileIndex];
          return parent.trace(
            sourceCodeLine,
            sourceCodeColumn,
            this.map.names[nameIndex] || name
          );
        }
      }
    }

    // fall back to a line mapping
    let sourceFileIndex = segments[0][1];
    let sourceCodeLine = segments[0][2];
    let nameIndex = segments[0][4];

    let parent = this.sources[sourceFileIndex];
    return parent.trace(
      sourceCodeLine,
      null,
      this.map.names[nameIndex] || name
    );
  }
}

module.exports = Node;

// Decode a Base64 string.
function atob(base64) {
  return new Buffer(base64, "base64").toString("utf8");
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
