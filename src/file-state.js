"use strict";

function createFileScanState(stat) {
  return { mtime: stat.mtime, size: stat.size };
}
function isSameFileState(left, right) {
  return left?.mtime === right.mtime && left.size === right.size;
}
function pruneFileStates(states, existingPaths) {
  const next = {};
  let changed = false;
  for (const [path, state] of Object.entries(states)) {
    if (existingPaths.has(path)) next[path] = state;
    else changed = true;
  }
  return { states: next, changed };
}

module.exports = { createFileScanState, isSameFileState, pruneFileStates };
