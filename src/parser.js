"use strict";

var FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
var BOLD_DEFINITION_PATTERN = /\*\*([^*\r\n]+?)\*\*/gu;
var DEFINITION_DELIMITER = "\u2014";
var HEADING_PATTERN = /^\s{0,3}#{1,6}[ \t]+(.+?)[ \t]*$/u;
function parseDefinitionsFromLine(line) {
  const definitions = [];
  for (const match of line.matchAll(BOLD_DEFINITION_PATTERN)) {
    const content = match[1] ?? "";
    const delimiter = content.indexOf(DEFINITION_DELIMITER);
    if (delimiter <= 0) continue;
    const term = content.slice(0, delimiter).trim();
    const definition = content.slice(delimiter + DEFINITION_DELIMITER.length).trim();
    if (term.length === 0 || definition.length === 0) continue;
    definitions.push({ term, definition });
  }
  return definitions;
}
function parseListTermsFromLine(line) {
  const terms = [];
  for (const match of line.matchAll(BOLD_DEFINITION_PATTERN)) {
    const content = (match[1] ?? "").trim();
    if (content.length === 0) continue;
    const delimiter = content.indexOf(DEFINITION_DELIMITER);
    if (delimiter === -1) {
      terms.push(content);
      continue;
    }
    if (delimiter <= 0) continue;
    const term = content.slice(0, delimiter).trim();
    const definition = content.slice(delimiter + DEFINITION_DELIMITER.length).trim();
    if (term.length === 0 || definition.length === 0) continue;
    terms.push(term);
  }
  return terms;
}
function parseTermLines(content) {
  const lines = content.split(/\r?\n/u);
  const parsed = [];
  const occurrences = /* @__PURE__ */ new Map();
  let inFrontmatter = lines[0]?.trim() === "---";
  let fenceCharacter = null;
  let fenceLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (index > 0 && (trimmed === "---" || trimmed === "...")) inFrontmatter = false;
      continue;
    }
    const fence = line.match(FENCE_PATTERN)?.[1];
    if (fence) {
      const character = fence[0];
      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = fence.length;
      } else if (character === fenceCharacter && fence.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter !== null) continue;
    for (const { term, definition } of parseDefinitionsFromLine(line)) {
      const occurrence = occurrences.get(term) ?? 0;
      occurrences.set(term, occurrence + 1);
      parsed.push({ kind: "definition", term, definition, occurrence, line: index + 1 });
    }
  }
  return parsed;
}
function parseDefinitionLists(content) {
  const lines = content.split(/\r?\n/u);
  const parsed = [];
  const occurrences = /* @__PURE__ */ new Map();
  let inFrontmatter = lines[0]?.trim() === "---";
  let fenceCharacter = null;
  let fenceLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (index > 0 && (trimmed === "---" || trimmed === "...")) inFrontmatter = false;
      continue;
    }
    const fence = line.match(FENCE_PATTERN)?.[1];
    if (fence) {
      const character = fence[0];
      if (fenceCharacter === null) {
        fenceCharacter = character;
        fenceLength = fence.length;
      } else if (character === fenceCharacter && fence.length >= fenceLength) {
        fenceCharacter = null;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceCharacter !== null) continue;
    const headingMatch = line.match(HEADING_PATTERN);
    if (!headingMatch) continue;
    const title = (headingMatch[1] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim();
    if (title.length === 0) continue;
    const occurrence = occurrences.get(title) ?? 0;
    occurrences.set(title, occurrence + 1);
    let termIndex = index + 1;
    let lineTerms = parseListTermsFromLine(lines[termIndex] ?? "");
    if (lineTerms.length === 0) continue;
    const terms = [...lineTerms];
    while (termIndex + 1 < lines.length) {
      let candidateIndex = termIndex + 1;
      if ((lines[candidateIndex] ?? "").trim().length === 0) {
        candidateIndex += 1;
        if ((lines[candidateIndex] ?? "").trim().length === 0) break;
      }
      lineTerms = parseListTermsFromLine(lines[candidateIndex] ?? "");
      if (lineTerms.length === 0) break;
      terms.push(...lineTerms);
      termIndex = candidateIndex;
    }
    if (terms.length < 2) continue;
    parsed.push({
      kind: "list",
      term: title,
      definition: terms.join("\n"),
      listTerms: terms,
      occurrence,
      line: index + 1
    });
  }
  return parsed;
}

module.exports = { FENCE_PATTERN, BOLD_DEFINITION_PATTERN, DEFINITION_DELIMITER, HEADING_PATTERN, parseDefinitionsFromLine, parseListTermsFromLine, parseTermLines, parseDefinitionLists };
