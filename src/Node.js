const { dirname, resolve } = require("path");
const { decode } = require("sourcemap-codec");
const assert = require("invariant");

class Node {
  constructor(opts) {
    assert(opts.file || opts.content != null, "Sources must have a `file` path or `content` string");

    this.file = opts.file ? resolve(opts.file) : null;
    this.content = opts.content;

    this.map = null;
    this.mappings = null;
    this.sources = null;
    this.isOriginalSource = null;

    this._stats = {
      decodingTime: 0,
      encodingTime: 0,
      tracingTime: 0,

      untraceable: 0
    };
  }

  loadMappings(opts) {
    let map = opts.getMap(this.file) || null;
    if (typeof map == "string") {
      map = JSON.parse(map);
    } else if (map == null) {
      if (this.content == null) {
        this.content = opts.readFile(this.file);
        if (this.content == null) {
          throw Error(`Source does not exist: '${this.file}'`);
        }
      }
      const url = parseMapUrl(this.content);
      if (url) {
        if (/^data:/.test(url)) {
          const match = /;base64,([+a-z/0-9]+)$/.exec(url);
          assert(match, "Sourcemap URL is not base64-encoded");
          map = JSON.parse(atob(match[1]));
        } else {
          const file = resolve(dirname(this.file), decodeURI(url));
          map = opts.readFile(file);
          if (map == null) {
            throw Error(`Sourcemap does not exist: '${file}'`);
          }
          map = JSON.parse(map);
        }
      }
    }
    if (map) {
      this.map = map;
      const decodingStart = process.hrtime();
      this.mappings = decode(map.mappings);
      const decodingTime = process.hrtime(decodingStart);
      this._stats.decodingTime = 1e9 * decodingTime[0] + decodingTime[1];
      return true;
    }
    this.isOriginalSource = true;
    return false;
  }

  loadSources(opts) {
    assert(this.map, "Cannot load sources without a sourcemap");

    const sourcesContent = this.map.sourcesContent || [];
    const sourceRoot = resolve(
      this.file ? dirname(this.file) : "",
      this.map.sourceRoot || ""
    );

    this.sources = this.map.sources.map((source, i) => {
      const node = new Node({
        file: resolve(sourceRoot, source),
        content: sourcesContent[i]
      });
      if (node.loadMappings(opts)) {
        node.loadSources(opts);
      }
      return node;
    });
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
