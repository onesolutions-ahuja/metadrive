import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import RegisteredComponent from '../src/RegisteredComponent';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canNest, childrenOf, componentLayoutProps, isLayoutContainer, layoutSettings,
  reparentComponent, resolveLayoutStyle, updateLayoutSettings, validateLayoutSetting
} from '../src/pageComponentLayout';
import type { PageComponentMetadata } from '../src/metadata';

const node = (id: string, type: string, properties: Record<string, unknown> = {}): PageComponentMetadata => ({
  id, type, label: id, visible: true, region: 'main', properties,
  position: { x: 20, y: 40, width: 320, height: 180 }
});
const original: PageComponentMetadata[] = [
  node('container', 'Custom:KioskContainer'),
  node('row', 'Custom:KioskRow'),
  node('card', 'Custom:KioskCard'),
  node('text', 'Custom:KioskText')
];

test('all five supported layout components can contain child components', () => {
  for (const name of ['KioskContainer', 'KioskRow', 'KioskColumn', 'KioskGrid', 'KioskCard'])
    assert.equal(isLayoutContainer(node(name, 'Custom:' + name)), true);
  assert.equal(isLayoutContainer(node('text', 'Custom:KioskText')), false);
  assert.equal(isLayoutContainer(node('generic', 'Custom:UserLayout', { layoutContainer: true })), true);
  assert.equal(isLayoutContainer(node('generic', 'Custom:UserLayout', { layoutContainer: false })), false);
});

test('drag and drop nesting persists across JSON save/reopen without mutating original layout', () => {
  const inContainer = reparentComponent(original, 'row', 'container');
  const inRow = reparentComponent(inContainer, 'card', 'row');
  const deep = reparentComponent(inRow, 'text', 'card');
  const reopened = JSON.parse(JSON.stringify(deep)) as PageComponentMetadata[];
  assert.deepEqual(childrenOf(reopened, null).map((x) => x.id), ['container']);
  assert.deepEqual(childrenOf(reopened, 'container').map((x) => x.id), ['row']);
  assert.deepEqual(childrenOf(reopened, 'row').map((x) => x.id), ['card']);
  assert.deepEqual(childrenOf(reopened, 'card').map((x) => x.id), ['text']);
  assert.equal(canNest(reopened, 'container', 'text'), false);
  assert.equal(canNest(reopened, 'row', 'row'), false);
  assert.equal(canNest(reopened, 'text', 'container'), true);
  assert.strictEqual(reparentComponent(reopened, 'row', 'card'), reopened, 'cycle must be rejected');
  assert.equal(childrenOf(original, null).length, 4, 'original metadata remains unchanged');
  assert.deepEqual(childrenOf(reparentComponent(reopened, 'text', null), null).map(x => x.id), ['container', 'text']);
});

test('deleted/unregistered parent and malicious circular metadata recover safely as root nodes', () => {
  const lost = [node('a','Custom:KioskText',{layoutParentId:'missing'})];
  assert.deepEqual(childrenOf(lost,null).map(x=>x.id), ['a']);
  const cycle = [node('a','Custom:KioskRow',{layoutParentId:'b'}),node('b','Custom:KioskGrid',{layoutParentId:'a'})];
  assert.deepEqual(childrenOf(cycle,null).map(x=>x.id), ['a','b']);
  assert.deepEqual(childrenOf(cycle,'a'),[]);
});

test('base and per-device style overrides validate and resolve independently', () => {
  const base = updateLayoutSettings({}, 'Base','padding',24);
  const styled = updateLayoutSettings(base,'Base','backgroundColor','#aabbcc');
  const tablet = updateLayoutSettings(styled,'Tablet','padding',16);
  const phone = updateLayoutSettings(tablet,'Phone','padding',8);
  const phoneHidden = updateLayoutSettings(phone,'Phone','hidden',true);
  const reopened = JSON.parse(JSON.stringify(phoneHidden));
  assert.equal(layoutSettings(reopened,'Desktop').padding,24);
  assert.equal(layoutSettings(reopened,'Tablet').padding,16);
  assert.equal(layoutSettings(reopened,'Phone').padding,8);
  assert.deepEqual(resolveLayoutStyle(reopened,'Phone'),{ padding:8, backgroundColor:'#aabbcc', display:'none' });
  assert.equal(resolveLayoutStyle(reopened,'Desktop').display,undefined);
  assert.equal(layoutSettings(updateLayoutSettings(phone,'Phone','padding',null),'Phone').padding,24);
});

test('invalid style values cannot be persisted or used at runtime', () => {
  assert.match(validateLayoutSetting('padding',-1),/range/);
  assert.match(validateLayoutSetting('opacity',101),/range/);
  assert.match(validateLayoutSetting('borderWidth',999),/range/);
  assert.match(validateLayoutSetting('justifyContent','arbitrary'),/alignment/);
  assert.match(validateLayoutSetting('backgroundColor','url(javascript:alert(1))'),/colour/);
  assert.throws(()=>updateLayoutSettings({},'Base','padding',NaN));
  assert.deepEqual(resolveLayoutStyle({layoutStyle:{padding:999,backgroundColor:'javascript:evil'}}),{});
});

test('registered JSX containers render real child components, not placeholders', () => {
  const build = (apiName: string, body: string) => ({
    apiName,
    label: apiName,
    description: '',
    version: 1,
    trustedBundled: true,
    updatedAt: '2026-10-12T00:00:00Z',
    surfaces: ['page' as const],
    jsxSource: body,
    cssSource: '',
    scopedCss: '',
    compiledJs: transformSync(body, { loader: 'jsx', format: 'cjs', jsx: 'transform', target: 'es2020' }).code
  });
  const container = build('TestContainer', 'export default function Container(props) { return <div data-kind="container">{props.children}</div> }');
  const card = build('TestCard', 'export default function Card(props) { return <article data-kind="card">{props.title}</article> }');
  const html = renderToStaticMarkup(React.createElement(RegisteredComponent, {
    definition: container,
    props: {
      children: React.createElement(RegisteredComponent, { definition: card, props: { title: 'Nested component works' } })
    }
  }));
  assert.match(html, /data-kind="container"/);
  assert.match(html, /data-kind="card"/);
  assert.match(html, /Nested component works/);
  assert.ok(html.indexOf('data-kind="container"') < html.indexOf('data-kind="card"'));
});

test('row and grid alignment/gap settings are delivered to existing registered component props', () => {
  let props: Record<string, unknown> = {};
  props = updateLayoutSettings(props, 'Base', 'alignItems', 'center');
  props = updateLayoutSettings(props, 'Base', 'justifyContent', 'space-between');
  props = updateLayoutSettings(props, 'Base', 'gap', 14);
  props = updateLayoutSettings(props, 'Phone', 'gap', 6);
  assert.deepEqual(componentLayoutProps(props, 'Desktop'), { align: 'center', justify: 'space-between', gap: 14 });
  assert.deepEqual(componentLayoutProps(props, 'Phone'), { align: 'center', justify: 'space-between', gap: 6 });
});
