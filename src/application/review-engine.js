"use strict";

const { beginGrowth, GROWTH_AUTO_RELEASE_STAGE, reviewGrowthStep } = require("../core/growth");
const {
  isSleepWindowEarlyReview,
  scheduleCorrect,
  scheduleIncorrect,
  scheduleSleepWindowReview
} = require("../core/schedule");

function toggleGrowth(card, currentState, now) {
  if (currentState) return { card, state: null, changed: true };
  const started = beginGrowth(card, now);
  return started
    ? { ...started, changed: true }
    : { card, state: null, changed: false };
}

function reviewCard({ card, growthState, correct, now, settings }) {
  if (growthState?.phase === "building") {
    const result = reviewGrowthStep(card, growthState, correct, now);
    if (result) {
      return {
        card: result.card,
        growthState: result.state,
        growthFeedback: result.feedback,
        growthAutoReleased: false
      };
    }
    growthState = null;
  }

  const sleepWindowReview = isSleepWindowEarlyReview(card, now, settings);
  const updated = sleepWindowReview
    ? scheduleSleepWindowReview(card, now, correct)
    : correct
      ? scheduleCorrect(card, now)
      : scheduleIncorrect(card, now);
  const growthAutoReleased = growthState?.phase === "retention"
    && correct
    && !sleepWindowReview
    && updated.stage >= GROWTH_AUTO_RELEASE_STAGE;
  return {
    card: updated,
    growthState: growthAutoReleased ? null : growthState,
    growthFeedback: null,
    growthAutoReleased
  };
}

module.exports = { reviewCard, toggleGrowth };
