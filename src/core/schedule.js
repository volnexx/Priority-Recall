"use strict";

const { getActiveSleepWindowEnd } = require("./settings");

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const REVIEW_INTERVALS = Object.freeze([
  5 * SECOND,
  15 * SECOND,
  45 * SECOND,
  2 * MINUTE,
  6 * MINUTE,
  18 * MINUTE,
  54 * MINUTE,
  2 * HOUR + 40 * MINUTE,
  8 * HOUR,
  24 * HOUR,
  3 * DAY,
  9 * DAY
]);
const REST_WINDOW = 6 * MINUTE;

function clampStage(stage) {
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(Math.trunc(stage), REVIEW_INTERVALS.length - 1));
}

function scheduleCorrect(card, now) {
  const nextStage = Math.min(clampStage(card.stage) + 1, REVIEW_INTERVALS.length - 1);
  return {
    ...card,
    stage: nextStage,
    dueAt: now + (REVIEW_INTERVALS[nextStage] ?? REVIEW_INTERVALS[0]),
    suppressSleepWindowEarlyReview: false,
    updatedAt: now,
    lastReviewedAt: now,
    correctCount: card.correctCount + 1
  };
}

function scheduleIncorrect(card, now) {
  return {
    ...card,
    stage: 0,
    dueAt: now + REVIEW_INTERVALS[0],
    suppressSleepWindowEarlyReview: false,
    updatedAt: now,
    lastReviewedAt: now,
    incorrectCount: card.incorrectCount + 1
  };
}

function scheduleSleepWindowReview(card, now, correct) {
  const stage = clampStage(card.stage);
  return {
    ...card,
    stage,
    dueAt: now + (REVIEW_INTERVALS[stage] ?? REVIEW_INTERVALS[0]),
    suppressSleepWindowEarlyReview: true,
    updatedAt: now,
    lastReviewedAt: now,
    correctCount: card.correctCount + (correct ? 1 : 0),
    incorrectCount: card.incorrectCount + (correct ? 0 : 1)
  };
}

function isSleepWindowEarlyReview(card, now, settings) {
  if (card.suppressSleepWindowEarlyReview === true) return false;
  const sleepWindowEnd = getActiveSleepWindowEnd(settings, now);
  return sleepWindowEnd !== null && card.dueAt > now && card.dueAt <= sleepWindowEnd;
}

function isAvailable(card, now, settings) {
  return card.dueAt <= now || isSleepWindowEarlyReview(card, now, settings);
}

function compareCardsByDueTime(left, right) {
  return left.dueAt - right.dueAt || left.term.localeCompare(right.term, "ru");
}

function partitionCards(cards, now, settings) {
  const available = [];
  const upcoming = [];
  for (const card of cards) {
    (isAvailable(card, now, settings) ? available : upcoming).push(card);
  }
  available.sort(compareCardsByDueTime);
  upcoming.sort(compareCardsByDueTime);
  return { available, upcoming };
}

function getQueueActivity(cards, now) {
  return cards.some((card) => card.dueAt > now && card.dueAt <= now + REST_WINDOW)
    ? "work"
    : "rest";
}

module.exports = {
  DAY,
  HOUR,
  MINUTE,
  REST_WINDOW,
  REVIEW_INTERVALS,
  SECOND,
  clampStage,
  compareCardsByDueTime,
  getQueueActivity,
  isAvailable,
  isSleepWindowEarlyReview,
  partitionCards,
  scheduleCorrect,
  scheduleIncorrect,
  scheduleSleepWindowReview
};
