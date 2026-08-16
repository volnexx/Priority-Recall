import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bundlePath = path.join(root, "main.js");
const bundle = fs.readFileSync(bundlePath, "utf8");

const markerPattern = /^\/\/ src\/([^\r\n]+)$/gm;
const markers = [...bundle.matchAll(markerPattern)].map((match) => ({
  name: match[1],
  start: match.index,
  end: match.index + match[0].length,
}));

const mainMarkers = markers.filter((marker) => marker.name === "main.ts");
if (mainMarkers.length < 2) {
  throw new Error("Не удалось найти обе секции src/main.ts в собранном main.js");
}

const actualMainMarker = mainMarkers.at(-1);
const actualMainIndex = markers.indexOf(actualMainMarker);
const helperMarkers = markers.slice(1, actualMainIndex);

function codeAfterMarker(marker, end) {
  let start = marker.end;
  while (bundle[start] === "\r" || bundle[start] === "\n") start += 1;
  return bundle.slice(start, end).trim() + "\n";
}

function collectTopLevelNames(code) {
  const names = new Set();
  const pattern = /^(?:(?:var|let|const)\s+([A-Za-z_$][\w$]*)|(?:async\s+)?function\s+([A-Za-z_$][\w$]*))/gm;
  for (const match of code.matchAll(pattern)) names.add(match[1] ?? match[2]);
  return [...names];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usesIdentifier(code, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, "u").test(code);
}

function moduleSource(code, exports, priorModules) {
  const local = new Set(exports);
  const lines = ['"use strict";', ""];

  if (/\bimport_obsidian\b/u.test(code) && !local.has("import_obsidian")) {
    lines.push('const import_obsidian = require("obsidian");');
  }

  for (const prior of priorModules) {
    const used = prior.exports.filter((name) => !local.has(name) && usesIdentifier(code, name));
    if (used.length > 0) {
      lines.push(`const { ${used.join(", ")} } = require("./${prior.id}");`);
    }
  }

  if (lines.at(-1) !== "") lines.push("");
  lines.push(code.trim(), "");
  lines.push(`module.exports = { ${exports.join(", ")} };`, "");
  return lines.join("\n");
}

const srcDir = path.join(root, "src");
fs.rmSync(srcDir, { recursive: true, force: true });
fs.mkdirSync(srcDir, { recursive: true });

const modules = [];
for (let index = 0; index < helperMarkers.length; index += 1) {
  const marker = helperMarkers[index];
  const nextStart = index + 1 < helperMarkers.length
    ? helperMarkers[index + 1].start
    : actualMainMarker.start;
  const code = codeAfterMarker(marker, nextStart);
  const id = marker.name.replace(/\.ts$/u, "");
  const exports = collectTopLevelNames(code);
  fs.writeFileSync(path.join(srcDir, `${id}.js`), moduleSource(code, exports, modules));
  modules.push({ id, exports });
}

let mainBodyStart = actualMainMarker.end;
while (bundle[mainBodyStart] === "\r" || bundle[mainBodyStart] === "\n") mainBodyStart += 1;
let mainBody = bundle.slice(mainBodyStart).replace(/\n?\/\/# sourceMappingURL=.*$/su, "").trim() + "\n";

const boundaries = [
  ["queue-view", "var QueueView = class"],
  ["review-view", "var ReviewView = class"],
  ["settings-tab", "var TermIntervalReviewSettingTab = class"],
  ["plugin", "var TermIntervalReviewPlugin = class"],
];

const found = boundaries.map(([id, needle]) => {
  const index = mainBody.indexOf(needle);
  if (index < 0) throw new Error(`Не найдена граница модуля ${id}: ${needle}`);
  return { id, index };
});

const uiSharedCode = mainBody.slice(0, found[0].index).trim() + "\n";
const uiSharedExports = collectTopLevelNames(uiSharedCode);
fs.writeFileSync(path.join(srcDir, "ui-shared.js"), moduleSource(uiSharedCode, uiSharedExports, modules));
modules.push({ id: "ui-shared", exports: uiSharedExports });

for (let index = 0; index < found.length; index += 1) {
  const current = found[index];
  const end = index + 1 < found.length ? found[index + 1].index : mainBody.length;
  const code = mainBody.slice(current.index, end).trim() + "\n";
  const exports = collectTopLevelNames(code);
  fs.writeFileSync(path.join(srcDir, `${current.id}.js`), moduleSource(code, exports, modules));
  modules.push({ id: current.id, exports });
}

fs.writeFileSync(
  path.join(srcDir, "main.js"),
  '"use strict";\n\nconst { TermIntervalReviewPlugin } = require("./plugin");\n\nmodule.exports = TermIntervalReviewPlugin;\n',
);

const packageJson = {
  name: "term-interval-review",
  version: "0.36.0",
  private: true,
  type: "commonjs",
  scripts: {
    build: "esbuild src/main.js --bundle --external:obsidian --platform=node --format=cjs --target=es2018 --outfile=main.js --log-level=warning",
    check: "node --check main.js",
  },
  devDependencies: {
    esbuild: "0.21.5",
  },
};
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

const architecture = `# Архитектура исходников\n\nКорневой \`main.js\` — только собранный файл, который загружает Obsidian. Изменения вносятся в \`src/\`, затем выполняется \`npm run build\`.\n\n## Модули\n\n- \`settings.js\` — настройки времени сна и их нормализация.\n- \`display.js\` — форматирование текста и значков интерфейса.\n- \`parser.js\` — разбор определений и перечней из Markdown.\n- \`scheduler.js\` — интервалы, доступность карточек, выращивание и время повторений.\n- \`queue.js\` — приоритеты и формирование очередей.\n- \`review-flow.js\` — переходы между карточками после ответа.\n- \`file-state.js\` — состояние файлов и сравнение результатов сканирования.\n- \`ui-shared.js\` — общие константы и вспомогательные функции интерфейса.\n- \`queue-view.js\` — правая панель очереди повторений.\n- \`review-view.js\` — окно отдельной карточки повторения.\n- \`settings-tab.js\` — вкладка настроек плагина.\n- \`plugin.js\` — жизненный цикл плагина, хранение состояния, сканирование заметок и регистрация представлений.\n- \`main.js\` — минимальная точка входа исходников.\n\n## Сборка\n\n\`npm install\`\n\n\`npm run build\`\n\n\`npm run check\`\n`;
fs.writeFileSync(path.join(root, "ARCHITECTURE.md"), architecture);

console.log(`Создано ${modules.length + 1} исходных модулей.`);
