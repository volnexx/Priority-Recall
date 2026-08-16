"use strict";

const { DAY, HOUR, MINUTE, REVIEW_INTERVALS, SECOND, clampStage } = require("./schedule");

function formatDuration(milliseconds) {
  const value = Math.max(0, Math.ceil(milliseconds / SECOND) * SECOND);
  if (value < MINUTE) return `${Math.ceil(value / SECOND)} с`;
  if (value < HOUR) {
    const minutes = Math.floor(value / MINUTE);
    const seconds = Math.ceil(value % MINUTE / SECOND);
    return seconds > 0 ? `${minutes} мин ${seconds} с` : `${minutes} мин`;
  }
  if (value < DAY) {
    const hours = Math.floor(value / HOUR);
    const minutes = Math.ceil(value % HOUR / MINUTE);
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }
  const days = Math.floor(value / DAY);
  const hours = Math.ceil(value % DAY / HOUR);
  return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
}

function stageIntervalLabel(stage) {
  return formatDuration(REVIEW_INTERVALS[clampStage(stage)] ?? REVIEW_INTERVALS[0]);
}

function formatCardDueTime(dueAt, available, now) {
  if (!available) return `через ${formatDuration(dueAt - now)}`;
  return dueAt <= now
    ? `просрочено на ${formatDuration(now - dueAt)}`
    : `доступно до подъёма · через ${formatDuration(dueAt - now)}`;
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

module.exports = { formatCardDueTime, formatDateTime, formatDuration, stageIntervalLabel };
