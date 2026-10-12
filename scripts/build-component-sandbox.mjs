import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [resolve(root, 'apps/web/src/component-sandbox-frame.tsx')],
  outfile: resolve(root, 'apps/web/public/component-sandbox.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  jsx: 'transform', minify: true, legalComments: 'none'
});
