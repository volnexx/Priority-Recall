"use strict";

const { getAutomaticReviewQueue } = require("./queue");

var FOLLOW_UP_WAIT_WINDOW = 15e3;
function getReviewNavigation(cards, currentCardId, urgentSourcePaths, pinnedCardIds, now) {
  const available = getAutomaticReviewQueue(cards, urgentSourcePaths, pinnedCardIds, now);
  const currentIndex = available.findIndex((card) => card.id === currentCardId);
  if (currentIndex < 0) {
    return { previousCardId: null, nextCardId: null };
  }
  return {
    previousCardId: available[currentIndex - 1]?.id ?? null,
    nextCardId: available[currentIndex + 1]?.id ?? null
  };
}
function chooseReviewCompletionAction(cards, completedCardId, forceWait, urgentSourcePaths, pinnedCardIds, now) {
  const nextAvailable = getAutomaticReviewQueue(cards, urgentSourcePaths, pinnedCardIds, now).find(
    (card) => card.id !== completedCardId
  );
  if (nextAvailable) return { type: "open", cardId: nextAvailable.id };
  const automaticCards = pinnedCardIds.size > 0 ? cards.filter((card) => pinnedCardIds.has(card.id)) : urgentSourcePaths.size > 0 ? cards.filter((card) => urgentSourcePaths.has(card.sourcePath)) : cards;
  const nearest = automaticCards.reduce((current, card) => {
    if (current === null) return card;
    if (card.dueAt !== current.dueAt) return card.dueAt < current.dueAt ? card : current;
    return card.term.localeCompare(current.term, "ru") < 0 ? card : current;
  }, null);
  if (nearest && (forceWait || nearest.dueAt - now <= FOLLOW_UP_WAIT_WINDOW)) {
    return { type: "wait", cardId: nearest.id, dueAt: nearest.dueAt };
  }
  return { type: "close" };
}

module.exports = { FOLLOW_UP_WAIT_WINDOW, getReviewNavigation, chooseReviewCompletionAction };
