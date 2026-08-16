"use strict";

const import_obsidian = require("obsidian");
const { formatCardTextForDisplay, formatTermForDisplay, renderMultiPinIcon, renderGrowthIcon } = require("./display");
const { REVIEW_INTERVALS, formatDuration, stageIntervalLabel, getGrowthUnits, getGrowthProgress, getGrowthFragment, getGrowthRevealProgress } = require("./scheduler");
const { getReviewNavigation, chooseReviewCompletionAction } = require("./review-flow");
const { CARD_VIEW_TYPE, getCardKind, formatDateTime } = require("./ui-shared");

var ReviewView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  plugin;
  cardId = null;
  waitingFor = null;
  transitionPending = false;
  getViewType() {
    return CARD_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0442\u0435\u0440\u043C\u0438\u043D\u0430";
  }
  getIcon() {
    return "graduation-cap";
  }
  getState() {
    return { cardId: this.cardId };
  }
  async setState(state, result) {
    await super.setState(state, result);
    const candidate = state && typeof state === "object" ? state.cardId : null;
    this.cardId = typeof candidate === "string" ? candidate : null;
    this.waitingFor = null;
    await this.renderQuestion();
  }
  async onOpen() {
    await this.renderQuestion();
  }
  getCard() {
    return this.cardId ? this.plugin.getCard(this.cardId) ?? null : null;
  }
  async renderMarkdown(content, container, sourcePath) {
    await import_obsidian.MarkdownRenderer.render(this.app, content, container, sourcePath, this);
  }
  async renderQuestion() {
    this.waitingFor = null;
    const card = this.getCard();
    const root = this.contentEl;
    root.empty();
    root.addClass("tir-review-root");
    if (!card) {
      const missing = root.createDiv({ cls: "tir-review-message" });
      missing.createEl("h2", { text: "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" });
      missing.createEl("p", { text: "\u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0441\u0442\u0440\u043E\u043A\u0430 \u0431\u044B\u043B\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0430 \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430." });
      return;
    }
    const wrapper = root.createDiv({ cls: "tir-review" });
    const top = wrapper.createDiv({ cls: "tir-review-top" });
    const topInfo = top.createDiv({ cls: "tir-review-top-info" });
    const growthState = this.plugin.getGrowthState(card.id);
    if (growthState?.phase === "building") {
      const progress = getGrowthProgress(card, growthState);
      topInfo.createSpan({ text: `Рост ${progress.step} из ${progress.total}` });
      topInfo.createSpan({ text: "интервал роста: 5 с" });
    } else {
      topInfo.createSpan({ text: `\u042D\u0442\u0430\u043F ${card.stage + 1} \u0438\u0437 ${REVIEW_INTERVALS.length}` });
      topInfo.createSpan({
        text: card.stage === REVIEW_INTERVALS.length - 1 ? "\u0446\u0438\u043A\u043B: \u043A\u0430\u0436\u0434\u044B\u0435 9 \u0434\u043D\u0435\u0439" : `\u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0438\u043D\u0442\u0435\u0440\u0432\u0430\u043B: ${stageIntervalLabel(card.stage)}`
      });
    }
    const priorityActions = top.createDiv({ cls: "tir-review-priority-actions" });
    const urgent = priorityActions.createEl("button", {
      cls: "tir-review-urgent-toggle",
      text: "",
      attr: { type: "button" }
    });
    urgent.addEventListener("click", () => {
      void this.plugin.toggleUrgentSource(card.sourcePath);
    });
    this.updateUrgentButton(urgent, card);
    const pin = priorityActions.createEl("button", {
      cls: "tir-review-pin-toggle",
      attr: { type: "button" }
    });
    pin.addEventListener("click", () => {
      void this.plugin.togglePinnedCard(card.id);
    });
    this.updatePinButton(pin, card);
    const growth = priorityActions.createEl("button", {
      cls: "tir-review-pin-toggle tir-review-growth-toggle",
      attr: { type: "button" }
    });
    growth.addEventListener("click", () => {
      void this.plugin.toggleGrowthCard(card.id);
    });
    this.updateGrowthButton(growth, card);
    const flashcard = wrapper.createDiv({ cls: "tir-flashcard" });
    const term = flashcard.createDiv({ cls: "tir-flashcard-term markdown-rendered" });
    await this.renderMarkdown(formatTermForDisplay(card.term), term, card.sourcePath);
    const draft = flashcard.createEl("textarea", {
      cls: "tir-answer-draft",
      attr: {
        rows: "6",
        placeholder: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043E\u0442\u0432\u0435\u0442\u0430\u2026",
        "aria-label": "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043E\u0442\u0432\u0435\u0442\u0430",
        spellcheck: "true"
      }
    });
    draft.addEventListener("keydown", (event) => {
      if (draft.value.length > 0 || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const direction = event.key === "ArrowLeft" ? "previousCardId" : event.key === "ArrowRight" ? "nextCardId" : null;
      if (direction === null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = this.getNavigation()[direction];
      if (target !== null) void this.navigateTo(target);
    });
    window.setTimeout(() => draft.focus(), 0);
    const source = flashcard.createEl("button", {
      cls: "tir-source-link",
      text: card.sourcePath,
      attr: { "aria-label": `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${card.sourcePath}` }
    });
    source.addEventListener("click", () => {
      void this.plugin.openSource(card.sourcePath);
    });
    const navigation = getReviewNavigation(
      this.plugin.cards,
      card.id,
      this.plugin.urgentSourcePaths,
      this.plugin.getPriorityPinnedCardIds(),
      Date.now()
    );
    const cardNavigation = flashcard.createDiv({ cls: "tir-card-navigation" });
    const previous = cardNavigation.createEl("button", {
      cls: "tir-card-navigation-button",
      text: "\u2190",
      attr: {
        "aria-label": "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430",
        title: "\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430",
        "data-navigation-direction": "previous"
      }
    });
    previous.disabled = navigation.previousCardId === null;
    previous.addEventListener("click", () => {
      const target = this.getNavigation().previousCardId;
      if (target !== null) void this.navigateTo(target);
    });
    const next = cardNavigation.createEl("button", {
      cls: "tir-card-navigation-button",
      text: "\u2192",
      attr: {
        "aria-label": "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430",
        title: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430",
        "data-navigation-direction": "next"
      }
    });
    next.disabled = navigation.nextCardId === null;
    next.addEventListener("click", () => {
      const target = this.getNavigation().nextCardId;
      if (target !== null) void this.navigateTo(target);
    });
    const actions = wrapper.createDiv({ cls: "tir-review-actions" });
    const reveal = actions.createEl("button", { cls: "mod-cta tir-reveal", text: "\u0421\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442" });
    reveal.addEventListener("click", () => {
      void this.revealAnswer(card, flashcard, actions);
    });
  }
  async navigateTo(cardId) {
    if (this.transitionPending || cardId === this.cardId || !this.plugin.getCard(cardId)) return;
    this.transitionPending = true;
    this.waitingFor = null;
    this.cardId = cardId;
    try {
      await this.renderQuestion();
    } finally {
      this.transitionPending = false;
    }
  }
  async revealAnswer(card, flashcard, actions) {
    if (flashcard.querySelector(".tir-flashcard-definition")) return;
    const definition = flashcard.createDiv({ cls: "tir-flashcard-definition markdown-rendered" });
    const growthState = this.plugin.getGrowthState(card.id);
    const revealProgress = growthState?.phase === "building" ? getGrowthRevealProgress(card, growthState) : null;
    await this.renderDefinition(
      card,
      definition,
      revealProgress?.unitLimit ?? null,
      revealProgress?.emphasizedUnitIndex ?? null
    );
    actions.empty();
    const incorrect = actions.createEl("button", { cls: "tir-answer tir-answer-wrong", text: "\u041D\u0435\u0432\u0435\u0440\u043D\u043E" });
    const correct = actions.createEl("button", { cls: "tir-answer tir-answer-correct", text: "\u0412\u0435\u0440\u043D\u043E" });
    incorrect.addEventListener("click", () => {
      void this.submit(card.id, false);
    });
    correct.addEventListener("click", () => {
      void this.submit(card.id, true);
    });
  }
  async submit(cardId, correct) {
    const result = await this.plugin.reviewCard(cardId, correct);
    if (!result) {
      await this.renderQuestion();
      return;
    }
    const updated = result.card;
    if (result.growthFeedback) {
      this.cardId = cardId;
      this.waitingFor = { cardId, dueAt: updated.dueAt };
      await this.renderGrowthWaiting(updated, correct, result.growthFeedback);
      return;
    }
    const action = chooseReviewCompletionAction(
      this.plugin.cards,
      cardId,
      !correct,
      this.plugin.urgentSourcePaths,
      this.plugin.getPriorityPinnedCardIds(),
      Date.now()
    );
    if (action.type === "open") {
      this.cardId = action.cardId;
      await this.renderQuestion();
      return;
    }
    if (action.type === "close") {
      this.waitingFor = null;
      this.leaf.detach();
      return;
    }
    this.cardId = action.cardId;
    this.waitingFor = { cardId: action.cardId, dueAt: action.dueAt };
    this.renderWaiting(updated, correct);
  }
  async renderDefinition(card, container, unitLimit = null, emphasizedUnitIndex = null) {
    if (getCardKind(card) === "list") {
      container.addClass("tir-list-answer");
      const list = container.createDiv({ cls: "tir-definition-list", attr: { role: "list" } });
      const items = unitLimit === null ? (card.listTerms ?? []).map((item) => formatTermForDisplay(item)) : getGrowthFragment(card, unitLimit);
      for (const [index, item] of items.entries()) {
        const row = list.createDiv({
          cls: "tir-definition-list-item markdown-rendered",
          attr: { role: "listitem" }
        });
        await this.renderMarkdown(index === emphasizedUnitIndex ? `**${item}**` : item, row, card.sourcePath);
      }
      return;
    }
    let text = unitLimit === null ? formatCardTextForDisplay(card.definition) : getGrowthFragment(card, unitLimit);
    if (unitLimit !== null && emphasizedUnitIndex !== null) {
      text = getGrowthUnits(card).slice(0, unitLimit).map((word, index) => index === emphasizedUnitIndex ? `**${word}**` : word).join(" ");
    }
    await this.renderMarkdown(text, container, card.sourcePath);
  }
  async renderGrowthWaiting(updated, correct, feedback) {
    const root = this.contentEl;
    root.empty();
    root.addClass("tir-review-root");
    const message = root.createDiv({
      cls: correct ? "tir-review-message tir-result-correct tir-growth-result" : "tir-review-message tir-result-wrong tir-growth-result"
    });
    const title = feedback.waveComplete ? "Волна изучения завершена" : correct ? getCardKind(updated) === "list" ? "Добавлен следующий пункт" : "Добавлено новое слово" : "Повтори этот фрагмент";
    message.createEl("h2", { text: title });
    const fragment = message.createDiv({ cls: "tir-growth-feedback markdown-rendered" });
    await this.renderDefinition(updated, fragment, feedback.step);
    message.createEl("p", {
      text: feedback.waveComplete ? "Теперь начнутся обычные этапы. Карточка останется закреплённой до успешного прохождения этапа 6." : feedback.resetToFirst ? "Две ошибки подряд. Прогресс сброшен до этапа 1. Следующая попытка через 5 секунд." : !correct ? `Первая ошибка подряд. Следующая попытка начнётся с этапа ${feedback.nextStep} через 5 секунд.` : `Фрагмент ${feedback.step} из ${feedback.total}. Следующая попытка через 5 секунд.`
    });
    message.createEl("p", {
      cls: "tir-wait-countdown",
      text: `Ожидание: ${formatDuration(updated.dueAt - Date.now())}`
    });
    message.createEl("p", {
      cls: "tir-next-date",
      text: `Назначено на ${formatDateTime(updated.dueAt)}`
    });
  }
  renderWaiting(updated, correct) {
    const root = this.contentEl;
    root.empty();
    root.addClass("tir-review-root");
    const message = root.createDiv({
      cls: correct ? "tir-review-message tir-result-correct" : "tir-review-message tir-result-wrong"
    });
    message.createEl("h2", { text: correct ? "\u041E\u0442\u0432\u0435\u0442 \u043E\u0442\u043C\u0435\u0447\u0435\u043D \u043A\u0430\u043A \u0432\u0435\u0440\u043D\u044B\u0439" : "\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u0441\u0431\u0440\u043E\u0448\u0435\u043D" });
    message.createEl("p", {
      text: correct ? `\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 ${stageIntervalLabel(updated.stage)}.` : "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 5 \u0441\u0435\u043A\u0443\u043D\u0434."
    });
    message.createEl("p", {
      cls: "tir-wait-countdown",
      text: this.waitingFor ? `\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435: ${formatDuration(this.waitingFor.dueAt - Date.now())}` : "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438"
    });
    message.createEl("p", {
      cls: "tir-next-date",
      text: this.waitingFor ? `\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u043D\u0430 ${formatDateTime(this.waitingFor.dueAt)}` : ""
    });
  }
  tick(now = Date.now()) {
    const waiting = this.waitingFor;
    if (!waiting || this.transitionPending) return;
    const target = this.plugin.getCard(waiting.cardId);
    if (!target) {
      this.waitingFor = null;
      this.leaf.detach();
      return;
    }
    waiting.dueAt = target.dueAt;
    if (target.dueAt <= now) {
      this.transitionPending = true;
      this.waitingFor = null;
      this.cardId = target.id;
      void this.renderQuestion().finally(() => {
        this.transitionPending = false;
      });
      return;
    }
    const countdown = this.contentEl.querySelector(".tir-wait-countdown");
    if (countdown) countdown.setText(`\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435: ${formatDuration(target.dueAt - now)}`);
    const nextDate = this.contentEl.querySelector(".tir-next-date");
    if (nextDate) nextDate.setText(`\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u043D\u0430 ${formatDateTime(target.dueAt)}`);
  }
  refreshPriorityControls() {
    const card = this.getCard();
    if (!card) return;
    const urgent = this.contentEl.querySelector(".tir-review-urgent-toggle");
    if (urgent) this.updateUrgentButton(urgent, card);
    const pin = this.contentEl.querySelector(".tir-review-pin-toggle");
    if (pin) this.updatePinButton(pin, card);
    const growth = this.contentEl.querySelector(".tir-review-growth-toggle");
    if (growth) this.updateGrowthButton(growth, card);
    const navigation = this.getNavigation();
    const previous = this.contentEl.querySelector(
      '[data-navigation-direction="previous"]'
    );
    const next = this.contentEl.querySelector(
      '[data-navigation-direction="next"]'
    );
    if (previous) previous.disabled = navigation.previousCardId === null;
    if (next) next.disabled = navigation.nextCardId === null;
  }
  getNavigation() {
    return this.cardId ? getReviewNavigation(
      this.plugin.cards,
      this.cardId,
      this.plugin.urgentSourcePaths,
      this.plugin.getPriorityPinnedCardIds(),
      Date.now()
    ) : { previousCardId: null, nextCardId: null };
  }
  updateUrgentButton(button, card) {
    const isUrgent = this.plugin.isUrgentSource(card.sourcePath);
    renderMultiPinIcon(button, isUrgent);
    button.classList.toggle("is-active", isUrgent);
    button.classList.add("tir-multi-pin-toggle");
    button.setAttribute("aria-pressed", String(isUrgent));
    button.setAttribute(
      "aria-label",
      isUrgent ? `\u0423\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${card.sourcePath} \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445` : `\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${card.sourcePath} \u0432 \u0441\u0440\u043E\u0447\u043D\u044B\u0435`
    );
    button.title = isUrgent ? "\u0423\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445" : "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0432\u0441\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0441\u0440\u043E\u0447\u043D\u043E\u0439";
  }
  updatePinButton(button, card) {
    const isPinned = this.plugin.isPinnedCard(card.id);
    button.disabled = false;
    button.classList.toggle("is-active", isPinned);
    button.setAttribute("aria-pressed", String(isPinned));
    button.setAttribute(
      "aria-label",
      isPinned ? `\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 ${formatTermForDisplay(card.term)}` : `\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 ${formatTermForDisplay(card.term)}`
    );
    button.title = isPinned ? "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443" : "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443";
    (0, import_obsidian.setIcon)(button, isPinned ? "pin-off" : "pin");
  }
  updateGrowthButton(button, card) {
    const isGrowing = this.plugin.isGrowthCard(card.id);
    button.disabled = false;
    button.classList.toggle("is-active", isGrowing);
    button.setAttribute("aria-pressed", String(isGrowing));
    button.setAttribute(
      "aria-label",
      isGrowing ? `Снять выращивание определения ${formatTermForDisplay(card.term)}` : `Начать выращивание определения ${formatTermForDisplay(card.term)}`
    );
    button.title = isGrowing ? "Снять режим выращивания определения" : "Вырастить определение по одному слову";
    renderGrowthIcon(button);
  }
};

module.exports = { ReviewView };
