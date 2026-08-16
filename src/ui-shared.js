"use strict";

var QUEUE_VIEW_TYPE = "term-interval-review-queue";
var CARD_VIEW_TYPE = "term-interval-review-card";
var SAVE_DELAY = 650;
var STARTUP_SCAN_DELAY = 6e3;
var SCAN_YIELD_EVERY = 6;
function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function isReviewCard(value) {
  if (!value || typeof value !== "object") return false;
  const card = value;
  return typeof card.id === "string" && typeof card.term === "string" && typeof card.definition === "string" && typeof card.sourcePath === "string" && typeof card.occurrence === "number" && typeof card.stage === "number" && typeof card.dueAt === "number";
}
function isGrowthCardState(value) {
  if (!value || typeof value !== "object") return false;
  const validIncorrectStreak = value.incorrectStreak === void 0 || Number.isFinite(value.incorrectStreak) && value.incorrectStreak >= 0;
  return (value.phase === "building" || value.phase === "retention") && Number.isFinite(value.step) && value.step >= 1 && validIncorrectStreak;
}
function getCardKind(card) {
  return card.kind === "list" ? "list" : "definition";
}
function hasSameStringItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
function isFileScanState(value) {
  if (!value || typeof value !== "object") return false;
  const state = value;
  return typeof state.mtime === "number" && Number.isFinite(state.mtime) && typeof state.size === "number" && Number.isFinite(state.size);
}
function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

module.exports = { QUEUE_VIEW_TYPE, CARD_VIEW_TYPE, SAVE_DELAY, STARTUP_SCAN_DELAY, SCAN_YIELD_EVERY, createId, isReviewCard, isGrowthCardState, getCardKind, hasSameStringItems, isFileScanState, formatDateTime };
