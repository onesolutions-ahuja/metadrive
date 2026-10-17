import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignore = new Set(['.git', 'node_modules', 'dist', 'dist-system', 'coverage', '.artifacts', '.cache']);
const sourcePattern = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const textPattern = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|ya?ml|md)$/;
const extensions = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.d.ts', '.d.mts', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(item.name)) continue;
    const location = path.join(dir, item.name);
    if (item.isDirectory()) walk(location);
    else if (item.isFile() && textPattern.test(item.name)) files.push(location);
  }
}
walk(root);
const missing = [];
function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return;
  const base = path.resolve(path.dirname(from), specifier);
  const noJs = base.replace(/\.(?:js|mjs|cjs)$/, '');
  const choices = new Set([base, ...extensions.map(x => base + x), ...extensions.map(x => noJs + x)]);
  if (![...choices].some(fs.existsSync)) missing.push({ file: path.relative(root, from), target: specifier, type: 'module' });
}
const importPattern = /(?:\b(?:import|export)\s+(?:[\s\S]{0,160}?\s+from\s*)?['"]([^'"]+)['"]|\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\))/g;
const fileExec = /\b(?:node|tsx|bash|sh)\s+(?:--[\w-]+\s+)*((?:\.\/|\.\.\/|scripts\/|apps\/|tests\/)[\w./-]+\.(?:mjs|js|ts|sh))\b/g;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (sourcePattern.test(file)) {
    for (const match of content.matchAll(importPattern)) resolveImport(file, match[1] || match[2]);
  }
  if (/\.ya?ml$/.test(file) || path.basename(file) === 'package.json') {
    for (const match of content.matchAll(fileExec)) {
      const target = match[1];
      const locations = [path.resolve(root, target), path.resolve(path.dirname(file), target)];
      if (!locations.some(fs.existsSync)) missing.push({ file: path.relative(root, file), target, type: 'command' });
    }
  }
}
const unique = [...new Map(missing.map(x => [JSON.stringify(x), x])).values()];
console.log(JSON.stringify({ scanned: files.length, missing: unique }, null, 2));
if (unique.length) process.exitCode = 1;
