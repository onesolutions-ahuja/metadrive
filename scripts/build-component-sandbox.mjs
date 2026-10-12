import { build } from 'esbuild';
import { resolve } from 'node:path';
await build({
  entryPoints: [resolve('apps/web/src/component-sandbox-frame.tsx')],
  outfile: resolve('apps/web/public/component-sandbox.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  jsx: 'transform', minify: true, legalComments: 'none'
});
