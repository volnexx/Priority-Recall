"use strict";

const { stripBoldMarkers } = require("./card");

function getNoteTitle(sourcePath) {
  const filename = sourcePath.split("/").at(-1) ?? sourcePath;
  return filename.replace(/\.md$/iu, "");
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/gu, " ")
    .trim();
}

function getSearchWords(value) {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function getEditDistance(left, right) {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? leftIndex) + 1,
        (previous[rightIndex] ?? rightIndex) + 1,
        (previous[rightIndex - 1] ?? rightIndex - 1) + substitutionCost
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length] ?? right.length;
}

function scoreSearchText(value, query) {
  if (value === query) return 10_000;
  if (value.startsWith(query)) return 9_000 - Math.min(value.length - query.length, 500);
  const words = getSearchWords(value);
  if (words.includes(query)) return 8_500;
  const wordPrefix = words
    .filter((word) => word.startsWith(query))
    .sort((left, right) => left.length - right.length)[0];
  if (wordPrefix) return 8_000 - Math.min(wordPrefix.length - query.length, 500);
  const position = value.indexOf(query);
  if (position >= 0) return 7_000 - Math.min(position, 500);
  if (query.length < 3) return null;
  const allowedEdits = query.length <= 4 ? 1 : Math.max(1, Math.floor(query.length * 0.28));
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of [value, ...words]) {
    if (Math.abs(candidate.length - query.length) > allowedEdits) continue;
    closestDistance = Math.min(closestDistance, getEditDistance(candidate, query));
  }
  return closestDistance > allowedEdits ? null : 5_000 - closestDistance * 250;
}

function scoreCardSearch(card, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return 0;
  const termScore = scoreSearchText(normalizeSearchText(stripBoldMarkers(card.term)), normalizedQuery);
  const definitionScore = scoreSearchText(normalizeSearchText(stripBoldMarkers(card.definition)), normalizedQuery);
  const noteScore = scoreSearchText(normalizeSearchText(getNoteTitle(card.sourcePath)), normalizedQuery);
  if (termScore === null && definitionScore === null && noteScore === null) return null;
  return Math.max(
    termScore === null ? -1 : termScore + 200,
    definitionScore === null ? -1 : definitionScore + 100,
    noteScore ?? -1
  );
}

module.exports = {
  getEditDistance,
  getNoteTitle,
  getSearchWords,
  normalizeSearchText,
  scoreCardSearch,
  scoreSearchText
};
