// Packaging only: the editable game remains a standalone, build-free HTML.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { minify as minifyJs } from 'terser';
import { minify as minifyCss } from 'csso';
import { minify as minifyHtml } from 'html-minifier-terser';

const root = path.resolve(import.meta.dirname, '..');
const input = fs.readFileSync(path.join(root, 'dino.html'), 'utf8');
const output = path.join(root, 'release');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const bytes = text => Buffer.byteLength(text, 'utf8');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const stages = [];
let html = input;

// Step 1: every inline script, before CSS and markup. Keep property names and
// public hooks/API fields intact; retain the Chromium attribution in the script.
const scripts = [...html.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi)];
assert(scripts.length > 0, 'No inline scripts found');
for (const match of scripts.reverse()) {
  assert(!/\bsrc\s*=|\btype\s*=/i.test(match[1]), 'Review new external/nonclassic scripts before packaging');
  const result = await minifyJs(match[2], {
    ecma: 2022,
    compress: { passes: 2 },
    mangle: true,
    format: { inline_script: true, comments: /Copyright|@license|BSD-style license/ },
  });
  assert(result.code, 'Terser returned an empty script');
  html = html.slice(0, match.index) + match[1] + result.code + match[3]
    + html.slice(match.index + match[0].length);
}
stages.push({ tool: 'Terser', bytes: bytes(html) });

// Step 2: includes the help document's stylesheet inside its template.
let styles = 0;
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, css, close) => {
  styles++;
  // CSSO 5's restructuring moves the var(--bg) fallback after color-mix(),
  // overriding transparency on utility buttons. Keep declaration/rule order.
  return open + minifyCss(css, { comments: false, restructure: false }).css + close;
});
assert(styles > 0, 'No embedded styles found');
assert(!/\sstyle\s*=/i.test(html), 'Review new inline style attributes before packaging');
stages.push({ tool: 'CSSO', bytes: bytes(html) });

// Step 3: only markup. Do not run a second JS/CSS optimizer after the explicit
// passes. Preserve tag boundaries and whitespace between inline text elements.
const markupOptions = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  removeAttributeQuotes: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  collapseBooleanAttributes: true,
  removeOptionalTags: false,
  caseSensitive: true,
  keepClosingSlash: true,
  minifyJS: false,
  minifyCSS: false,
};
// WebKit paints the transformed menu's rounded edges differently when its text
// whitespace nodes are collapsed (isolated comparison: 194 pixels, max delta 9).
// Minify its markup/attributes too, retaining only this layout-sensitive spacing.
const panelPattern = /<section\b[^>]*\bid=["']?round-panel["']?[\s\S]*?<\/section>/gi;
const panels = [...html.matchAll(panelPattern)];
assert.equal(panels.length, 1, 'Expected one round menu');
html = html.replace(panels[0][0], await minifyHtml(panels[0][0], {
  ...markupOptions, collapseWhitespace: false,
}));
html = await minifyHtml(html, { ...markupOptions, ignoreCustomFragments: [panelPattern] });
html = html.trim() + '\n';
stages.push({ tool: 'HTMLMinifier-Terser', bytes: bytes(html) });

assert(html.includes('Copyright 2014 The Chromium Authors'), 'Chromium attribution was lost');
assert(bytes(html) < bytes(input), 'Release must be smaller than source');
assert(!/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html),
  'The release must remain self-contained');
for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script);

const compressed = text => ({
  bytes: bytes(text), sha256: sha256(text),
  gzipBytes: gzipSync(text, { level: 9 }).length,
  brotliBytes: brotliCompressSync(text, { params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: 11,
  } }).length,
});
const report = {
  build: input.match(/\bBUILD\s*=\s*'([^']+)'/)?.[1],
  source: { file: 'dino.html', ...compressed(input) },
  release: { file: 'release/dino.html', ...compressed(html) },
  tools: Object.fromEntries(['terser', 'csso', 'html-minifier-terser']
    .map(name => [name, lock.packages[`node_modules/${name}`].version])),
  inlineScripts: scripts.length, embeddedStyles: styles, stages,
  savedBytes: bytes(input) - bytes(html),
  savedPercent: Number(((1 - bytes(html) / bytes(input)) * 100).toFixed(2)),
};
// Write only these generated files; no runtime assets, mutable scores or secrets.
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'dino.html'), html);
fs.writeFileSync(path.join(output, 'size-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.source.bytes} → ${report.release.bytes} bytes; saved ${report.savedBytes} bytes (${report.savedPercent}%)`);
console.log(`Delivery: ${path.join(output, 'dino.html')}`);
