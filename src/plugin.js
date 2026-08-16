"use strict";

const import_obsidian = require("obsidian");
const { DEFAULT_SETTINGS, normalizeSettings, applySettings } = require("./settings");
const { formatTermForDisplay } = require("./display");
const { parseTermLines, parseDefinitionLists } = require("./parser");
const { REVIEW_INTERVALS, GROWTH_INTERVAL, GROWTH_AUTO_RELEASE_STAGE, clampStage, scheduleCorrect, scheduleIncorrect, scheduleSleepWindowReview, isSleepWindowEarlyReview, compareCardsByDueTime, getGrowthProgress } = require("./scheduler");
const { createFileScanState, isSameFileState, pruneFileStates } = require("./file-state");
const { QUEUE_VIEW_TYPE, CARD_VIEW_TYPE, SAVE_DELAY, STARTUP_SCAN_DELAY, SCAN_YIELD_EVERY, createId, isReviewCard, isGrowthCardState, getCardKind, hasSameStringItems, isFileScanState } = require("./ui-shared");
const { QueueView } = require("./queue-view");
const { ReviewView } = require("./review-view");
const { TermIntervalReviewSettingTab } = require("./settings-tab");

var TermIntervalReviewPlugin = class extends import_obsidian.Plugin {
  cards = [];
  urgentSourcePaths = /* @__PURE__ */ new Set();
  pinnedCardIds = /* @__PURE__ */ new Set();
  growthCardStates = /* @__PURE__ */ new Map();
  activeSourcePath = null;
  fileStates = {};
  settings = { ...DEFAULT_SETTINGS };
  modifyTimers = /* @__PURE__ */ new Map();
  saveTimer = null;
  savePromise = Promise.resolve();
  scanChain = Promise.resolve();
  startupScanTimer = null;
  watchersRegistered = false;
  disposed = false;
  async onload() {
    await this.loadPluginData();
    this.rememberActiveSource(this.app.workspace.getActiveFile());
    this.addSettingTab(new TermIntervalReviewSettingTab(this.app, this));
    this.registerView(QUEUE_VIEW_TYPE, (leaf) => new QueueView(leaf, this));
    this.registerView(CARD_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));
    this.addCommand({
      id: "open-term-review-queue",
      name: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F \u0442\u0435\u0440\u043C\u0438\u043D\u043E\u0432",
      callback: () => {
        void this.activateQueueView();
      }
    });
    this.addCommand({
      id: "rescan-term-lines",
      name: "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F **\u0442\u0435\u0440\u043C\u0438\u043D \u2014 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435**",
      callback: () => {
        this.cancelStartupScan();
        void this.runScan(() => this.synchronizeAll(true, true));
      }
    });
    this.registerInterval(
      window.setInterval(() => {
        this.tickViews();
      }, 1e3)
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.rememberActiveSource(file);
      })
    );
    this.app.workspace.onLayoutReady(() => {
      void this.initializeWorkspace();
    });
    this.register(() => {
      for (const timer of this.modifyTimers.values()) window.clearTimeout(timer);
      this.modifyTimers.clear();
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.cancelStartupScan();
    });
  }
  onunload() {
    this.disposed = true;
    this.app.workspace.detachLeavesOfType(QUEUE_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CARD_VIEW_TYPE);
  }
  getCard(id) {
    return this.cards.find((card) => card.id === id);
  }
  rememberActiveSource(file) {
    if (file === null) return;
    const nextPath = file instanceof import_obsidian.TFile && file.extension === "md" ? file.path : null;
    if (nextPath === this.activeSourcePath) return;
    this.activeSourcePath = nextPath;
    this.refreshViews(true);
  }
  getActiveDefinitionSource() {
    const path = this.activeSourcePath;
    if (path === null) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") return null;
    const cards = this.cards.filter((card) => card.sourcePath === path).sort(compareCardsByDueTime);
    const firstCard = cards[0];
    if (!firstCard) return null;
    return { path, title: file.basename, cardId: firstCard.id };
  }
  isUrgentSource(path) {
    return this.urgentSourcePaths.has(path);
  }
  isPinnedCard(id) {
    return this.pinnedCardIds.has(id);
  }
  isGrowthCard(id) {
    return this.growthCardStates.has(id);
  }
  getGrowthState(id) {
    return this.growthCardStates.get(id) ?? null;
  }
  getPriorityPinnedCardIds() {
    return new Set([...this.pinnedCardIds, ...this.growthCardStates.keys()]);
  }
  getGrowthSignature() {
    return [...this.growthCardStates.entries()].sort(([left], [right]) => left.localeCompare(right, "ru")).map(([id, state]) => `${id}:${state.phase}:${state.step}:${state.incorrectStreak ?? 0}`).join(",");
  }
  async toggleUrgentSource(path) {
    if (this.urgentSourcePaths.has(path)) {
      this.urgentSourcePaths.delete(path);
    } else this.urgentSourcePaths.add(path);
    this.clearQueueSearch();
    await this.persistNow();
    this.refreshViews(true);
    this.refreshReviewPriorityControls();
  }
  async togglePinnedCard(id) {
    const card = this.getCard(id);
    if (!card) return;
    if (this.pinnedCardIds.has(id)) this.pinnedCardIds.delete(id);
    else this.pinnedCardIds.add(id);
    await this.persistNow();
    this.refreshViews(true);
    this.refreshReviewPriorityControls();
  }
  async toggleGrowthCard(id) {
    const index = this.cards.findIndex((card) => card.id === id);
    const card = this.cards[index];
    if (index < 0 || !card) return;
    if (this.growthCardStates.has(id)) {
      this.growthCardStates.delete(id);
    } else {
      const progress = getGrowthProgress(card, { phase: "building", step: 1 });
      if (progress.total === 0) return;
      const now = Date.now();
      this.growthCardStates.set(id, { phase: "building", step: 1, incorrectStreak: 0 });
      this.cards[index] = {
        ...card,
        stage: 0,
        dueAt: now,
        suppressSleepWindowEarlyReview: false,
        updatedAt: now
      };
    }
    this.clearQueueSearch();
    await this.persistNow();
    this.refreshViews(true);
    this.refreshReviewCard(id);
  }
  async updateSleepSetting(key, value) {
    this.settings = normalizeSettings({ ...this.settings, [key]: value });
    applySettings(this.settings);
    await this.persistNow();
    this.refreshViews(true);
    this.refreshReviewPriorityControls();
  }
  clearQueueSearch() {
    for (const leaf of this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)) {
      if (leaf.view instanceof QueueView) leaf.view.clearSearch();
    }
  }
  async openCard(cardId) {
    let leaf = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    leaf ??= this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true, state: { cardId } });
    await this.app.workspace.revealLeaf(leaf);
  }
  async openSource(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }
  async reviewCard(cardId, correct) {
    const index = this.cards.findIndex((card2) => card2.id === cardId);
    const card = this.cards[index];
    if (index < 0 || !card) return null;
    const now = Date.now();
    const growthState = this.getGrowthState(cardId);
    if (growthState?.phase === "building") {
      const progress = getGrowthProgress(card, growthState);
      if (progress.total > 0) {
        const waveComplete = correct && progress.step >= progress.total;
        const incorrectStreak = correct ? 0 : Math.min(2, Math.max(0, Math.trunc(growthState.incorrectStreak ?? 0)) + 1);
        const resetToFirst = !correct && incorrectStreak >= 2;
        const nextStep = correct ? waveComplete ? progress.total : progress.step + 1 : resetToFirst ? 1 : Math.max(1, progress.step - 1);
        this.growthCardStates.set(cardId, waveComplete ? { phase: "retention", step: progress.total, incorrectStreak: 0 } : { phase: "building", step: nextStep, incorrectStreak });
        const updated2 = {
          ...card,
          stage: 0,
          dueAt: now + GROWTH_INTERVAL,
          suppressSleepWindowEarlyReview: false,
          updatedAt: now,
          lastReviewedAt: now,
          correctCount: card.correctCount + (correct ? 1 : 0),
          incorrectCount: card.incorrectCount + (correct ? 0 : 1)
        };
        this.cards[index] = updated2;
        await this.persistNow();
        this.refreshViews(true);
        return {
          card: updated2,
          growthFeedback: {
            step: correct ? waveComplete ? progress.total : nextStep : progress.step,
            nextStep,
            total: progress.total,
            waveComplete,
            resetToFirst,
            incorrectStreak
          },
          growthAutoReleased: false
        };
      }
      this.growthCardStates.delete(cardId);
    }
    const sleepWindowReview = isSleepWindowEarlyReview(card, now);
    const updated = sleepWindowReview ? scheduleSleepWindowReview(card, now, correct) : correct ? scheduleCorrect(card, now) : scheduleIncorrect(card, now);
    const growthAutoReleased = growthState?.phase === "retention" && correct && !sleepWindowReview && updated.stage >= GROWTH_AUTO_RELEASE_STAGE;
    if (growthAutoReleased) this.growthCardStates.delete(cardId);
    this.cards[index] = updated;
    await this.persistNow();
    this.refreshViews(true);
    return { card: updated, growthFeedback: null, growthAutoReleased };
  }
  async initializeWorkspace() {
    try {
      await this.activateQueueView();
      this.registerVaultWatchers();
      this.startupScanTimer = window.setTimeout(() => {
        this.startupScanTimer = null;
        void this.runScan(() => this.synchronizeAll(false, false)).catch((error) => {
          console.error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430", error);
          new import_obsidian.Notice("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0434\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F");
        });
      }, STARTUP_SCAN_DELAY);
    } catch (error) {
      console.error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0442\u0435\u0440\u043C\u0438\u043D\u043E\u0432", error);
      new import_obsidian.Notice("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043F\u043B\u0430\u0433\u0438\u043D \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F \u0442\u0435\u0440\u043C\u0438\u043D\u043E\u0432");
    }
  }
  async activateQueueView() {
    let leaf = this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true) ?? void 0;
      if (!leaf) {
        new import_obsidian.Notice("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0430\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F");
        return;
      }
      await leaf.setViewState({ type: QUEUE_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  registerVaultWatchers() {
    if (this.watchersRegistered) return;
    this.watchersRegistered = true;
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") this.queueFileScan(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") this.queueFileScan(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        void this.runScan(() => this.handleDelete(file));
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.runScan(() => this.handleRename(file, oldPath));
      })
    );
  }
  async loadPluginData() {
    const raw = await this.loadData();
    const rawSettings = raw && typeof raw === "object" && raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings) ? raw.settings : null;
    this.settings = normalizeSettings(rawSettings);
    applySettings(this.settings);
    const rawCards = raw && typeof raw === "object" && Array.isArray(raw.cards) ? raw.cards ?? [] : [];
    const now = Date.now();
    this.cards = rawCards.filter(isReviewCard).map((card) => ({
      ...card,
      kind: getCardKind(card),
      listTerms: getCardKind(card) === "list" && Array.isArray(card.listTerms) ? card.listTerms.filter((term) => typeof term === "string" && term.length > 0) : void 0,
      stage: clampStage(card.stage),
      dueAt: Number.isFinite(card.dueAt) ? card.dueAt : now + REVIEW_INTERVALS[0],
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt : now,
      updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : now,
      lastReviewedAt: Number.isFinite(card.lastReviewedAt) ? card.lastReviewedAt : null,
      correctCount: Number.isFinite(card.correctCount) ? card.correctCount : 0,
      incorrectCount: Number.isFinite(card.incorrectCount) ? card.incorrectCount : 0,
      suppressSleepWindowEarlyReview: card.suppressSleepWindowEarlyReview === true
    }));
    const rawVersion = raw && typeof raw === "object" ? raw.version : null;
    const rawStates = raw && typeof raw === "object" ? raw.fileStates : null;
    if ((rawVersion === 9 || rawVersion === 10 || rawVersion === 11 || rawVersion === 12) && rawStates && typeof rawStates === "object" && !Array.isArray(rawStates)) {
      for (const [path, state] of Object.entries(rawStates)) {
        if (isFileScanState(state)) this.fileStates[path] = state;
      }
    }
    const rawUrgent = raw && typeof raw === "object" ? raw.urgentSourcePaths : null;
    if (Array.isArray(rawUrgent)) {
      this.urgentSourcePaths = new Set(
        rawUrgent.filter((path) => typeof path === "string" && path.length > 0)
      );
    }
    const rawPinned = raw && typeof raw === "object" ? raw.pinnedCardIds : null;
    if (Array.isArray(rawPinned)) {
      const cardIds = new Set(this.cards.map((card) => card.id));
      this.pinnedCardIds = new Set(
        rawPinned.filter((id) => typeof id === "string" && cardIds.has(id))
      );
    }
    const rawGrowth = raw && typeof raw === "object" ? raw.growthCardStates : null;
    if ((rawVersion === 10 || rawVersion === 11 || rawVersion === 12) && Array.isArray(rawGrowth)) {
      const cardIds = new Set(this.cards.map((card) => card.id));
      for (const entry of rawGrowth) {
        if (!entry || typeof entry !== "object" || typeof entry.cardId !== "string" || !cardIds.has(entry.cardId) || !isGrowthCardState(entry)) continue;
        this.growthCardStates.set(entry.cardId, {
          phase: entry.phase,
          step: Math.max(1, Math.trunc(entry.step)),
          incorrectStreak: Math.min(2, Math.max(0, Math.trunc(entry.incorrectStreak ?? 0)))
        });
      }
    }
  }
  async synchronizeAll(showNotice, force) {
    const files = this.app.vault.getMarkdownFiles();
    const paths = new Set(files.map((file) => file.path));
    let dataChanged = false;
    let cardsChanged = false;
    let scannedFiles = 0;
    for (const file of files) {
      if (this.disposed) return;
      const currentState = createFileScanState(file.stat);
      if (!force && isSameFileState(this.fileStates[file.path], currentState)) continue;
      const result = await this.synchronizeFile(file, false, force);
      dataChanged ||= result.dataChanged;
      cardsChanged ||= result.cardsChanged;
      scannedFiles += 1;
      if (scannedFiles % SCAN_YIELD_EVERY === 0) await this.yieldToObsidian();
    }
    const before = this.cards.length;
    this.cards = this.cards.filter((card) => paths.has(card.sourcePath));
    if (before !== this.cards.length) {
      dataChanged = true;
      cardsChanged = true;
    }
    for (const sourcePath of [...this.urgentSourcePaths]) {
      if (!paths.has(sourcePath)) {
        this.urgentSourcePaths.delete(sourcePath);
        dataChanged = true;
      }
    }
    const cardIds = new Set(this.cards.map((card) => card.id));
    for (const cardId of [...this.pinnedCardIds]) {
      if (!cardIds.has(cardId)) {
        this.pinnedCardIds.delete(cardId);
        dataChanged = true;
      }
    }
    for (const cardId of [...this.growthCardStates.keys()]) {
      if (!cardIds.has(cardId)) {
        this.growthCardStates.delete(cardId);
        dataChanged = true;
      }
    }
    const pruned = pruneFileStates(this.fileStates, paths);
    this.fileStates = pruned.states;
    dataChanged ||= pruned.changed;
    if (dataChanged) await this.persistNow();
    if (cardsChanged) this.refreshViews(true);
    else this.tickViews();
    if (showNotice) {
      new import_obsidian.Notice(`\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0437\u0430\u043C\u0435\u0442\u043E\u043A: ${scannedFiles}. \u041A\u0430\u0440\u0442\u043E\u0447\u0435\u043A: ${this.cards.length}`);
    }
  }
  queueFileScan(file) {
    const previous = this.modifyTimers.get(file.path);
    if (previous !== void 0) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.modifyTimers.delete(file.path);
      void this.runScan(() => this.synchronizeFile(file, true, false));
    }, SAVE_DELAY);
    this.modifyTimers.set(file.path, timer);
  }
  async synchronizeFile(file, persist, force) {
    const currentState = createFileScanState(file.stat);
    if (!force && isSameFileState(this.fileStates[file.path], currentState)) {
      return { dataChanged: false, cardsChanged: false };
    }
    let content;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch (error) {
      console.error(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C ${file.path}`, error);
      return { dataChanged: false, cardsChanged: false };
    }
    const entries = [...parseTermLines(content), ...parseDefinitionLists(content)];
    const existing = this.cards.filter((card) => card.sourcePath === file.path);
    const normalizeStoredTerm = (term) => formatTermForDisplay(term).replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, "").trim();
    const existingByKey = new Map(
      existing.map((card) => [
        `${getCardKind(card)}\0${normalizeStoredTerm(card.term)}\0${card.occurrence}`,
        card
      ])
    );
    const nextForFile = [];
    const now = Date.now();
    let cardsChanged = false;
    for (const entry of entries) {
      const card = existingByKey.get(`${entry.kind}\0${entry.term}\0${entry.occurrence}`);
      if (card) {
        const nextListTerms = entry.kind === "list" ? entry.listTerms : void 0;
        const currentListTerms = Array.isArray(card.listTerms) ? card.listTerms : [];
        if (card.term !== entry.term || card.definition !== entry.definition || getCardKind(card) !== entry.kind || entry.kind === "list" && !hasSameStringItems(currentListTerms, nextListTerms)) {
          nextForFile.push({
            ...card,
            kind: entry.kind,
            term: entry.term,
            definition: entry.definition,
            listTerms: nextListTerms,
            updatedAt: now
          });
          cardsChanged = true;
        } else nextForFile.push(card);
      } else {
        const created = {
          id: createId(),
          kind: entry.kind,
          term: entry.term,
          definition: entry.definition,
          listTerms: entry.kind === "list" ? entry.listTerms : void 0,
          sourcePath: file.path,
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
        nextForFile.push(created);
        cardsChanged = true;
      }
    }
    if (existing.length !== nextForFile.length) cardsChanged = true;
    if (cardsChanged) {
      this.cards = [
        ...this.cards.filter((card) => card.sourcePath !== file.path),
        ...nextForFile
      ];
      const cardIds = new Set(this.cards.map((card) => card.id));
      for (const cardId of [...this.pinnedCardIds]) {
        if (!cardIds.has(cardId)) this.pinnedCardIds.delete(cardId);
      }
      for (const cardId of [...this.growthCardStates.keys()]) {
        if (!cardIds.has(cardId)) this.growthCardStates.delete(cardId);
      }
    }
    this.fileStates[file.path] = currentState;
    if (persist) {
      this.schedulePersist();
      if (cardsChanged) this.refreshViews(true);
    }
    return { dataChanged: true, cardsChanged };
  }
  async handleDelete(file) {
    const path = file.path;
    const prefix = file instanceof import_obsidian.TFolder ? `${path}/` : null;
    const activeSourceDeleted = this.activeSourcePath === path || prefix !== null && this.activeSourcePath !== null && this.activeSourcePath.startsWith(prefix);
    if (activeSourceDeleted) this.activeSourcePath = null;
    const before = this.cards.length;
    this.cards = this.cards.filter(
      (card) => card.sourcePath !== path && (prefix === null || !card.sourcePath.startsWith(prefix))
    );
    let stateChanged = false;
    for (const statePath of Object.keys(this.fileStates)) {
      if (statePath === path || prefix !== null && statePath.startsWith(prefix)) {
        delete this.fileStates[statePath];
        stateChanged = true;
      }
    }
    let urgentChanged = false;
    for (const sourcePath of [...this.urgentSourcePaths]) {
      if (sourcePath === path || prefix !== null && sourcePath.startsWith(prefix)) {
        this.urgentSourcePaths.delete(sourcePath);
        urgentChanged = true;
      }
    }
    let pinnedChanged = false;
    const cardIds = new Set(this.cards.map((card) => card.id));
    for (const cardId of [...this.pinnedCardIds]) {
      if (!cardIds.has(cardId)) {
        this.pinnedCardIds.delete(cardId);
        pinnedChanged = true;
      }
    }
    let growthChanged = false;
    for (const cardId of [...this.growthCardStates.keys()]) {
      if (!cardIds.has(cardId)) {
        this.growthCardStates.delete(cardId);
        growthChanged = true;
      }
    }
    if (before !== this.cards.length || stateChanged || urgentChanged || pinnedChanged || growthChanged || activeSourceDeleted) {
      await this.persistNow();
      if (before !== this.cards.length || urgentChanged || pinnedChanged || growthChanged || activeSourceDeleted) {
        this.refreshViews(true);
        this.refreshReviewPriorityControls();
      }
    }
  }
  async handleRename(file, oldPath) {
    let changed = false;
    const oldPrefix = file instanceof import_obsidian.TFolder ? `${oldPath}/` : null;
    const newPrefix = file instanceof import_obsidian.TFolder ? `${file.path}/` : null;
    if (this.activeSourcePath === oldPath) {
      this.activeSourcePath = file.path;
    } else if (oldPrefix && newPrefix && this.activeSourcePath?.startsWith(oldPrefix)) {
      this.activeSourcePath = `${newPrefix}${this.activeSourcePath.slice(oldPrefix.length)}`;
    }
    for (const card of this.cards) {
      if (card.sourcePath === oldPath) {
        card.sourcePath = file.path;
        changed = true;
      } else if (oldPrefix && newPrefix && card.sourcePath.startsWith(oldPrefix)) {
        card.sourcePath = `${newPrefix}${card.sourcePath.slice(oldPrefix.length)}`;
        changed = true;
      }
    }
    for (const [statePath, state] of Object.entries(this.fileStates)) {
      let nextPath = null;
      if (statePath === oldPath) nextPath = file.path;
      else if (oldPrefix && newPrefix && statePath.startsWith(oldPrefix)) {
        nextPath = `${newPrefix}${statePath.slice(oldPrefix.length)}`;
      }
      if (nextPath !== null) {
        delete this.fileStates[statePath];
        this.fileStates[nextPath] = state;
        changed = true;
      }
    }
    for (const sourcePath of [...this.urgentSourcePaths]) {
      let nextPath = null;
      if (sourcePath === oldPath) nextPath = file.path;
      else if (oldPrefix && newPrefix && sourcePath.startsWith(oldPrefix)) {
        nextPath = `${newPrefix}${sourcePath.slice(oldPrefix.length)}`;
      }
      if (nextPath !== null) {
        this.urgentSourcePaths.delete(sourcePath);
        this.urgentSourcePaths.add(nextPath);
        changed = true;
      }
    }
    const pending = this.modifyTimers.get(oldPath);
    if (pending !== void 0) {
      window.clearTimeout(pending);
      this.modifyTimers.delete(oldPath);
    }
    if (changed) {
      await this.persistNow();
      this.refreshViews(true);
      this.refreshReviewPriorityControls();
    }
    if (file instanceof import_obsidian.TFile && file.extension === "md") this.queueFileScan(file);
  }
  runScan(operation) {
    const run = this.scanChain.then(operation);
    this.scanChain = run.then(
      () => void 0,
      () => void 0
    );
    return run;
  }
  cancelStartupScan() {
    if (this.startupScanTimer === null) return;
    window.clearTimeout(this.startupScanTimer);
    this.startupScanTimer = null;
  }
  async yieldToObsidian() {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  schedulePersist() {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, SAVE_DELAY);
  }
  async persistNow() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.savePromise = this.savePromise.then(async () => {
      const data = {
        version: 12,
        settings: this.settings,
        cards: this.cards,
        fileStates: this.fileStates,
        urgentSourcePaths: [...this.urgentSourcePaths].sort(
          (left, right) => left.localeCompare(right, "ru")
        ),
        pinnedCardIds: [...this.pinnedCardIds].sort(
          (left, right) => left.localeCompare(right, "ru")
        ),
        growthCardStates: [...this.growthCardStates.entries()].sort(([left], [right]) => left.localeCompare(right, "ru")).map(([cardId, state]) => ({
          cardId,
          phase: state.phase,
          step: state.step,
          incorrectStreak: state.incorrectStreak ?? 0
        }))
      };
      await this.saveData(data);
    });
    await this.savePromise;
  }
  refreshViews(force = false) {
    for (const leaf of this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)) {
      if (leaf.view instanceof QueueView) leaf.view.refresh(force);
    }
  }
  refreshReviewPriorityControls() {
    for (const leaf of this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)) {
      if (leaf.view instanceof ReviewView) leaf.view.refreshPriorityControls();
    }
  }
  refreshReviewCard(cardId) {
    for (const leaf of this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)) {
      if (leaf.view instanceof ReviewView && leaf.view.cardId === cardId && leaf.view.waitingFor === null) void leaf.view.renderQuestion();
    }
  }
  tickViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)) {
      if (leaf.view instanceof QueueView) leaf.view.tick();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)) {
      if (leaf.view instanceof ReviewView) leaf.view.tick();
    }
  }
};

module.exports = { TermIntervalReviewPlugin };
