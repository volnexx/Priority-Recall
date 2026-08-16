"use strict";

function stripBoldMarkers(value) {
  return String(value ?? "").replaceAll("**", "");
}

function getCardKind(card) {
  return card?.kind === "list" ? "list" : "definition";
}

function normalizeStoredTerm(term) {
  return stripBoldMarkers(term)
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, "")
    .trim();
}

function createCardId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isReviewCard(value) {
  if (!value || typeof value !== "object") return false;
  return typeof value.id === "string"
    && typeof value.term === "string"
    && typeof value.definition === "string"
    && typeof value.sourcePath === "string"
    && typeof value.occurrence === "number"
    && typeof value.stage === "number"
    && typeof value.dueAt === "number";
}

function isGrowthCardState(value) {
  if (!value || typeof value !== "object") return false;
  const validIncorrectStreak = value.incorrectStreak === undefined
    || Number.isFinite(value.incorrectStreak) && value.incorrectStreak >= 0;
  return (value.phase === "building" || value.phase === "retention")
    && Number.isFinite(value.step)
    && value.step >= 1
    && validIncorrectStreak;
}

function hasSameStringItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

module.exports = {
  createCardId,
  getCardKind,
  hasSameStringItems,
  isGrowthCardState,
  isReviewCard,
  normalizeStoredTerm,
  stripBoldMarkers
};
