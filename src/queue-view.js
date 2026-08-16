"use strict";

const import_obsidian = require("obsidian");
const { formatTermForDisplay, renderMultiPinIcon, renderGrowthIcon, createScrollingTerm } = require("./display");
const { getQueueActivity, formatCardDueTime } = require("./scheduler");
const { partitionCardsByPriority, scoreCardSearch } = require("./queue");
const { QUEUE_VIEW_TYPE } = require("./ui-shared");

var QueueView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  plugin;
  structureSignature = "";
  searchQuery = "";
  getViewType() {
    return QUEUE_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u041F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0442\u0435\u0440\u043C\u0438\u043D\u043E\u0432";
  }
  getIcon() {
    return "brain";
  }
  async onOpen() {
    this.refresh(true);
  }
  refresh(force = false) {
    const now = Date.now();
    const activeSource = this.plugin.getActiveDefinitionSource();
    const priorityPinnedCardIds = this.plugin.getPriorityPinnedCardIds();
    const partition = partitionCardsByPriority(
      this.plugin.cards,
      this.plugin.urgentSourcePaths,
      priorityPinnedCardIds,
      now
    );
    const { pinnedAvailable, urgentAvailable, regularAvailable, upcoming } = partition;
    const availableCount = pinnedAvailable.length + urgentAvailable.length + regularAvailable.length;
    const cardSignature = (card) => `${card.id}@${card.dueAt}`;
    const activeSourceSignature = activeSource ? `${activeSource.path}@${this.plugin.isUrgentSource(activeSource.path) ? "urgent" : "regular"}` : "none";
    const signature = `active-source:${activeSourceSignature}|pinned:${pinnedAvailable.map(cardSignature).join(",")}|urgent:${urgentAvailable.map(cardSignature).join(",")}|regular:${regularAvailable.map(cardSignature).join(",")}|upcoming:${upcoming.map(cardSignature).join(",")}|pinned-ids:${[...priorityPinnedCardIds].sort().join(",")}|growth:${this.plugin.getGrowthSignature()}`;
    if (!force && signature === this.structureSignature) {
      this.updateTimeLabels(now);
      return;
    }
    this.structureSignature = signature;
    const root = this.contentEl;
    const previousScroll = root.scrollTop;
    root.empty();
    root.addClass("tir-queue");
    const header = root.createDiv({ cls: "tir-queue-header" });
    header.createEl("h3", { text: "\u041F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435" });
    header.createSpan({
      cls: availableCount > 0 ? "tir-count tir-count-active" : "tir-count",
      text: String(availableCount),
      attr: {
        "aria-label": `\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A: ${availableCount}`,
        "data-queue-count": "true"
      }
    });
    const activity = root.createDiv({ cls: "tir-queue-activity" });
    activity.createSpan({
      cls: "tir-activity-icon",
      attr: {
        "data-activity-kind": "mode",
        role: "img"
      }
    });
    this.updateActivityStates(now);
    const search = root.createEl("input", {
      cls: "tir-search",
      type: "search",
      value: this.searchQuery,
      placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0442\u0435\u0440\u043C\u0438\u043D\u0443, \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u0442\u043A\u0435\u2026",
      attr: { "aria-label": "\u041F\u043E\u0438\u0441\u043A \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A \u043F\u043E \u0442\u0435\u0440\u043C\u0438\u043D\u0443, \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044E \u0438\u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }
    });
    search.addEventListener("input", () => {
      this.searchQuery = search.value;
      this.applySearchFilter();
    });
    if (activeSource) this.createActiveSourcePrompt(root, activeSource);
    if (pinnedAvailable.length > 0) {
      this.createSection(
        root,
        "\u0417\u0430\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043E",
        "pinned",
        pinnedAvailable,
        true,
        now,
        "\u0417\u0430\u043A\u0440\u0435\u043F\u043B\u0451\u043D\u043D\u044B\u0445 \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A \u043D\u0435\u0442",
        "tir-pinned-section"
      );
    }
    if (urgentAvailable.length > 0) {
      this.createSection(
        root,
        "\u041D\u0430\u0434\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0441\u0440\u043E\u0447\u043D\u043E",
        "urgent",
        urgentAvailable,
        true,
        now,
        "\u0421\u0440\u043E\u0447\u043D\u044B\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0439 \u043D\u0435\u0442",
        "tir-urgent-section"
      );
    }
    this.createSection(
      root,
      "\u041D\u0430\u0434\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C",
      "regular",
      regularAvailable,
      true,
      now,
      "\u0421\u0435\u0439\u0447\u0430\u0441 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0439 \u043D\u0435\u0442"
    );
    this.createSection(
      root,
      "\u041F\u043E\u0437\u0436\u0435",
      "upcoming",
      upcoming,
      false,
      now,
      "\u0411\u0443\u0434\u0443\u0449\u0438\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0439 \u043D\u0435\u0442",
      "tir-upcoming-section"
    );
    this.applySearchFilter();
    root.scrollTop = previousScroll;
  }
  createActiveSourcePrompt(root, source) {
    const isUrgent = this.plugin.isUrgentSource(source.path);
    const entry = root.createDiv({ cls: "tir-card-entry tir-active-source-prompt" });
    const content = entry.createEl("button", {
      cls: "tir-term-button tir-active-source-button",
      attr: {
        type: "button",
        "aria-label": `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0435\u0440\u0432\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 ${source.title}`,
        title: `\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0435\u0440\u0432\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 ${source.title}`
      }
    });
    createScrollingTerm(content, `${source.title} \u2013 ?`);
    content.addEventListener("click", () => {
      void this.plugin.openCard(source.cardId);
    });
    const actions = entry.createDiv({ cls: "tir-entry-actions" });
    const toggle = actions.createEl("button", {
      cls: isUrgent ? "tir-urgent-toggle tir-multi-pin-toggle tir-active-source-toggle is-active" : "tir-urgent-toggle tir-multi-pin-toggle tir-active-source-toggle",
      attr: {
        type: "button",
        "aria-label": isUrgent ? `\u0423\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${source.title} \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445` : `\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${source.title} \u0432 \u0441\u0440\u043E\u0447\u043D\u044B\u0435`,
        "aria-pressed": String(isUrgent),
        title: isUrgent ? "\u0423\u0431\u0440\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445" : "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0432\u0441\u044E \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0441\u0440\u043E\u0447\u043D\u043E\u0439"
      }
    });
    renderMultiPinIcon(toggle, isUrgent);
    toggle.addEventListener("click", () => {
      void this.plugin.toggleUrgentSource(source.path);
    });
  }
  tick() {
    this.refresh(false);
  }
  updateTimeLabels(now) {
    for (const time of this.contentEl.querySelectorAll(".tir-time[data-due-at]")) {
      const dueAt = Number(time.dataset.dueAt);
      if (!Number.isFinite(dueAt)) continue;
      time.setText(formatCardDueTime(dueAt, time.dataset.available === "true", now));
    }
    this.updateActivityStates(now);
  }
  updateActivityStates(now) {
    const mode = getQueueActivity(this.plugin.cards, now);
    const indicator = this.contentEl.querySelector('[data-activity-kind="mode"]');
    if (!indicator) return;
    const isRest = mode === "rest";
    const label = isRest ? "\u041C\u043E\u0436\u043D\u043E \u043E\u0442\u0434\u044B\u0445\u0430\u0442\u044C" : "\u041C\u043E\u0436\u043D\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C";
    (0, import_obsidian.setIcon)(indicator, isRest ? "coffee" : "briefcase");
    indicator.setAttribute("aria-label", label);
    indicator.setAttribute("title", label);
    indicator.classList.toggle("tir-activity-rest", isRest);
    indicator.classList.toggle("tir-activity-work", !isRest);
  }
  createSection(root, title, kind, cards, available, now, emptyText, extraClass = "") {
    const section = root.createDiv({ cls: `tir-section ${extraClass}`.trim() });
    section.dataset.sectionKind = kind;
    const sectionTitle = section.createDiv({ cls: "tir-section-title" });
    sectionTitle.createSpan({ text: title });
    sectionTitle.createSpan({
      cls: "tir-section-number",
      text: String(cards.length),
      attr: { "data-section-count": kind }
    });
    const list = section.createDiv({ cls: "tir-list" });
    for (const card of cards) this.createCardEntry(list, card, available, kind, now);
    const empty = list.createDiv({
      cls: "tir-empty",
      text: emptyText,
      attr: {
        "data-section-empty": kind,
        "data-default-empty-text": emptyText
      }
    });
    empty.hidden = cards.length > 0;
  }
  createCardEntry(list, card, available, kind, now) {
    const entry = list.createDiv({ cls: "tir-card-entry" });
    entry.dataset.cardId = card.id;
    entry.dataset.sectionKind = kind;
    entry.dataset.baseOrder = String(list.childElementCount);
    const content = available ? entry.createEl("button", { cls: "tir-term-button" }) : entry.createDiv({ cls: "tir-term-row" });
    createScrollingTerm(content, formatTermForDisplay(card.term));
    const time = content.createSpan({
      cls: available ? "tir-time tir-time-due" : "tir-time",
      text: formatCardDueTime(card.dueAt, available, now)
    });
    time.dataset.dueAt = String(card.dueAt);
    time.dataset.available = String(available);
    if (available) {
      content.addEventListener("click", () => {
        void this.plugin.openCard(card.id);
      });
    }
    const isUrgent = this.plugin.isUrgentSource(card.sourcePath);
    const isPinned = this.plugin.isPinnedCard(card.id);
    const isGrowing = this.plugin.isGrowthCard(card.id);
    const actions = entry.createDiv({ cls: "tir-entry-actions" });
    if (isUrgent) {
      const remove = actions.createEl("button", {
        cls: "tir-urgent-toggle tir-multi-pin-toggle tir-urgent-remove is-active",
        attr: {
          type: "button",
          "aria-label": `\u0423\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${card.sourcePath} \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445`,
          title: "\u0423\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u0437 \u0441\u0440\u043E\u0447\u043D\u044B\u0445"
        }
      });
      renderMultiPinIcon(remove, true);
      remove.addEventListener("click", () => {
        void this.plugin.toggleUrgentSource(card.sourcePath);
      });
    } else {
      const priority = actions.createEl("button", {
        cls: "tir-urgent-toggle tir-multi-pin-toggle",
        attr: {
          type: "button",
          "aria-label": `\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 ${card.sourcePath} \u0432 \u0441\u0440\u043E\u0447\u043D\u044B\u0435`,
          "aria-pressed": "false",
          title: "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u0432\u0441\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0441\u0440\u043E\u0447\u043D\u043E\u0439"
        }
      });
      renderMultiPinIcon(priority);
      priority.addEventListener("click", () => {
        void this.plugin.toggleUrgentSource(card.sourcePath);
      });
    }
    const pin = actions.createEl("button", {
      cls: isPinned ? "tir-pin-toggle is-active" : "tir-pin-toggle",
      attr: {
        type: "button",
        "aria-label": isPinned ? `\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 ${formatTermForDisplay(card.term)}` : `\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 ${formatTermForDisplay(card.term)}`,
        "aria-pressed": String(isPinned),
        title: isPinned ? "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443" : "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443"
      }
    });
    (0, import_obsidian.setIcon)(pin, isPinned ? "pin-off" : "pin");
    pin.addEventListener("click", () => {
      void this.plugin.togglePinnedCard(card.id);
    });
    const growth = actions.createEl("button", {
      cls: isGrowing ? "tir-pin-toggle tir-growth-toggle is-active" : "tir-pin-toggle tir-growth-toggle",
      attr: {
        type: "button",
        "aria-label": isGrowing ? `Снять выращивание определения ${formatTermForDisplay(card.term)}` : `Начать выращивание определения ${formatTermForDisplay(card.term)}`,
        "aria-pressed": String(isGrowing),
        title: isGrowing ? "Снять режим выращивания определения" : "Вырастить определение по одному слову"
      }
    });
    renderGrowthIcon(growth);
    growth.addEventListener("click", () => {
      void this.plugin.toggleGrowthCard(card.id);
    });
  }
  applySearchFilter() {
    const query = this.searchQuery;
    const visibleCounts = /* @__PURE__ */ new Map();
    const isSearching = query.trim().length > 0;
    for (const section of this.contentEl.querySelectorAll(
      ".tir-section[data-section-kind]"
    )) {
      const kind = section.dataset.sectionKind ?? "";
      const list = section.querySelector(".tir-list");
      if (!list) continue;
      const rankedEntries = Array.from(
        list.querySelectorAll(":scope > .tir-card-entry")
      ).map((entry) => {
        const card = entry.dataset.cardId ? this.plugin.getCard(entry.dataset.cardId) : void 0;
        const score = card ? scoreCardSearch(card, query) : null;
        const visible = score !== null;
        entry.hidden = !visible;
        return {
          entry,
          score,
          baseOrder: Number(entry.dataset.baseOrder ?? Number.MAX_SAFE_INTEGER)
        };
      });
      rankedEntries.sort((left, right) => {
        if (!isSearching) return left.baseOrder - right.baseOrder;
        if (left.score === null && right.score !== null) return 1;
        if (left.score !== null && right.score === null) return -1;
        return (right.score ?? 0) - (left.score ?? 0) || left.baseOrder - right.baseOrder;
      });
      for (const { entry } of rankedEntries) list.append(entry);
      const empty = section.querySelector("[data-section-empty]");
      if (empty) list.append(empty);
      const visibleCount = rankedEntries.filter(({ entry }) => !entry.hidden).length;
      visibleCounts.set(kind, visibleCount);
      const counter = section.querySelector("[data-section-count]");
      if (counter) counter.setText(String(visibleCount));
      if (empty) {
        empty.hidden = visibleCount > 0;
        empty.setText(
          isSearching ? "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" : empty.dataset.defaultEmptyText ?? "\u041A\u0430\u0440\u0442\u043E\u0447\u0435\u043A \u043D\u0435\u0442"
        );
      }
    }
    const queueCount = this.contentEl.querySelector("[data-queue-count]");
    if (queueCount) {
      const count = (visibleCounts.get("pinned") ?? 0) + (visibleCounts.get("urgent") ?? 0) + (visibleCounts.get("regular") ?? 0);
      queueCount.setText(String(count));
      queueCount.setAttribute("aria-label", `\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A: ${count}`);
      queueCount.classList.toggle("tir-count-active", count > 0);
    }
  }
  clearSearch() {
    this.searchQuery = "";
    const search = this.contentEl.querySelector(".tir-search");
    if (search) search.value = "";
  }
};

module.exports = { QueueView };
