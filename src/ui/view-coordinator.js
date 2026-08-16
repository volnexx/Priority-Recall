"use strict";

const { Notice, TFile } = require("obsidian");
const { compareCardsByDueTime } = require("../core/schedule");
const { CARD_VIEW_TYPE, QUEUE_VIEW_TYPE } = require("./constants");
const { QueueView } = require("./queue-view");
const { ReviewView } = require("./review-view");

class ViewCoordinator {
  constructor(app, state) {
    this.app = app;
    this.state = state;
  }

  rememberActiveSource(file) {
    if (file === null) return false;
    const nextPath = file instanceof TFile && file.extension === "md" ? file.path : null;
    if (nextPath === this.state.activeSourcePath) return false;
    this.state.activeSourcePath = nextPath;
    this.refreshQueue(true);
    return true;
  }

  getActiveDefinitionSource() {
    const path = this.state.activeSourcePath;
    if (path === null) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") return null;
    const firstCard = this.state.cards
      .filter((card) => card.sourcePath === path)
      .sort(compareCardsByDueTime)[0];
    return firstCard ? { path, title: file.basename, cardId: firstCard.id } : null;
  }

  async activateQueueView() {
    let leaf = this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true) ?? undefined;
      if (!leaf) {
        new Notice("Не удалось открыть правую панель повторения");
        return;
      }
      await leaf.setViewState({ type: QUEUE_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async openCard(cardId) {
    let leaf = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    leaf ??= this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true, state: { cardId } });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openSource(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("Исходная заметка не найдена");
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  clearQueueSearch() {
    for (const leaf of this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)) {
      if (leaf.view instanceof QueueView) leaf.view.clearSearch();
    }
  }

  refreshQueue(force = false) {
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
      if (leaf.view instanceof ReviewView
        && leaf.view.cardId === cardId
        && leaf.view.waitingFor === null) {
        void leaf.view.renderQuestion();
      }
    }
  }

  tick() {
    for (const leaf of this.app.workspace.getLeavesOfType(QUEUE_VIEW_TYPE)) {
      if (leaf.view instanceof QueueView) leaf.view.tick();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)) {
      if (leaf.view instanceof ReviewView) leaf.view.tick();
    }
  }

  detach() {
    this.app.workspace.detachLeavesOfType(QUEUE_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CARD_VIEW_TYPE);
  }
}

module.exports = { ViewCoordinator };
