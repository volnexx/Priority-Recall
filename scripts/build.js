"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "src", "main.js");
const output = path.join(root, "main.js");
const modules = new Map();
const localRequirePattern = /require\((['"])(\.{1,2}\/[^'"\r\n]+)\1\)/gu;

function moduleId(filename) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function resolveLocalModule(parent, request) {
  const target = path.resolve(path.dirname(parent), request);
  for (const candidate of [target, `${target}.js`, path.join(target, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Не найден модуль ${request} из ${moduleId(parent)}`);
}

function collect(filename) {
  const id = moduleId(filename);
  if (modules.has(id)) return id;
  modules.set(id, "");
  const source = fs.readFileSync(filename, "utf8").replace(
    localRequirePattern,
    (_match, _quote, request) => `__require(${JSON.stringify(collect(resolveLocalModule(filename, request)))})`
  );
  modules.set(id, source);
  return id;
}

const entryId = collect(entry);
const bundledModules = [...modules.entries()]
  .map(([id, source]) => `${JSON.stringify(id)}: function(module, exports, __require) {\n${source}\n}`)
  .join(",\n");
const bundle = `"use strict";\n\nconst __modules = {\n${bundledModules}\n};\nconst __cache = Object.create(null);\nfunction __require(id) {\n  if (__cache[id]) return __cache[id].exports;\n  const factory = __modules[id];\n  if (!factory) throw new Error(\`Не найден встроенный модуль: \${id}\`);\n  const module = { exports: {} };\n  __cache[id] = module;\n  factory(module, module.exports, __require);\n  return module.exports;\n}\nmodule.exports = __require(${JSON.stringify(entryId)});\n`;

fs.writeFileSync(output, bundle);
console.log(`Собрано модулей: ${modules.size}`);
