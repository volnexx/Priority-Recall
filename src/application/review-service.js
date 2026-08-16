"use strict";

const { normalizeSettings } = require("../core/settings");
const { reviewCard, toggleGrowth } = require("./review-engine");

class ReviewService {
  constructor({
    state,
    persist,
    resetQueue,
    refreshQueue,
    refreshPriorityControls,
    refreshCard,
    now = () => Date.now()
  }) {
    this.state = state;
    this.persist = persist;
    this.resetQueue = resetQueue;
    this.refreshQueue = refreshQueue;
    this.refreshPriorityControls = refreshPriorityControls;
    this.refreshCard = refreshCard;
    this.now = now;
  }

  async toggleUrgentSource(path) {
    if (this.state.urgentSourcePaths.has(path)) this.state.urgentSourcePaths.delete(path);
    else this.state.urgentSourcePaths.add(path);
    this.resetQueue();
    await this.persist();
    this.refreshQueue(true);
    this.refreshPriorityControls();
  }

  async togglePinnedCard(id) {
    if (!this.state.getCard(id)) return;
    if (this.state.pinnedCardIds.has(id)) this.state.pinnedCardIds.delete(id);
    else this.state.pinnedCardIds.add(id);
    await this.persist();
    this.refreshQueue(true);
    this.refreshPriorityControls();
  }

  async toggleGrowthCard(id) {
    const index = this.state.cards.findIndex((card) => card.id === id);
    const card = this.state.cards[index];
    if (index < 0 || !card) return;
    const result = toggleGrowth(card, this.state.getGrowthState(id), this.now());
    if (!result.changed) return;
    this.state.cards[index] = result.card;
    if (result.state === null) this.state.growthCardStates.delete(id);
    else this.state.growthCardStates.set(id, result.state);
    this.resetQueue();
    await this.persist();
    this.refreshQueue(true);
    this.refreshCard(id);
  }

  async updateSleepSetting(key, value) {
    this.state.settings = normalizeSettings({ ...this.state.settings, [key]: value });
    await this.persist();
    this.refreshQueue(true);
    this.refreshPriorityControls();
  }

  async review(cardId, correct) {
    const index = this.state.cards.findIndex((card) => card.id === cardId);
    const card = this.state.cards[index];
    if (index < 0 || !card) return null;
    const result = reviewCard({
      card,
      growthState: this.state.getGrowthState(cardId),
      correct,
      now: this.now(),
      settings: this.state.settings
    });
    this.state.cards[index] = result.card;
    if (result.growthState === null) this.state.growthCardStates.delete(cardId);
    else if (result.growthState) this.state.growthCardStates.set(cardId, result.growthState);
    await this.persist();
    this.refreshQueue(true);
    return {
      card: result.card,
      growthFeedback: result.growthFeedback,
      growthAutoReleased: result.growthAutoReleased
    };
  }
}

module.exports = { ReviewService };
