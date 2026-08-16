"use strict";

const import_obsidian = require("obsidian");
const { normalizeClockTime } = require("../core/settings");

var TermIntervalReviewSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  plugin;
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u0420\u0435\u0436\u0438\u043C \u0441\u043D\u0430" });
    this.addTimeSetting(
      "\u0412\u0440\u0435\u043C\u044F \u043E\u0442\u0445\u043E\u0434\u0430 \u043A\u043E \u0441\u043D\u0443",
      "\u041F\u043E\u0441\u043B\u0435 \u044D\u0442\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438, \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044B\u0435 \u0434\u043E \u043F\u043E\u0434\u044A\u0451\u043C\u0430, \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0437\u0430\u0440\u0430\u043D\u0435\u0435.",
      "bedtime"
    );
    this.addTimeSetting(
      "\u0412\u0440\u0435\u043C\u044F \u043F\u043E\u0434\u044A\u0451\u043C\u0430",
      "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0438, \u0441\u0440\u043E\u043A \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u043D\u0430\u0441\u0442\u0443\u043F\u0438\u0442 \u0434\u043E \u044D\u0442\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438, \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u0441\u043D\u043E\u043C.",
      "wakeTime"
    );
  }
  addTimeSetting(name, description, key) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(description).addText((component) => {
      component.inputEl.type = "time";
      component.inputEl.step = "60";
      component.setValue(this.plugin.settings[key]);
      component.onChange(async (value) => {
        const normalized = normalizeClockTime(value, null);
        if (normalized === null || normalized === this.plugin.settings[key]) return;
        await this.plugin.updateSleepSetting(key, normalized);
      });
      component.inputEl.addEventListener("blur", () => {
        const normalized = normalizeClockTime(component.getValue(), null);
        if (normalized === null) component.setValue(this.plugin.settings[key]);
      });
    });
  }
};

module.exports = { TermIntervalReviewSettingTab };
