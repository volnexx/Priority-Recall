"use strict";

const { getActiveSleepWindowEnd } = require("./settings");
const { formatCardTextForDisplay, formatTermForDisplay } = require("./display");

var SECOND = 1e3;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var REVIEW_INTERVALS = [
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
];
var GROWTH_INTERVAL = 5 * SECOND;
var GROWTH_AUTO_RELEASE_STAGE = 6;
var REST_WINDOW = 6 * MINUTE;
function clampStage(stage) {
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(Math.trunc(stage), REVIEW_INTERVALS.length - 1));
}
function scheduleCorrect(card, now) {
  const currentStage = clampStage(card.stage);
  const nextStage = Math.min(currentStage + 1, REVIEW_INTERVALS.length - 1);
  const interval = REVIEW_INTERVALS[nextStage] ?? REVIEW_INTERVALS[0];
  return {
    ...card,
    stage: nextStage,
    dueAt: now + interval,
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
  const currentStage = clampStage(card.stage);
  const interval = REVIEW_INTERVALS[currentStage] ?? REVIEW_INTERVALS[0];
  return {
    ...card,
    stage: currentStage,
    dueAt: now + interval,
    suppressSleepWindowEarlyReview: true,
    updatedAt: now,
    lastReviewedAt: now,
    correctCount: card.correctCount + (correct ? 1 : 0),
    incorrectCount: card.incorrectCount + (correct ? 0 : 1)
  };
}
function isSleepWindowEarlyReview(card, now) {
  if (card.suppressSleepWindowEarlyReview === true) return false;
  const sleepWindowEnd = getActiveSleepWindowEnd(now);
  return sleepWindowEnd !== null && card.dueAt > now && card.dueAt <= sleepWindowEnd;
}
function isAvailable(card, now) {
  return card.dueAt <= now || isSleepWindowEarlyReview(card, now);
}
function compareCardsByDueTime(left, right) {
  return left.dueAt - right.dueAt || left.term.localeCompare(right.term, "ru");
}
function partitionCards(cards, now) {
  const available = [];
  const upcoming = [];
  for (const card of cards) {
    (isAvailable(card, now) ? available : upcoming).push(card);
  }
  available.sort(compareCardsByDueTime);
  upcoming.sort(compareCardsByDueTime);
  return { available, upcoming };
}
function getQueueActivity(cards, now) {
  const hasUpcomingWithinRestWindow = cards.some(
    (card) => card.dueAt > now && card.dueAt <= now + REST_WINDOW
  );
  return hasUpcomingWithinRestWindow ? "work" : "rest";
}
function formatDuration(milliseconds) {
  const value = Math.max(0, Math.ceil(milliseconds / SECOND) * SECOND);
  if (value < MINUTE) return `${Math.ceil(value / SECOND)} \u0441`;
  if (value < HOUR) {
    const minutes = Math.floor(value / MINUTE);
    const seconds = Math.ceil(value % MINUTE / SECOND);
    return seconds > 0 ? `${minutes} \u043C\u0438\u043D ${seconds} \u0441` : `${minutes} \u043C\u0438\u043D`;
  }
  if (value < DAY) {
    const hours2 = Math.floor(value / HOUR);
    const minutes = Math.ceil(value % HOUR / MINUTE);
    return minutes > 0 ? `${hours2} \u0447 ${minutes} \u043C\u0438\u043D` : `${hours2} \u0447`;
  }
  const days = Math.floor(value / DAY);
  const hours = Math.ceil(value % DAY / HOUR);
  return hours > 0 ? `${days} \u0434 ${hours} \u0447` : `${days} \u0434`;
}
function stageIntervalLabel(stage) {
  return formatDuration(REVIEW_INTERVALS[clampStage(stage)] ?? REVIEW_INTERVALS[0]);
}
function getGrowthUnits(card) {
  if (getCardKind(card) === "list") {
    return (card.listTerms ?? []).map((item) => formatTermForDisplay(item).trim()).filter((item) => item.length > 0);
  }
  return formatCardTextForDisplay(card.definition).trim().split(/\s+/u).filter((word) => word.length > 0);
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
function formatCardDueTime(dueAt, available, now) {
  if (!available) return `\u0447\u0435\u0440\u0435\u0437 ${formatDuration(dueAt - now)}`;
  return dueAt <= now ? `\u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E \u043D\u0430 ${formatDuration(now - dueAt)}` : `\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0434\u043E \u043F\u043E\u0434\u044A\u0451\u043C\u0430 \xB7 \u0447\u0435\u0440\u0435\u0437 ${formatDuration(dueAt - now)}`;
}

module.exports = { SECOND, MINUTE, HOUR, DAY, REVIEW_INTERVALS, GROWTH_INTERVAL, GROWTH_AUTO_RELEASE_STAGE, REST_WINDOW, clampStage, scheduleCorrect, scheduleIncorrect, scheduleSleepWindowReview, isSleepWindowEarlyReview, isAvailable, compareCardsByDueTime, partitionCards, getQueueActivity, formatDuration, stageIntervalLabel, getGrowthUnits, getGrowthProgress, getGrowthFragment, getGrowthRevealProgress, formatCardDueTime };
