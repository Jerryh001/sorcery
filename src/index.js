const { isAbsolute, relative } = require("path");
const { encode } = require("sourcemap-codec");
const SourceMap = require("./SourceMap.js");
const blend = require("./blend.js");
const Node = require("./Node.js");

function sorcery(chain, opts = {}) {
  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  const file = opts.generatedFile || "";
  if (isAbsolute(file)) {
    throw new Error("`generatedFile` cannot be absolute");
  }

  const nodes = loadChain(chain, opts);
  if (!nodes) return null;

  const main = nodes[0];
  trace(main);

  let sourceRoot = "";
  let sourcesContent;
  if (main.sources[0] || main.sources.length > 1) {
    if (opts.sourceRoot) {
      sourceRoot = slash(opts.sourceRoot);
    }
    if (opts.includeContent !== false) {
      sourcesContent = main.sources.map(source =>
        source && (source.content || opts.readFile(source.file)) || null);
    }
  }

  const sources = main.sources.map(source => {
    if (source && source.file) {
      source = slash(source.file);
      return sourceRoot ? relative(sourceRoot, source) : source;
    }
    return null;
  });

  return new SourceMap({
    file,
    sources,
    sourceRoot,
    sourcesContent,
    names: main.names,
    mappings: encode(main.mappings),
  });
}

// Create a function that can trace a (line, column) pair to
// its original source. Returns null if no sourcemap exists.
sorcery.portal = function(chain, opts = {}) {
  if (!Array.isArray(chain)) {
    chain = [chain];
  }

  let main;
  const nodes = loadChain(chain, opts);
  if (nodes) {
    main = nodes[0];
  } else {
    main = loadNode(chain[0], opts);
    if (main.map) {
      main.loadSources(opts);
    } else return null;
  }

  trace(main);
  main.final = !main.sources.some(source => source !== null);

  // `line` is one-based and `column` is zero-based
  return function portal(line, column) {
    let segments = main.mappings[--line];
    let i = -1; while (++i !== segments.length) {
      if (segments[i][0] > column) break;
    }

    let l = line;
    if (--i === -1) {
      while (true) {
        if (--l !== -1) {
          segments = main.mappings[l];
          i = segments.length - 1;
          if (i !== -1) break;
        } else return null;
      }
    }

    const segment = segments[i];
    const source = main.sources[segment[1]];
    if (!source && !main.final) {
      return null;
    }

    const sourceLine = l === line
      ? segment[2] : segment[2] + line - l;
    const sourceColumn = l === line
      ? segment[3] + column - segment[0] : column;

    if (segment[3] !== sourceColumn) {
      const content = source && (source.content || opts.readFile(source));
      const line = (content || "").split("\n")[sourceLine];
      if (!line || sourceColumn >= line.length) {
        return null;
      }
    }

    const sourceName = l === line && segment[4]
      ? main.names[segment[4]] : null;

    return {
      source: source ? source.file : null,
      line: sourceLine + 1,
      column: sourceColumn,
      name: sourceName,
    };
  };
};

module.exports = sorcery;

// Load the mappings and sources of every node in the chain.
function loadChain(chain, opts) {
  if (!opts.readFile) opts.readFile = noop;
  if (!opts.getMap) opts.getMap = noop;

  const nodes = [];
  let i = 0; while (true) {
    const node = loadNode(chain[i], opts);
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

function loadNode(source, opts) {
  const node = typeof source === "string"
    ? new Node(null, source)
    : new Node(source.file, source.content);

  node.map = source.map || null;
  node.loadMappings(opts);
  return node;
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
