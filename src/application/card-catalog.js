"use strict";

const {
  createCardId,
  getCardKind,
  hasSameStringItems,
  normalizeStoredTerm
} = require("../core/card");
const { REVIEW_INTERVALS } = require("../core/schedule");

function cardIdentity(kind, term, occurrence) {
  return `${kind}\0${normalizeStoredTerm(term)}\0${occurrence}`;
}

function createCard(entry, sourcePath, now, idFactory) {
  return {
    id: idFactory(),
    kind: entry.kind,
    term: entry.term,
    definition: entry.definition,
    listTerms: entry.kind === "list" ? entry.listTerms : undefined,
    sourcePath,
    occurrence: entry.occurrence,
    stage: 0,
    dueAt: now + REVIEW_INTERVALS[0],
    createdAt: now,
    updatedAt: now,
    lastReviewedAt: null,
    correctCount: 0,
    incorrectCount: 0,
    suppressSleepWindowEarlyReview: false
  };
}

function updateCardFromEntry(card, entry, now) {
  const nextListTerms = entry.kind === "list" ? entry.listTerms : undefined;
  const currentListTerms = Array.isArray(card.listTerms) ? card.listTerms : [];
  const changed = card.term !== entry.term
    || card.definition !== entry.definition
    || getCardKind(card) !== entry.kind
    || entry.kind === "list" && !hasSameStringItems(currentListTerms, nextListTerms);
  if (!changed) return { card, changed: false };
  return {
    card: {
      ...card,
      kind: entry.kind,
      term: entry.term,
      definition: entry.definition,
      listTerms: nextListTerms,
      updatedAt: now
    },
    changed: true
  };
}

function reconcileSourceCards(cards, entries, sourcePath, now, idFactory = createCardId) {
  const existing = cards.filter((card) => card.sourcePath === sourcePath);
  const existingByKey = new Map(existing.map((card) => [
    cardIdentity(getCardKind(card), card.term, card.occurrence),
    card
  ]));
  const nextForSource = [];
  let cardsChanged = false;

  for (const entry of entries) {
    const stored = existingByKey.get(cardIdentity(entry.kind, entry.term, entry.occurrence));
    if (!stored) {
      nextForSource.push(createCard(entry, sourcePath, now, idFactory));
      cardsChanged = true;
      continue;
    }
    const updated = updateCardFromEntry(stored, entry, now);
    nextForSource.push(updated.card);
    cardsChanged ||= updated.changed;
  }
  cardsChanged ||= existing.length !== nextForSource.length;
  return {
    cards: cardsChanged
      ? [...cards.filter((card) => card.sourcePath !== sourcePath), ...nextForSource]
      : cards,
    cardsChanged
  };
}

module.exports = { cardIdentity, createCard, reconcileSourceCards, updateCardFromEntry };
