# sorcery v1.0.0

Fork of [Rich-Harris/sorcery][1] that caters toward build tools.

[1]: https://github.com/Rich-Harris/sorcery

```js
const sorcery = require('sorcery');

// Returns a v3 source map.
const sourceMap = sorcery([
  {content: minifiedCode, map: {...}},
  transpiledCode, // <= a string with an inline map
  sourceCode, // <= the original source code
]);

// Provide hooks into your file cache.
const sourceMap = sorcery(sources, {
  // Return a string or null for file requests.
  readFile(file) {
    return cache[file].read();
  },
  // Return a string, object, or null for sourcemap requests.
  getMap(file) {
    return cache[file].sourceMap;
  }
});
```

### Options
- `sourceRoot: ?string` the root of all source paths in the new sourcemap
- `generatedFile: ?string` the file that the new sourcemap accompanies
- `includeContent: ?boolean` whether to embed source contents in the new sourcemap (default: `true`)
- `readFile(file)` read the contents of a file (may be a source or sourcemap)
- `getMap(file)` get a sourcemap from your file cache

The `sourceRoot` option defaults to the parent directory of either the
`generatedFile` path or the filename of the last source in the chain.
The working directory is used if all else fails.

## License

MIT
