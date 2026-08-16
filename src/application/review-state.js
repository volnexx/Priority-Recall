"use strict";

const { DEFAULT_SETTINGS } = require("../core/settings");

class ReviewState {
  constructor(initial = {}) {
    this.cards = initial.cards ?? [];
    this.urgentSourcePaths = initial.urgentSourcePaths ?? new Set();
    this.pinnedCardIds = initial.pinnedCardIds ?? new Set();
    this.growthCardStates = initial.growthCardStates ?? new Map();
    this.fileStates = initial.fileStates ?? {};
    this.settings = initial.settings ?? { ...DEFAULT_SETTINGS };
    this.activeSourcePath = initial.activeSourcePath ?? null;
  }

  getCard(id) {
    return this.cards.find((card) => card.id === id);
  }

  isUrgentSource(path) {
    return this.urgentSourcePaths.has(path);
  }

  isPinnedCard(id) {
    return this.pinnedCardIds.has(id);
  }

  isGrowthCard(id) {
    return this.growthCardStates.has(id);
  }

  getGrowthState(id) {
    return this.growthCardStates.get(id) ?? null;
  }

  getPriorityPinnedCardIds() {
    return new Set([...this.pinnedCardIds, ...this.growthCardStates.keys()]);
  }

  getGrowthSignature() {
    return [...this.growthCardStates.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "ru"))
      .map(([id, state]) => `${id}:${state.phase}:${state.step}:${state.incorrectStreak ?? 0}`)
      .join(",");
  }

  pruneCardReferences() {
    const cardIds = new Set(this.cards.map((card) => card.id));
    let changed = false;
    for (const cardId of [...this.pinnedCardIds]) {
      if (!cardIds.has(cardId)) {
        this.pinnedCardIds.delete(cardId);
        changed = true;
      }
    }
    for (const cardId of [...this.growthCardStates.keys()]) {
      if (!cardIds.has(cardId)) {
        this.growthCardStates.delete(cardId);
        changed = true;
      }
    }
    return changed;
  }
}

module.exports = { ReviewState };
