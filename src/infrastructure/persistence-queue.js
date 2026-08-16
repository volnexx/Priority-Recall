"use strict";

class PersistenceQueue {
  constructor({ delay, save, snapshot }) {
    this.delay = delay;
    this.save = save;
    this.snapshot = snapshot;
    this.timer = null;
    this.chain = Promise.resolve();
  }

  schedule() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delay);
  }

  async flush() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain.then(() => this.save(this.snapshot()));
    await this.chain;
  }

  dispose() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { PersistenceQueue };
