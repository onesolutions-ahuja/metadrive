import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLibraryComponent } from '../src/modules/components/component-compiler.js';

test('agent1: one compiler supports create and revision rendering', async () => {
  const compiled = await compileLibraryComponent('export default function Sample() { return <div>OK</div>; }', 'OneCard');
  assert.ok('code' in compiled);
});
test('agent1: component compilation rejects missing exports and external imports', async () => {
  const absent = await compileLibraryComponent('const Example = () => <div />;', 'OneCard');
  assert.deepEqual(absent, { error: 'The JSX file must export a default React component' });
  const external = await compileLibraryComponent('import thing from "some-module"; export default function Example(){ return <div>{thing}</div> }','OneCard');
  assert.ok('error' in external);
});
