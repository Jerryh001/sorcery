const { isAbsolute, relative } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");
const blend = require("./blend.js");
const Node = require("./Node.js");

function sorcery(chain, opts = {}) {
  const file = opts.generatedFile || "";
  if (isAbsolute(file)) {
    throw new Error("`generatedFile` cannot be absolute");
  }

  const nodes = load(chain, opts);
  if (!nodes) return null;

  const main = nodes[0];
  trace(main);

  // Include sources content by default.
  const sourcesContent =
    opts.includeContent !== false
      ? main.sources.map(source =>
        source && (source.content || opts.readFile(source.file)) || null)
      : new Array(main.sources.length).fill(null);

  let sourceRoot = "";
  if (main.sources[0] || main.sources.length > 1) {
    sourceRoot = slash(opts.sourceRoot || "");
    if (isAbsolute(sourceRoot)) {
      throw new Error("`sourceRoot` cannot be absolute");
    }
  }

  return new SourceMap({
    file,
    sources: main.sources.map(source =>
      source && source.file ? relative(sourceRoot, slash(source.file)) : null),
    sourceRoot,
    sourcesContent,
    names: main.names,
    mappings: encode(main.mappings),
  });
}

// Return the eldest node with its sources loaded,
// or null if there's nothing to trace.
sorcery.load = function(chain, opts) {
  const nodes = load(chain, opts || {});
  return nodes ? nodes[0] : null;
};

module.exports = sorcery;

// Load the mappings and sources of every node in the chain.
function load(chain, opts) {
  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  // Hooks into the user's file cache.
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  const nodes = [];
  let i = 0; while (true) {
    const source = chain[i];
    const node = typeof source === "string"
      ? new Node(null, source)
      : new Node(source.file, source.content);

    node.map = source.map || null;
    node.loadMappings(opts);

    nodes[i] = node;
    if (i !== 0) {
      nodes[i - 1].sources = [node];
    }

    if (!node.map) {
      return i > 1 ? nodes : null;
    }

    if (++i === chain.length) {
      node.loadSources(opts);
      return (i > 1 || !node.final) ? nodes : null;
    }
  }
}

// Recursively trace mappings to their oldest sources.
function trace(node) {
  if (node && node.map) {
    let skip = true;
    node.sources.forEach(source => {
      if (trace(source)) skip = false;
    });
    if (skip) {
      node.names = node.map.names;
    } else blend(node);
    return node;
  }
  return null;
}

function slash(path) {
  return path.replace(/\\/g, "/");
}

function noop() {
  return null;
}
