const { basename, dirname, relative, resolve } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");

class Chain {
  constructor(node) {
    this.node = node;

    this._stats = {};
  }

  stat() {
    return {
      selfDecodingTime: this._stats.decodingTime / 1e6,
      totalDecodingTime:
        (this._stats.decodingTime + tally(this.node.sources, "decodingTime")) /
        1e6,

      encodingTime: this._stats.encodingTime / 1e6,
      tracingTime: this._stats.tracingTime / 1e6,

      untraceable: this._stats.untraceable
    };
  }

  apply(opts = {}) {
    let allNames = [];
    let allSources = [];

    const last = this.node;
    const applySegment = (segment, result) => {
      if (segment.length < 4) return;

      const traced = last.sources[segment[1]].trace(
        // source
        segment[2], // source code line
        segment[3], // source code column
        last.map.names[segment[4]]
      );

      if (!traced) {
        this._stats.untraceable += 1;
        return;
      }

      let sourceIndex = allSources.indexOf(traced.source);
      if (!~sourceIndex) {
        sourceIndex = allSources.length;
        allSources.push(traced.source);
      }

      let newSegment = [
        segment[0], // generated code column
        sourceIndex,
        traced.line - 1,
        traced.column
      ];

      if (traced.name) {
        let nameIndex = allNames.indexOf(traced.name);
        if (!~nameIndex) {
          nameIndex = allNames.length;
          allNames.push(traced.name);
        }

        newSegment[4] = nameIndex;
      }

      result[result.length] = newSegment;
    };

    // Trace mappings
    const tracingStart = process.hrtime();

    let i = last.mappings.length;
    let resolved = new Array(i);

    let j, line, result;

    while (i--) {
      line = last.mappings[i];
      resolved[i] = result = [];

      for (j = 0; j < line.length; j += 1) {
        applySegment(line[j], result);
      }
    }

    let tracingTime = process.hrtime(tracingStart);
    this._stats.tracingTime = 1e9 * tracingTime[0] + tracingTime[1];

    // Encode mappings
    const encodingStart = process.hrtime();
    const mappings = encode(resolved);
    const encodingTime = process.hrtime(encodingStart);
    this._stats.encodingTime = 1e9 * encodingTime[0] + encodingTime[1];

    const generatedFile = opts.generatedFile || last.file;
    const sourceRoot = opts.sourceRoot
      ? resolve(opts.sourceRoot)
      : generatedFile
        ? dirname(generatedFile)
        : process.cwd();

    const includeContent = opts.includeContent !== false;
    const sourcesContent = allSources
      .map(includeContent ? opts.readFile : () => null);

    return new SourceMap({
      file: generatedFile ? relative(sourceRoot, generatedFile) : null,
      sources: allSources.map(source => slash(relative(sourceRoot, source))),
      sourceRoot: slash(sourceRoot),
      sourcesContent,
      names: allNames,
      mappings
    });
  }

  trace(oneBasedLineIndex, zeroBasedColumnIndex) {
    return this.node.trace(oneBasedLineIndex - 1, zeroBasedColumnIndex, null);
  }
}

module.exports = Chain;

function tally(nodes, stat) {
  return nodes.reduce((total, node) => {
    return total + node._stats[stat];
  }, 0);
}

function slash(path) {
  return typeof path === "string" ? path.replace(/\\/g, "/") : path;
}
