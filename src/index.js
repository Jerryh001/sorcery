const Node = require("./Node.js");
const Chain = require("./Chain.js");
const assert = require("invariant");

function noop() {
  return null;
}

function sorcery(sources, opts = {}) {
  const len = sources.length;
  assert(len >= 2, "`sources` array must have 2+ values");

  // Hooks into the user's file cache.
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  const nodes = new Array(len);

  // Process the sources in reverse order.
  for (let i = len - 1; i >= 0; i--) {
    const source = sources[i];
    const node = new Node({
      file: source.file,
      content: source.content || source,
    });

    if (source.map) {
      node.isOriginalSource = false;
      node.map = typeof source.map == "string"
        ? JSON.parse(source.map)
        : source.map;
    } else {
      node.loadMappings(opts);
    }

    const parent = nodes[i + 1];
    if (parent) {
      assert(node.map, "Only the last source can have no sourcemap");
      node.sources = [parent];
    }
    nodes[i] = node;
  }

  // The last source may have a sourcemap.
  nodes[len - 1].loadSources(opts);

  // Trace back to the last source(s).
  return (new Chain(nodes[0])).apply(opts);
}

module.exports = sorcery;
