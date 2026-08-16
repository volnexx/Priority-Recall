"use strict";

const { compareCardsByDueTime, partitionCards } = require("./schedule");

function partitionCardsByPriority(cards, urgentSourcePaths, pinnedCardIds, now, settings) {
  const { available, upcoming } = partitionCards([...cards], now, settings);
  const pinnedAvailable = [];
  const urgentAvailable = [];
  const regularAvailable = [];
  for (const card of available) {
    if (pinnedCardIds.has(card.id)) pinnedAvailable.push(card);
    else if (urgentSourcePaths.has(card.sourcePath)) urgentAvailable.push(card);
    else regularAvailable.push(card);
  }
  pinnedAvailable.sort(compareCardsByDueTime);
  urgentAvailable.sort(compareCardsByDueTime);
  regularAvailable.sort(compareCardsByDueTime);
  return { pinnedAvailable, urgentAvailable, regularAvailable, upcoming };
}

function getAutomaticReviewQueue(cards, urgentSourcePaths, pinnedCardIds, now, settings) {
  const partition = partitionCardsByPriority(cards, urgentSourcePaths, pinnedCardIds, now, settings);
  if (pinnedCardIds.size > 0) return partition.pinnedAvailable;
  return urgentSourcePaths.size > 0 ? partition.urgentAvailable : partition.regularAvailable;
}

module.exports = { getAutomaticReviewQueue, partitionCardsByPriority };
