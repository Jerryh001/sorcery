const emptyArray = [];

// NOTE: This function mutates the given node.
module.exports = function blend(node) {
  let mappings = []; // traced lines
  let sources = [];  // traced sources
  let names = [];    // traced symbols

  // Precompute which source/line/column triples are mapped by the given node.
  // These references are useful when interweaving old segments.
  const refs = Object.keys(node.sources).map(() => []);
  node.mappings.forEach(segments => {
    let segment, lines, columns;
    for (let i = 0; i < segments.length; i++) {
      segment = segments[i];

      lines = refs[segment[1]];
      if (!lines) refs[segment[1]] = lines = [];

      columns = lines[segment[2]];
      if (columns) {
        uniqueAscendingInsert(columns, segment[3]);
      } else {
        lines[segment[2]] = [segment[3]];
      }
    }
  });

  let traced;     // the traced line mapping
  let untraced;   // the untraced line mapping

  function addSegment(segment, source) {
    if (source) {
      segment[1] = uniq(sources, source.sources[segment[1]]);
      if (segment.length === 5) {
        segment[4] = uniq(names, source.names[segment[4]]);
      }
    } else if (segment.length === 5) {
      segment[4] = uniq(names, node.map.names[segment[4]]);
    }
    traced.push(segment);
  }

  let tracedLine;         // the last traced line
  let generatedLine = -1; // the current line
  let sourceIndex = -1;   // source of last traced segment
  let sourceLine;         // source line of last traced segment

  // Find the next line with segments.
  function nextLine() {
    tracedLine = generatedLine;
    while (++generatedLine < node.mappings.length) {
      untraced = node.mappings[generatedLine];
      if (untraced.length) return true;
    }
  }

  // Provide mappings for lines between the
  // last traced line and the current line.
  function fillSkippedLines() {
    const skipped = generatedLine - (tracedLine + 1);
    if (skipped !== 0) {
      let line = tracedLine;

      // Take line mappings from the current source.
      if (sourceIndex !== -1) {
        const source = node.sources[sourceIndex];
        if (source && source.map) {
          while (line < generatedLine - 1) {
            if (++sourceLine !== source.mappings.length) {
              mappings[++line] = traced = [];

              // Check referenced columns to avoid duplicate segments.
              const columns = refs[sourceIndex][sourceLine] || emptyArray;
              let prevColumn = -1;

              // Interweave old segments from the current source.
              const segments = source.mappings[sourceLine];
              for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                if (!hasValueBetween(columns, prevColumn, segment[0] + 1)) {
                  addSegment(segment.slice(0), source);
                  prevColumn = segment[0];
                } else break;
              }
            }
            else { // End of source file.
              sourceIndex = -1;
              break;
            }
          }
        }
      }

      // Default to empty arrays for unmapped lines.
      while (++line < generatedLine) {
        mappings[line] = emptyArray;
      }
    }
  }

  while (nextLine()) {
    fillSkippedLines();

    // Trace the segments of this generated line.
    mappings[generatedLine] = traced = [];

    // Interweave old segments before the first mapped column of each line.
    const sourceColumn = untraced[0][3];
    if (sourceIndex !== -1 && sourceColumn !== 0) {
      const source = node.sources[sourceIndex];
      if (source && source.map) {
        const segments = sourceLine < source.mappings.length - 1
          ? source.mappings[++sourceLine] : emptyArray;

        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          if (segment[0] < sourceColumn) {
            addSegment(segment.slice(0), source);
          } else break;
        }
      }
    }

    const last = untraced.length - 1;
    untraced.forEach((curr, i) => {
      [, sourceIndex, sourceLine] = curr;

      const source = node.sources[sourceIndex];
      if (source === null) {
        curr[1] = uniq(sources, null);
        return addSegment(curr);
      }
      if (source.map === null) {
        curr[1] = uniq(sources, source);
        return addSegment(curr);
      }

      const next = i !== last ? untraced[i + 1] : null;
      const sourceColumn = curr[3];
      const generatedColumn = curr[0];

      // Find the first segment with a greater column.
      const segments = source.mappings[sourceLine];
      let j = findGreaterColumn(segments, sourceColumn);

      // A "base segment" is required for tracing to a grand-parent.
      let base;
      if (--j !== -1) {
        base = segments[j];
        curr[1] = uniq(sources, source.sources[base[1]]);
        curr[2] = base[2];
        curr[3] = base[3] + sourceColumn - base[0];
        if (base[0] === sourceColumn && base.length === 5) {
          curr[4] = uniq(names, source.names[base[4]]);
        }
      } else {
        curr[1] = uniq(sources, null);
      }

      addSegment(curr);

      // Check referenced columns to avoid duplicate segments.
      const columns = refs[sourceIndex][sourceLine] || emptyArray;
      let prevColumn = base ? base[0] : -1;

      // Interweave old segments between our current and next segments.
      const nextColumn = next && next[2] === sourceLine ? next[3] : 1/0;
      while (++j < segments.length) {
        let segment = segments[j];
        if (segment[0] < nextColumn) {
          if (!hasValueBetween(columns, prevColumn, segment[0] + 1)) {
            segment = segment.slice(0);
            segment[0] += (generatedColumn - sourceColumn);
            addSegment(segment, source);
            prevColumn = segment[0];
          } else break;
        } else break;
      }
    });
  }
  fillSkippedLines();

  node.mappings = mappings;
  node.sources = sources;
  node.names = names;
  return node;
};

// Check if a value exists before pushing it to an array.
// Return the new or existing index of the value.
function uniq(arr, val) {
  const i = arr.indexOf(val);
  return ~i ? i : arr.push(val) - 1;
}

// Get the first segment with a greater column.
function findGreaterColumn(segments, column) {
  let low = 0, high = segments.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    segments[mid][0] <= column ? (low = mid + 1) : (high = mid);
  }
  return low;
}

// The range is exclusive.
function hasValueBetween(arr, start, end) {
  let low = 0, high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const val = arr[mid];
    if (val <= start) {
      low = mid + 1;
    } else if (val >= end) {
      high = mid;
    } else {
      return true;
    }
  }
  return false;
}

// Insert unique values in ascending order.
function uniqueAscendingInsert(arr, val) {
  let low = 0, high = arr.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const x = arr[mid];
    if (x === val) return;
    if (x < val) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  arr.splice(low, 0, val);
}
