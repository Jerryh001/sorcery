const emptyArray = [];

// NOTE: This function mutates the given node.
module.exports = function blend(node) {
  let mappings = []; // traced lines
  let sources = [];  // traced sources
  let names = [];    // traced symbols

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
        if (source && source.map) while (line < generatedLine - 1) {
          if (++sourceLine !== source.mappings.length) {
            mappings[++line] = traced = [];

            // Copy the segments of this source line.
            const segments = source.mappings[sourceLine];
            for (let i = 0; i < segments.length; i++) {
              addSegment(segments[i].slice(0), source);
            }
          }
          else { // End of source file.
            sourceIndex = -1;
            break;
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

    // Copy parent segments that precede the first source column.
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

      let j = -1; // segment index
      const segments = source.mappings[sourceLine];

      // Find the first segment with a greater column.
      while (++j !== segments.length) {
        if (segments[j][0] > sourceColumn) break;
      }

      if (--j !== -1) {
        const prev = segments[j];

        // Assume the source of the preceding segment.
        curr[1] = uniq(sources, source.sources[prev[1]]);

        // Align with the preceding segment.
        curr[2] = prev[2];
        curr[3] = prev[3] + sourceColumn - prev[0];

        // Assume the name of the preceding segment.
        if (prev[0] === sourceColumn && prev.length === 5) {
          curr[4] = uniq(names, source.names[prev[4]]);
        }
      }
      else {
        // The grand-parent source is unknown without a preceding segment.
        curr[1] = uniq(sources, null);
      }

      addSegment(curr);

      // Copy old segments between our current and next segments.
      while (++j < segments.length) {
        let segment = segments[j];
        if (!next || segment[0] < next[3]) {
          segment = segment.slice(0);
          segment[0] += (generatedColumn - sourceColumn);
          addSegment(segment, source);
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
