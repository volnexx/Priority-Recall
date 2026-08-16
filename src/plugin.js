"use strict";

const { Notice, Plugin } = require("obsidian");
const { hydratePluginData, serializePluginData } = require("./application/plugin-data");
const { ReviewService } = require("./application/review-service");
const { ReviewState } = require("./application/review-state");
const { PersistenceQueue } = require("./infrastructure/persistence-queue");
const { VaultIndex } = require("./infrastructure/vault-index");
const {
  CARD_VIEW_TYPE,
  QUEUE_VIEW_TYPE,
  SAVE_DELAY,
  SCAN_YIELD_EVERY,
  STARTUP_SCAN_DELAY
} = require("./ui/constants");
const { QueueView } = require("./ui/queue-view");
const { ReviewView } = require("./ui/review-view");
const { TermIntervalReviewSettingTab } = require("./ui/settings-tab");
const { ViewCoordinator } = require("./ui/view-coordinator");

class TermIntervalReviewPlugin extends Plugin {
  state = new ReviewState();
  persistence = null;
  vaultIndex = null;
  views = null;
  reviewService = null;

  get cards() {
    return this.state.cards;
  }

  get urgentSourcePaths() {
    return this.state.urgentSourcePaths;
  }

  get pinnedCardIds() {
    return this.state.pinnedCardIds;
  }

  get growthCardStates() {
    return this.state.growthCardStates;
  }

  get fileStates() {
    return this.state.fileStates;
  }

  get settings() {
    return this.state.settings;
  }

  get activeSourcePath() {
    return this.state.activeSourcePath;
  }

  async onload() {
    await this.loadPluginData();
    this.views = new ViewCoordinator(this.app, this.state);
    this.persistence = new PersistenceQueue({
      delay: SAVE_DELAY,
      save: (data) => this.saveData(data),
      snapshot: () => serializePluginData(this.state)
    });
    this.reviewService = new ReviewService({
      state: this.state,
      persist: () => this.persistNow(),
      resetQueue: () => this.clearQueueSearch(),
      refreshQueue: (force) => this.refreshViews(force),
      refreshPriorityControls: () => this.refreshReviewPriorityControls(),
      refreshCard: (cardId) => this.refreshReviewCard(cardId)
    });
    this.vaultIndex = new VaultIndex({
      app: this.app,
      state: this.state,
      delay: SAVE_DELAY,
      scanYieldEvery: SCAN_YIELD_EVERY,
      startupDelay: STARTUP_SCAN_DELAY,
      persistNow: () => this.persistNow(),
      schedulePersist: () => this.schedulePersist(),
      refreshViews: (force) => this.refreshViews(force),
      refreshPriorityControls: () => this.refreshReviewPriorityControls(),
      registerEvent: (event) => this.registerEvent(event)
    });

    this.rememberActiveSource(this.app.workspace.getActiveFile());
    this.addSettingTab(new TermIntervalReviewSettingTab(this.app, this));
    this.registerView(QUEUE_VIEW_TYPE, (leaf) => new QueueView(leaf, this));
    this.registerView(CARD_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));
    this.addCommand({
      id: "open-term-review-queue",
      name: "Открыть очередь повторения терминов",
      callback: () => void this.activateQueueView()
    });
    this.addCommand({
      id: "rescan-term-lines",
      name: "Повторно проверить определения **термин — определение**",
      callback: () => {
        this.cancelStartupScan();
        void this.runScan(() => this.synchronizeAll(true, true));
      }
    });
    this.registerInterval(window.setInterval(() => this.tickViews(), 1_000));
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.rememberActiveSource(file)));
    this.app.workspace.onLayoutReady(() => void this.initializeWorkspace());
    this.register(() => {
      this.persistence?.dispose();
      this.vaultIndex?.dispose();
    });
  }

  onunload() {
    this.vaultIndex?.dispose();
    this.views?.detach();
  }

  async loadPluginData() {
    this.state = new ReviewState(hydratePluginData(await this.loadData()));
  }

  getCard(id) {
    return this.state.getCard(id);
  }

  rememberActiveSource(file) {
    return this.views?.rememberActiveSource(file) ?? false;
  }

  getActiveDefinitionSource() {
    return this.views?.getActiveDefinitionSource() ?? null;
  }

  isUrgentSource(path) {
    return this.state.isUrgentSource(path);
  }

  isPinnedCard(id) {
    return this.state.isPinnedCard(id);
  }

  isGrowthCard(id) {
    return this.state.isGrowthCard(id);
  }

  getGrowthState(id) {
    return this.state.getGrowthState(id);
  }

  getPriorityPinnedCardIds() {
    return this.state.getPriorityPinnedCardIds();
  }

  getGrowthSignature() {
    return this.state.getGrowthSignature();
  }

  async toggleUrgentSource(path) {
    await this.reviewService?.toggleUrgentSource(path);
  }

  async togglePinnedCard(id) {
    await this.reviewService?.togglePinnedCard(id);
  }

  async toggleGrowthCard(id) {
    await this.reviewService?.toggleGrowthCard(id);
  }

  async updateSleepSetting(key, value) {
    await this.reviewService?.updateSleepSetting(key, value);
  }

  async reviewCard(cardId, correct) {
    return this.reviewService?.review(cardId, correct) ?? null;
  }

  async initializeWorkspace() {
    try {
      await this.activateQueueView();
      this.registerVaultWatchers();
      this.vaultIndex?.scheduleStartupScan();
    } catch (error) {
      console.error("Не удалось запустить повторение терминов", error);
      new Notice("Не удалось запустить плагин повторения терминов");
    }
  }

  activateQueueView() {
    return this.views?.activateQueueView();
  }

  openCard(cardId) {
    return this.views?.openCard(cardId);
  }

  openSource(path) {
    return this.views?.openSource(path);
  }

  clearQueueSearch() {
    this.views?.clearQueueSearch();
  }

  refreshViews(force = false) {
    this.views?.refreshQueue(force);
  }

  refreshReviewPriorityControls() {
    this.views?.refreshReviewPriorityControls();
  }

  refreshReviewCard(cardId) {
    this.views?.refreshReviewCard(cardId);
  }

  tickViews() {
    this.views?.tick();
  }

  registerVaultWatchers() {
    this.vaultIndex?.registerWatchers();
  }

  synchronizeAll(showNotice, force) {
    return this.vaultIndex?.synchronizeAll(showNotice, force);
  }

  synchronizeFile(file, persist = true, force = false) {
    return this.vaultIndex?.synchronizeFile(file, persist, force);
  }

  queueFileScan(file) {
    this.vaultIndex?.queueFileScan(file);
  }

  handleDelete(file) {
    return this.vaultIndex?.handleDelete(file);
  }

  handleRename(file, oldPath) {
    return this.vaultIndex?.handleRename(file, oldPath);
  }

  runScan(operation) {
    return this.vaultIndex?.run(operation) ?? Promise.resolve();
  }

  cancelStartupScan() {
    this.vaultIndex?.cancelStartupScan();
  }

  yieldToObsidian() {
    return this.vaultIndex?.yieldToObsidian() ?? Promise.resolve();
  }

  schedulePersist() {
    this.persistence?.schedule();
  }

  persistNow() {
    return this.persistence?.flush() ?? Promise.resolve();
  }
}

module.exports = { TermIntervalReviewPlugin };
