"use strict";

const { getCardKind, isGrowthCardState, isReviewCard } = require("../core/card");
const { isFileScanState } = require("../core/file-state");
const { REVIEW_INTERVALS, clampStage } = require("../core/schedule");
const { normalizeSettings } = require("../core/settings");

const DATA_VERSION = 12;
const FILE_STATE_VERSIONS = new Set([9, 10, 11, 12]);
const GROWTH_STATE_VERSIONS = new Set([10, 11, 12]);

function hydratePluginData(raw, now = Date.now()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const settings = normalizeSettings(
    source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)
      ? source.settings
      : null
  );
  const cards = (Array.isArray(source.cards) ? source.cards : [])
    .filter(isReviewCard)
    .map((card) => ({
      ...card,
      kind: getCardKind(card),
      listTerms: getCardKind(card) === "list" && Array.isArray(card.listTerms)
        ? card.listTerms.filter((term) => typeof term === "string" && term.length > 0)
        : undefined,
      stage: clampStage(card.stage),
      dueAt: Number.isFinite(card.dueAt) ? card.dueAt : now + REVIEW_INTERVALS[0],
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt : now,
      updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : now,
      lastReviewedAt: Number.isFinite(card.lastReviewedAt) ? card.lastReviewedAt : null,
      correctCount: Number.isFinite(card.correctCount) ? card.correctCount : 0,
      incorrectCount: Number.isFinite(card.incorrectCount) ? card.incorrectCount : 0,
      suppressSleepWindowEarlyReview: card.suppressSleepWindowEarlyReview === true
    }));
  const fileStates = {};
  if (FILE_STATE_VERSIONS.has(source.version)
    && source.fileStates && typeof source.fileStates === "object" && !Array.isArray(source.fileStates)) {
    for (const [path, state] of Object.entries(source.fileStates)) {
      if (isFileScanState(state)) fileStates[path] = state;
    }
  }
  const urgentSourcePaths = new Set(
    Array.isArray(source.urgentSourcePaths)
      ? source.urgentSourcePaths.filter((path) => typeof path === "string" && path.length > 0)
      : []
  );
  const cardIds = new Set(cards.map((card) => card.id));
  const pinnedCardIds = new Set(
    Array.isArray(source.pinnedCardIds)
      ? source.pinnedCardIds.filter((id) => typeof id === "string" && cardIds.has(id))
      : []
  );
  const growthCardStates = new Map();
  if (GROWTH_STATE_VERSIONS.has(source.version) && Array.isArray(source.growthCardStates)) {
    for (const entry of source.growthCardStates) {
      if (!entry || typeof entry !== "object" || typeof entry.cardId !== "string"
        || !cardIds.has(entry.cardId) || !isGrowthCardState(entry)) continue;
      growthCardStates.set(entry.cardId, {
        phase: entry.phase,
        step: Math.max(1, Math.trunc(entry.step)),
        incorrectStreak: Math.min(2, Math.max(0, Math.trunc(entry.incorrectStreak ?? 0)))
      });
    }
  }
  return { cards, fileStates, growthCardStates, pinnedCardIds, settings, urgentSourcePaths };
}

function serializePluginData(state) {
  return {
    version: DATA_VERSION,
    settings: state.settings,
    cards: state.cards,
    fileStates: state.fileStates,
    urgentSourcePaths: [...state.urgentSourcePaths].sort((left, right) => left.localeCompare(right, "ru")),
    pinnedCardIds: [...state.pinnedCardIds].sort((left, right) => left.localeCompare(right, "ru")),
    growthCardStates: [...state.growthCardStates.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "ru"))
      .map(([cardId, growth]) => ({
        cardId,
        phase: growth.phase,
        step: growth.step,
        incorrectStreak: growth.incorrectStreak ?? 0
      }))
  };
}

module.exports = { DATA_VERSION, hydratePluginData, serializePluginData };
