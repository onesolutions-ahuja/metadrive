import { transform } from 'esbuild';
import { hasDefaultComponentExport } from './component-source.js';

/** Shared metadata component compiler; used by create and revision paths. */
export async function compileLibraryComponent(jsxSource: string, apiName: string):
  Promise<{ code: string } | { error: string }> {
  const result = await transform(jsxSource, {
    loader: 'tsx', format: 'cjs', target: 'es2020',
    jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    sourcefile: `${apiName}.tsx`
  });
  if (!hasDefaultComponentExport(result.code))
    return { error: 'The JSX file must export a default React component' };
  if (/\brequire\s*\(/.test(result.code))
    return { error: 'Custom components must be self-contained and cannot import external modules' };
  return { code: result.code };
}
