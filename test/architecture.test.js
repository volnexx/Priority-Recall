"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const src = path.resolve(__dirname, "../src");

function sources(directory) {
  return fs.readdirSync(path.join(src, directory))
    .filter((name) => name.endsWith(".js"))
    .map((name) => [name, fs.readFileSync(path.join(src, directory, name), "utf8")]);
}

test("чистое ядро не зависит от Obsidian и внешних слоёв", () => {
  for (const [name, source] of sources("core")) {
    assert.doesNotMatch(source, /require\(["']obsidian["']\)/u, name);
    assert.doesNotMatch(source, /require\(["']\.\.\/(?:application|infrastructure|ui)\//u, name);
  }
});

test("сценарии приложения не зависят от Obsidian, файлов и интерфейса", () => {
  for (const [name, source] of sources("application")) {
    assert.doesNotMatch(source, /require\(["']obsidian["']\)/u, name);
    assert.doesNotMatch(source, /require\(["']\.\.\/(?:infrastructure|ui)\//u, name);
  }
});

test("главный модуль остаётся связующим слоем, а не содержит правила", () => {
  const plugin = fs.readFileSync(path.join(src, "plugin.js"), "utf8");
  assert.match(plugin, /ReviewService/u);
  assert.match(plugin, /VaultIndex/u);
  assert.match(plugin, /ViewCoordinator/u);
  assert.doesNotMatch(plugin, /BOLD_DEFINITION_PATTERN|REVIEW_INTERVALS|GROWTH_AUTO_RELEASE_STAGE/u);
});
