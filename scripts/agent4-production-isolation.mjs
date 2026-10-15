import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import assert from 'node:assert/strict';

const assets = resolve('apps/web/dist/assets');
const names = readdirSync(assets).filter(name => name.endsWith('.js'));
const find = (prefix) => {
  const matches = names.filter(name => name.startsWith(prefix + '-') && name.endsWith('.js'));
  assert.equal(matches.length, 1, `Expected one production chunk for ${prefix}, found ${matches.join(', ')}`);
  return resolve(assets, matches[0]);
};
const optional = [
  'pageBuilderView', 'FlowBuilder', 'DashboardBuilder', 'reportBuilderView',
  'objectManagerView', 'ComponentLibrary'
].map(find);
const staticImports = (content) => {
  const paths = [];
  const matcher = /\bimport\s*(?!\()(?:[^;"']*?\bfrom\s*)?["'](\.[^"']+\.js)["']/g;
  for (const match of content.matchAll(matcher)) paths.push(match[1]);
  return paths;
};
const closure = (entry) => {
  const visited = new Set();
  const pending = [entry];
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const imported of staticImports(source)) {
      const target = resolve(dirname(path), imported);
      if (target.endsWith('.js')) pending.push(target);
    }
  }
  return visited;
};

const landing = closure(find('index'));
const workspace = closure(find('App'));
for (const file of optional) {
  assert.ok(!landing.has(file), `${basename(file)} loaded eagerly by the public landing entry`);
  assert.ok(!workspace.has(file), `${basename(file)} loaded eagerly by authenticated App`);
}
assert.ok(!landing.has(find('App')), 'Authenticated workspace must remain lazy from landing entry');
for (const file of optional) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.length > 0, `Empty optional chunk: ${basename(file)}`);
}
console.log('Agent 4 production static-import isolation PASS');
console.log(`Landing eager graph: ${landing.size} chunks; authenticated shell eager graph: ${workspace.size} chunks`);
console.log('Verified optional chunks:', optional.map(basename).join(', '));
