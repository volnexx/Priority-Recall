"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { reconcileSourceCards } = require("../src/application/card-catalog");
const { hydratePluginData, serializePluginData } = require("../src/application/plugin-data");
const { reviewCard } = require("../src/application/review-engine");
const { ReviewState } = require("../src/application/review-state");
const { getGrowthRevealProgress } = require("../src/core/growth");
const { parseDefinitionLists, parseReviewEntries, parseTermLines } = require("../src/core/parser");
const { REVIEW_INTERVALS } = require("../src/core/schedule");

function card(overrides = {}) {
  return {
    id: "card-1",
    kind: "definition",
    term: "Понятие",
    definition: "форма мышления человека",
    sourcePath: "логика.md",
    occurrence: 0,
    stage: 0,
    dueAt: 0,
    createdAt: 0,
    updatedAt: 0,
    lastReviewedAt: null,
    correctCount: 0,
    incorrectCount: 0,
    suppressSleepWindowEarlyReview: false,
    ...overrides
  };
}

test("разборщик сохраняет строгие определения и ручной порядок перечня", () => {
  const source = [
    "---",
    "hidden: '**Скрытое — значение**'",
    "---",
    "**Понятие — форма мышления**",
    "**Дефис - не подходит**",
    "## Виды понятий",
    "**Общее понятие — несколько предметов**",
    "",
    "**Единичное понятие**",
    "**Абстрактное понятие — свойства и отношения**"
  ].join("\n");
  assert.deepEqual(parseTermLines(source).map(({ term }) => term), [
    "Понятие",
    "Общее понятие",
    "Абстрактное понятие"
  ]);
  assert.deepEqual(parseDefinitionLists(source)[0].listTerms, [
    "Общее понятие",
    "Единичное понятие",
    "Абстрактное понятие"
  ]);
  assert.equal(parseReviewEntries(source).length, 4);
});

test("каталог сохраняет прогресс, когда меняется только определение", () => {
  const stored = card({ stage: 5, correctCount: 9 });
  const entries = [{
    kind: "definition",
    term: "Понятие",
    definition: "обновлённая форма мышления",
    occurrence: 0,
    line: 1
  }];
  const result = reconcileSourceCards([stored], entries, "логика.md", 100, () => "new-id");
  assert.equal(result.cards[0].id, stored.id);
  assert.equal(result.cards[0].stage, 5);
  assert.equal(result.cards[0].definition, entries[0].definition);
});

test("сверка выращивания показывает следующую единицу", () => {
  assert.deepEqual(
    getGrowthRevealProgress(card(), { phase: "building", step: 1 }),
    {
      units: ["форма", "мышления", "человека"],
      total: 3,
      step: 1,
      unitLimit: 2,
      emphasizedUnitIndex: 1
    }
  );
});

test("ошибки выращивания отступают на одну ступень, затем сбрасывают волну", () => {
  const first = reviewCard({
    card: card(),
    growthState: { phase: "building", step: 3, incorrectStreak: 0 },
    correct: false,
    now: 10_000,
    settings: { bedtime: "20:00", wakeTime: "06:00" }
  });
  assert.equal(first.growthState.step, 2);
  assert.equal(first.growthState.incorrectStreak, 1);
  const second = reviewCard({
    card: first.card,
    growthState: first.growthState,
    correct: false,
    now: 20_000,
    settings: { bedtime: "20:00", wakeTime: "06:00" }
  });
  assert.equal(second.growthState.step, 1);
  assert.equal(second.growthState.incorrectStreak, 2);
  assert.equal(second.growthFeedback.resetToFirst, true);
});

test("данные версии 12 проходят через хранение без потери закреплений", () => {
  const initial = new ReviewState({
    cards: [card()],
    urgentSourcePaths: new Set(["логика.md"]),
    pinnedCardIds: new Set(["card-1"]),
    growthCardStates: new Map([["card-1", { phase: "retention", step: 3, incorrectStreak: 0 }]]),
    fileStates: { "логика.md": { mtime: 1, size: 2 } },
    settings: { bedtime: "21:00", wakeTime: "07:00" }
  });
  const restored = hydratePluginData(serializePluginData(initial), 50_000);
  assert.equal(restored.cards[0].stage, 0);
  assert.equal(restored.cards[0].dueAt, 0);
  assert.deepEqual([...restored.urgentSourcePaths], ["логика.md"]);
  assert.deepEqual([...restored.pinnedCardIds], ["card-1"]);
  assert.equal(restored.growthCardStates.get("card-1").phase, "retention");
  assert.equal(REVIEW_INTERVALS.length, 12);
});
