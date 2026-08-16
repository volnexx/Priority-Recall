"use strict";

const { Notice, TFile, TFolder } = require("obsidian");
const { reconcileSourceCards } = require("../application/card-catalog");
const { createFileScanState, isSameFileState, pruneFileStates } = require("../core/file-state");
const { parseReviewEntries } = require("../core/parser");

class VaultIndex {
  constructor({
    app,
    state,
    delay,
    scanYieldEvery,
    startupDelay,
    persistNow,
    schedulePersist,
    refreshViews,
    refreshPriorityControls,
    registerEvent
  }) {
    this.app = app;
    this.state = state;
    this.delay = delay;
    this.scanYieldEvery = scanYieldEvery;
    this.startupDelay = startupDelay;
    this.persistNow = persistNow;
    this.schedulePersist = schedulePersist;
    this.refreshViews = refreshViews;
    this.refreshPriorityControls = refreshPriorityControls;
    this.registerEvent = registerEvent;
    this.modifyTimers = new Map();
    this.scanChain = Promise.resolve();
    this.startupScanTimer = null;
    this.watchersRegistered = false;
    this.disposed = false;
  }

  registerWatchers() {
    if (this.watchersRegistered) return;
    this.watchersRegistered = true;
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") this.queueFileScan(file);
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") this.queueFileScan(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      void this.run(() => this.handleDelete(file));
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      void this.run(() => this.handleRename(file, oldPath));
    }));
  }

  scheduleStartupScan() {
    this.cancelStartupScan();
    this.startupScanTimer = window.setTimeout(() => {
      this.startupScanTimer = null;
      void this.run(() => this.synchronizeAll(false, false)).catch((error) => {
        console.error("Не удалось проверить заметки после запуска", error);
        new Notice("Не удалось проверить заметки для повторения");
      });
    }, this.startupDelay);
  }

  cancelStartupScan() {
    if (this.startupScanTimer === null) return;
    window.clearTimeout(this.startupScanTimer);
    this.startupScanTimer = null;
  }

  run(operation) {
    const current = this.scanChain.then(operation);
    this.scanChain = current.then(() => undefined, () => undefined);
    return current;
  }

  queueFileScan(file) {
    const previous = this.modifyTimers.get(file.path);
    if (previous !== undefined) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.modifyTimers.delete(file.path);
      void this.run(() => this.synchronizeFile(file, true, false));
    }, this.delay);
    this.modifyTimers.set(file.path, timer);
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
      if (!force && isSameFileState(this.state.fileStates[file.path], currentState)) continue;
      const result = await this.synchronizeFile(file, false, force);
      dataChanged ||= result.dataChanged;
      cardsChanged ||= result.cardsChanged;
      scannedFiles += 1;
      if (scannedFiles % this.scanYieldEvery === 0) await this.yieldToObsidian();
    }

    const before = this.state.cards.length;
    this.state.cards = this.state.cards.filter((card) => paths.has(card.sourcePath));
    if (before !== this.state.cards.length) {
      dataChanged = true;
      cardsChanged = true;
    }
    for (const sourcePath of [...this.state.urgentSourcePaths]) {
      if (!paths.has(sourcePath)) {
        this.state.urgentSourcePaths.delete(sourcePath);
        dataChanged = true;
      }
    }
    const scopedStateChanged = this.state.pruneCardReferences();
    dataChanged ||= scopedStateChanged;
    const pruned = pruneFileStates(this.state.fileStates, paths);
    this.state.fileStates = pruned.states;
    dataChanged ||= pruned.changed;

    if (dataChanged) await this.persistNow();
    if (cardsChanged) this.refreshViews(true);
    else this.refreshViews(false);
    if (showNotice) {
      new Notice(`Проверено заметок: ${scannedFiles}. Карточек: ${this.state.cards.length}`);
    }
  }

  async synchronizeFile(file, persist, force) {
    const currentState = createFileScanState(file.stat);
    if (!force && isSameFileState(this.state.fileStates[file.path], currentState)) {
      return { dataChanged: false, cardsChanged: false };
    }
    let content;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch (error) {
      console.error(`Не удалось прочитать ${file.path}`, error);
      return { dataChanged: false, cardsChanged: false };
    }

    const result = reconcileSourceCards(
      this.state.cards,
      parseReviewEntries(content),
      file.path,
      Date.now()
    );
    if (result.cardsChanged) {
      this.state.cards = result.cards;
      this.state.pruneCardReferences();
    }
    this.state.fileStates[file.path] = currentState;
    if (persist) {
      this.schedulePersist();
      if (result.cardsChanged) this.refreshViews(true);
    }
    return { dataChanged: true, cardsChanged: result.cardsChanged };
  }

  async handleDelete(file) {
    const path = file.path;
    const prefix = file instanceof TFolder ? `${path}/` : null;
    const isAffected = (candidate) => candidate === path || prefix !== null && candidate.startsWith(prefix);
    const activeSourceDeleted = this.state.activeSourcePath !== null && isAffected(this.state.activeSourcePath);
    if (activeSourceDeleted) this.state.activeSourcePath = null;

    const before = this.state.cards.length;
    this.state.cards = this.state.cards.filter((card) => !isAffected(card.sourcePath));
    let stateChanged = false;
    for (const statePath of Object.keys(this.state.fileStates)) {
      if (isAffected(statePath)) {
        delete this.state.fileStates[statePath];
        stateChanged = true;
      }
    }
    let urgentChanged = false;
    for (const sourcePath of [...this.state.urgentSourcePaths]) {
      if (isAffected(sourcePath)) {
        this.state.urgentSourcePaths.delete(sourcePath);
        urgentChanged = true;
      }
    }
    const scopedStateChanged = this.state.pruneCardReferences();
    const cardsChanged = before !== this.state.cards.length;
    if (cardsChanged || stateChanged || urgentChanged || scopedStateChanged || activeSourceDeleted) {
      await this.persistNow();
      if (cardsChanged || urgentChanged || scopedStateChanged || activeSourceDeleted) {
        this.refreshViews(true);
        this.refreshPriorityControls();
      }
    }
  }

  async handleRename(file, oldPath) {
    let changed = false;
    const oldPrefix = file instanceof TFolder ? `${oldPath}/` : null;
    const newPrefix = file instanceof TFolder ? `${file.path}/` : null;
    const renamePath = (candidate) => {
      if (candidate === oldPath) return file.path;
      if (oldPrefix && newPrefix && candidate.startsWith(oldPrefix)) {
        return `${newPrefix}${candidate.slice(oldPrefix.length)}`;
      }
      return null;
    };

    const activePath = this.state.activeSourcePath;
    if (activePath !== null) {
      const renamed = renamePath(activePath);
      if (renamed !== null) this.state.activeSourcePath = renamed;
    }
    for (const card of this.state.cards) {
      const renamed = renamePath(card.sourcePath);
      if (renamed !== null) {
        card.sourcePath = renamed;
        changed = true;
      }
    }
    for (const [statePath, state] of Object.entries(this.state.fileStates)) {
      const renamed = renamePath(statePath);
      if (renamed !== null) {
        delete this.state.fileStates[statePath];
        this.state.fileStates[renamed] = state;
        changed = true;
      }
    }
    for (const sourcePath of [...this.state.urgentSourcePaths]) {
      const renamed = renamePath(sourcePath);
      if (renamed !== null) {
        this.state.urgentSourcePaths.delete(sourcePath);
        this.state.urgentSourcePaths.add(renamed);
        changed = true;
      }
    }
    const pending = this.modifyTimers.get(oldPath);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      this.modifyTimers.delete(oldPath);
    }
    if (changed) {
      await this.persistNow();
      this.refreshViews(true);
      this.refreshPriorityControls();
    }
    if (file instanceof TFile && file.extension === "md") this.queueFileScan(file);
  }

  async yieldToObsidian() {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.modifyTimers.values()) window.clearTimeout(timer);
    this.modifyTimers.clear();
    this.cancelStartupScan();
  }
}

module.exports = { VaultIndex };
