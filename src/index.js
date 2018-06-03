const { isAbsolute, relative } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");
const assert = require("invariant");
const Node = require("./Node.js");

function sorcery(chain, opts = {}) {
  const file = opts.generatedFile || "";
  assert(!isAbsolute(file), "`generatedFile` cannot be absolute");

  // Hooks into the user's file cache.
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  const len = chain.length;
  const nodes = new Array(len);

  // Process the chain in reverse order.
  for (let i = len - 1; i >= 0; i--) {
    const source = chain[i];
    const node = new Node({
      file: source.file,
      content: source.content || source,
    });

    node.map = source.map || null;
    node.loadMappings(opts);
    nodes[i] = node;

    const parent = nodes[i + 1];
    if (parent) {
      assert(node.map, "Only the last source can have no sourcemap");
      node.sources = [parent];
    }
  }

  // There's no point in creating a new sourcemap if the chain
  // is only two nodes and one of them is the original source.
  if (nodes[len - 1].loadSources(opts) || nodes.length > 2) {
    const names = [];
    const sources = [];
    const mappings = resolveMappings(nodes[0], names, sources);

    // Include sources content by default.
    const sourcesContent =
      opts.includeContent !== false
        ? sources.map(source => {
          return source ? opts.readFile(source) : null;
        }) : new Array(sources.length).fill(null);

    let sourceRoot = "";
    if (sources[0] || sources.length > 1) {
      sourceRoot = slash(opts.sourceRoot || "");
      assert(!isAbsolute(sourceRoot), "`sourceRoot` cannot be absolute");
    }

    return new SourceMap({
      file,
      sources: sources.map(source => {
        return source ? relative(sourceRoot, slash(source)) : null;
      }),
      sourceRoot,
      sourcesContent,
      names,
      mappings
    });
  }

  // There's nothing to trace.
  return new SourceMap(nodes[0].map);
}

module.exports = sorcery;

// Where the magic happens.
function resolveMappings(node, names, sources) {
  let i = node.mappings.length;
  let mappings = new Array(i);
  while (i--) {
    let resolved = [], len = 0;
    mappings[i] = resolved;

    const line = node.mappings[i];
    for (let j = 0; j < line.length; j++) {
      let segment = line[j];
      if (segment.length >= 4) {
        const traced = node.sources[segment[1]].trace(
          segment[2], // source code line
          segment[3], // source code column
          node.map.names[segment[4]]
        );
        if (traced) {
          let sourceIndex = sources.indexOf(traced.source);
          if (sourceIndex == -1) {
            sourceIndex = sources.length;
            sources.push(traced.source);
          }

          // the resolved segment
          resolved[len++] = segment = [
            segment[0], // generated code column
            sourceIndex,
            traced.line - 1,
            traced.column
          ];

          if (traced.name) {
            let nameIndex = names.indexOf(traced.name);
            if (nameIndex == -1) {
              nameIndex = names.length;
              names.push(traced.name);
            }
            segment[4] = nameIndex;
          }
        }
      }
    }
  }
  return encode(mappings);
}

function slash(path) {
  return path.replace(/\\/g, "/");
}

function noop() {
  return null;
}
