"use strict";

const { getCardKind, stripBoldMarkers } = require("./card");

const GROWTH_INTERVAL = 5_000;
const GROWTH_AUTO_RELEASE_STAGE = 6;

function getGrowthUnits(card) {
  if (getCardKind(card) === "list") {
    return (card.listTerms ?? [])
      .map((item) => stripBoldMarkers(item).trim())
      .filter((item) => item.length > 0);
  }
  return stripBoldMarkers(card.definition)
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
}

function getGrowthProgress(card, state) {
  const units = getGrowthUnits(card);
  const total = units.length;
  const step = total === 0 ? 0 : Math.max(1, Math.min(Math.trunc(state?.step ?? 1), total));
  return { units, total, step };
}

function getGrowthFragment(card, step) {
  const units = getGrowthUnits(card);
  const limit = Math.max(0, Math.min(Math.trunc(step), units.length));
  return getCardKind(card) === "list" ? units.slice(0, limit) : units.slice(0, limit).join(" ");
}

function getGrowthRevealProgress(card, state) {
  const progress = getGrowthProgress(card, state);
  const hasAdditionalUnit = progress.step < progress.total;
  return {
    ...progress,
    unitLimit: hasAdditionalUnit ? progress.step + 1 : progress.step,
    emphasizedUnitIndex: hasAdditionalUnit ? progress.step : null
  };
}

function beginGrowth(card, now) {
  const progress = getGrowthProgress(card, { phase: "building", step: 1 });
  if (progress.total === 0) return null;
  return {
    card: {
      ...card,
      stage: 0,
      dueAt: now,
      suppressSleepWindowEarlyReview: false,
      updatedAt: now
    },
    state: { phase: "building", step: 1, incorrectStreak: 0 }
  };
}

function reviewGrowthStep(card, state, correct, now) {
  const progress = getGrowthProgress(card, state);
  if (progress.total === 0) return null;

  const waveComplete = correct && progress.step >= progress.total;
  const incorrectStreak = correct
    ? 0
    : Math.min(2, Math.max(0, Math.trunc(state.incorrectStreak ?? 0)) + 1);
  const resetToFirst = !correct && incorrectStreak >= 2;
  const nextStep = correct
    ? waveComplete ? progress.total : progress.step + 1
    : resetToFirst ? 1 : Math.max(1, progress.step - 1);
  const nextState = waveComplete
    ? { phase: "retention", step: progress.total, incorrectStreak: 0 }
    : { phase: "building", step: nextStep, incorrectStreak };
  const updatedCard = {
    ...card,
    stage: 0,
    dueAt: now + GROWTH_INTERVAL,
    suppressSleepWindowEarlyReview: false,
    updatedAt: now,
    lastReviewedAt: now,
    correctCount: card.correctCount + (correct ? 1 : 0),
    incorrectCount: card.incorrectCount + (correct ? 0 : 1)
  };

  return {
    card: updatedCard,
    state: nextState,
    feedback: {
      step: correct ? waveComplete ? progress.total : nextStep : progress.step,
      nextStep,
      total: progress.total,
      waveComplete,
      resetToFirst,
      incorrectStreak
    }
  };
}

module.exports = {
  GROWTH_AUTO_RELEASE_STAGE,
  GROWTH_INTERVAL,
  beginGrowth,
  getGrowthFragment,
  getGrowthProgress,
  getGrowthRevealProgress,
  getGrowthUnits,
  reviewGrowthStep
};
