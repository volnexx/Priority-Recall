"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  bedtime: "20:00",
  wakeTime: "06:00"
});

function normalizeClockTime(value, fallback) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)
    || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeSettings(settings) {
  return {
    bedtime: normalizeClockTime(settings?.bedtime, DEFAULT_SETTINGS.bedtime),
    wakeTime: normalizeClockTime(settings?.wakeTime, DEFAULT_SETTINGS.wakeTime)
  };
}

function clockTimeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getActiveSleepWindowEnd(settings, now) {
  const normalized = normalizeSettings(settings);
  const bedtime = clockTimeToMinutes(normalized.bedtime);
  const wakeTime = clockTimeToMinutes(normalized.wakeTime);
  if (bedtime === wakeTime) return null;

  const current = new Date(now);
  const currentMinutes = current.getHours() * 60 + current.getMinutes() + current.getSeconds() / 60;
  const crossesMidnight = bedtime > wakeTime;
  const insideSleepWindow = crossesMidnight
    ? currentMinutes >= bedtime || currentMinutes < wakeTime
    : currentMinutes >= bedtime && currentMinutes < wakeTime;
  if (!insideSleepWindow) return null;

  const windowEnd = new Date(current);
  windowEnd.setHours(Math.floor(wakeTime / 60), wakeTime % 60, 0, 0);
  if (windowEnd.getTime() <= now) windowEnd.setDate(windowEnd.getDate() + 1);
  return windowEnd.getTime();
}

module.exports = {
  DEFAULT_SETTINGS,
  clockTimeToMinutes,
  getActiveSleepWindowEnd,
  normalizeClockTime,
  normalizeSettings
};
