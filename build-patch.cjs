#!/usr/bin/env node
/**
 * build-patch.cjs — 将 ESM 源码 (src/client.js) 转换为 DSH __ModuleLoader__
 * 标准 bundle 格式，输出到 lib/client.js 供浏览器端注册。
 *
 * 用法: node build-patch.cjs
 *
 * 背景: DSH web 端不负责构建 client bundle——浏览器执行插件脚本时必须调用
 * window.__ModuleLoader__.load({id, factory}) 注册自己，DSH 才能拿到插件
 * 导出的 inject/apply。若把裸 ESM 源码 serve 出去，浏览器直接语法报错，
 * 报 "loaded without registering ... via ModuleLoader.load"。
 *
 * 结构约定（与其他官方插件一致）:
 *   src/client.js  — 人类可读的 ESM 源码（git 跟踪）
 *   lib/client.js  — 构建产物（git 跟踪；package.json 的 dsh.client 指向它）
 * 更新源码后跑一次本脚本，把两个文件一起提交即可。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src', 'client.js');
const OUT = path.join(ROOT, 'lib', 'client.js');
const ID = '@dsh-external/dsh-client-ui-chunk-mode';

if (!fs.existsSync(SRC)) {
  console.error(`[build-patch] 未找到源码 ${SRC}`);
  process.exit(1);
}

let src = fs.readFileSync(SRC, 'utf8');

// 保护：输入必须是 ESM 源码，避免把已转换的产物再转一遍。
if (!/^import\s/m.test(src) && !/^export\s/m.test(src)) {
  console.error('[build-patch] 输入看起来不是 ESM 源码（缺少 import/export），已中止。请确认 src/client.js 是原始源码。');
  process.exit(1);
}

// 1) import { a as b, c } from 'mod'  ->  const { a: b, c } = require('mod');
const importRe = /^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
src = src.replace(importRe, (m, names, mod) => {
  const bindings = names
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const mm = s.match(/^(\w+)\s+as\s+(\w+)$/);
      return mm ? `${mm[1]}: ${mm[2]}` : s;
    })
    .join(', ');
  return `const { ${bindings} } = require('${mod}');`;
});

// 2) export const X / export function X  ->  普通声明 + 收集导出名
const exportsList = [];
src = src.replace(/^export\s+const\s+(\w+)/gm, (m, name) => {
  exportsList.push(name);
  return `const ${name}`;
});
src = src.replace(/^export\s+function\s+(\w+)/gm, (m, name) => {
  exportsList.push(name);
  return `function ${name}`;
});
src = src.replace(/^export\s+default\b/gm, (m) => {
  console.warn('[build-patch] 警告: default export 不被支持，已忽略');
  return '/* (default export not supported) */';
});

// 3) 包裹成 __ModuleLoader__.load 标准格式。
//    factory 是单参数箭头函数 (require)=>{...}，内部自备 module/exports 声明。
const exportLines = exportsList.map((n) => `exports.${n} = ${n};`).join('\n');
const prologue = 'var module={exports:{}};var exports=module.exports;';
const wrapped =
  `window.__ModuleLoader__.load({id:"${ID}",factory:(require)=>{\n` +
  `${prologue}\n${src}\n${exportLines}\n` +
  `return module.exports;\n}});\n`;

fs.writeFileSync(OUT, wrapped, 'utf8');
console.log(`[build-patch] OK ${path.relative(ROOT, OUT)}: ${src.length} -> ${wrapped.length} bytes`);
console.log(`[build-patch] exports: [${exportsList.join(', ')}]`);
