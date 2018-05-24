const { dirname, relative, resolve } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");
const assert = require("invariant");
const Node = require("./Node.js");

function sorcery(chain, opts = {}) {
  const len = chain.length;
  assert(len >= 2, "`chain` array must have 2+ values");

  // Hooks into the user's file cache.
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  const nodes = new Array(len);

  // Process the chain in reverse order.
  for (let i = len - 1; i >= 0; i--) {
    const source = chain[i];
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

  // The last node might be generated.
  nodes[len - 1].loadSources(opts);

  // Trace through the entire chain.
  const names = [], sources = [];
  const mappings = resolveMappings(nodes[0], names, sources);

  const generatedFile = opts.generatedFile || nodes[0].file;
  const sourceRoot = opts.sourceRoot
    ? resolve(opts.sourceRoot)
    : generatedFile
      ? dirname(generatedFile)
      : process.cwd();

  const includeContent = opts.includeContent !== false;
  const sourcesContent = sources.map(
    includeContent ? opts.readFile : () => null
  );

  return new SourceMap({
    file: generatedFile ? slash(relative(sourceRoot, generatedFile)) : null,
    sources: sources.map(source => slash(relative(sourceRoot, source))),
    sourceRoot: slash(sourceRoot),
    sourcesContent,
    names,
    mappings
  });
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
