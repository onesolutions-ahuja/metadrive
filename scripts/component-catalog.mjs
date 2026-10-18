import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const webSourceRoot = fileURLToPath(new URL('../apps/web/src/', import.meta.url));
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Static source descriptors, never tenant runtime metadata or a trust grant. */
export async function loadComponentCatalog() {
  const oneRoot = path.join(webSourceRoot, 'one');
  const manifest = await readJson(path.join(oneRoot, 'manifest.json'));
  const one = await Promise.all(manifest.components.map(async reference => {
    if (typeof reference !== 'string') throw Error('Expected a component descriptor path');
    const file = path.resolve(oneRoot, reference);
    if (!within(oneRoot, file)) throw Error('Component descriptor escapes One');
    const definition = await readJson(file);
    if (path.basename(path.dirname(file)) !== definition.apiName) throw Error('Component folder must match its API name');
    return definition;
  }));
  const core = await readJson(path.join(webSourceRoot, 'core/components/BundledCatalog/manifest.json'));
  const components = [...core.map(item => ({ ...item, jsxFile: item.jsx, cssFile: item.css })), ...one];
  const names = new Set();
  for (const component of components) {
    if (names.has(component.apiName)) throw Error('Duplicate bundled API name: ' + component.apiName);
    names.add(component.apiName);
  }
  return { schemaVersion: manifest.schemaVersion, commonProperties: manifest.commonProperties, components };
}

/** Bundle local source imports before registration. Runtime and sandbox still
 * receive self-contained code and styles, with React supplied by the host. */
export async function buildBundledComponent(definition) {
  const allowed = [path.join(webSourceRoot, 'one'), path.join(webSourceRoot, 'core/components/SystemPanel')];
  const boundary = {
    name: 'local-component-sources',
    setup(builder) {
      builder.onResolve({ filter: /^[^./]|^\// }, args => {
        if (args.kind === 'entry-point' && path.isAbsolute(args.path)) return;
        return { errors: [{ text: 'Bundled components may import only local component files: ' + args.path }] };
      });
      builder.onLoad({ filter: /\.(?:jsx?|tsx?|css)$/ }, async args => {
        const file = await realpath(args.path);
        if (!allowed.some(root => within(root, file))) throw Error('Component import escapes its source library: ' + args.path);
        const extension = path.extname(file).slice(1);
        return { contents: await readFile(file, 'utf8'), loader: extension };
      });
    }
  };
  const options = { bundle: true, write: false, logLevel: 'silent', metafile: true, plugins: [boundary] };
  const [jsx, css] = await Promise.all([
    build({ ...options, entryPoints: [path.resolve(webSourceRoot, definition.jsxFile)], format: 'cjs', platform: 'browser', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', tsconfigRaw: { compilerOptions: { jsx: 'react' } } }),
    build({ ...options, entryPoints: [path.resolve(webSourceRoot, definition.cssFile)] })
  ]);
  if (Object.values(jsx.metafile.outputs).some(output => output.imports.length)) throw Error('Unresolved runtime import in ' + definition.apiName);
  return { compiledJs: jsx.outputFiles[0].text, cssSource: css.outputFiles[0].text };
}
