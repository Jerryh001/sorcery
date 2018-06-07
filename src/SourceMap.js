
class SourceMap {
  constructor(opts) {
    this.version = 3;

    this.file = opts.file;
    this.sources = opts.sources;
    this.sourceRoot = opts.sourceRoot;
    this.sourcesContent = opts.sourcesContent;
    this.names = opts.names;
    this.mappings = opts.mappings;
  }

  toString() {
    return JSON.stringify(this);
  }

  toUrl() {
    return (
      "data:application/json;charset=utf-8;base64," + btoa(this.toString())
    );
  }
}

module.exports = SourceMap;

// Encode a Base64 string.
function btoa(str) {
  return Buffer.from(str).toString("base64");
}
