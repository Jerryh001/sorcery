# sorcery v1.4.0

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
  // Return a string, object, false, or null for sourcemap requests.
  getMap(file) {
    return cache[file].sourceMap;
  }
});
```

### Options
- `sourceRoot: ?string` a relative path prepended to each source path when consumed
- `generatedFile: ?string` where the generated file lives relative to the new sourcemap
- `includeContent: ?boolean` whether to embed source contents in the new sourcemap (default: `true`)
- `readFile(file)` read the contents of a file (may be a source or sourcemap)
- `getMap(file)` get a sourcemap from your file cache

When defined, the `sourceRoot` option is assumed to be relative to the
sourcemap's directory. When the sourcemap is consumed, the `sourceRoot`
prepended to every path in its `sources` array.

When defined, the `generatedFile` option is assumed to be relative to the
sourcemap's directory. This option merely sets the `file` property of the
returned `SourceMap` object. Its value should be identical to wherever you save
the content in relation to the generated sourcemap.

The `readFile` function is **required** if any source is missing its content.
This usually occurs when a sourcemap has no `sourcesContent` property.
It must return either a string or null.

The `getMap` function must return either a JSON string, a sourcemap object, or
null. If this option is undefined (or you return null), the generated file is
parsed for a `sourceMappingURL` comment at the end. If you already know that
a file has no sourcemap, you should return false to avoid extra work.

## `sorcery.portal`

The `portal` function takes the same arguments as `sorcery`, but it returns a
`trace` function instead of a `SourceMap` object.

The returned function traces a `(line: number, column: number)` pair to its
original source. It returns an object (or null if the pair is untraceable)
which has the following properties:

- `source: ?string` the original filename
- `line: number` the original line
- `column: number` the original column
- `name: ?string` the original identifier

```js
const trace = sorcery.portal(chain, options);
trace(0 /* zero-based line */, 0 /* zero-based column */); // {source, line, column, name} || null
```

## License

MIT
