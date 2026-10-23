import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { snapCanvasPosition, snapCanvasSize, wrapCanvasComponent, ungroupCanvasComponent, alignCanvasComponents } from '../src/core/builders/PageBuilder/canvasInteractions';

test('canvas movement aligns with adjacent element edges and returns visible guide flags', () => {
  const result = snapCanvasPosition(
    { x:96, y:119, width:100, height:80 },
    { width:1000, height:600 },
    [{ x:100, y:120, width:150, height:80 }],
    false
  );
  assert.equal(result.position.x,100);
  assert.equal(result.position.y,120);
  assert.deepEqual(result.guides,{x:true,y:true});
});

test('snap works at canvas bounds without shrinking elements', () => {
  const result = snapCanvasPosition(
    { x:900, y:540, width:200, height:120 },
    { width:1000, height:600 },[],true
  );
  assert.equal(result.position.x,800);
  assert.equal(result.position.y,480);
  assert.equal(result.position.width,200);
  assert.equal(result.position.height,120);
});

test('resizing constrains dimensions to the canvas without corrupting metadata', () => {
  const result = snapCanvasSize(
    { x:100, y:120, width:80, height:80 },1000,1000,
    { width:800, height:600 },{width:40,height:40},false
  );
  assert.equal(result.width,700);
  assert.equal(result.height,480);
});

test('group and ungroup retain the original component position and properties', () => {
  const original = [{
    id:'card1',type:'Custom:Example',label:'Example',visible:true,region:'main' as const,
    properties:{value:'User customization'},position:{x:32,y:64,width:240,height:180}
  }];
  const wrapped = wrapCanvasComponent(original,'card1','group1');
  assert.equal(wrapped.length,2);
  assert.equal(wrapped[1].parentId,'group1');
  const restored = ungroupCanvasComponent(wrapped,'group1');
  assert.equal(restored.length,1);
  assert.equal(restored[0].position?.x,32);
  assert.equal(restored[0].position?.y,64);
  assert.equal(restored[0].properties.value,'User customization');
});


test('multi-select alignment updates every selected unlocked component in one immutable result', () => {
  const components = [
    {id:'a',type:'Card',label:'A',visible:true,region:'main' as const,properties:{},position:{x:80,y:20,width:100,height:60}},
    {id:'b',type:'Card',label:'B',visible:true,region:'main' as const,properties:{},position:{x:220,y:90,width:200,height:80}},
    {id:'locked',type:'Card',label:'Locked',visible:true,region:'main' as const,properties:{canvasLocked:true},position:{x:60,y:40,width:120,height:60}},
    {id:'other',type:'Card',label:'Other',visible:true,region:'main' as const,properties:{},position:{x:30,y:10,width:80,height:40}}
  ];
  const aligned = alignCanvasComponents(components,['a','b','locked'],'x','center',{width:800,height:600});
  assert.equal(aligned[0].position?.x,350);
  assert.equal(aligned[1].position?.x,300);
  assert.equal(aligned[2].position?.x,60);
  assert.equal(aligned[3].position?.x,30);
  assert.notEqual(aligned,components);
  assert.equal(components[0].position?.x,80,'original component objects are not mutated');
});


test('Page Builder records and restores selection state with undo and redo', async () => {
  const source = await readFile(new URL('../src/core/builders/PageBuilder/pageBuilderView.tsx', import.meta.url), 'utf8');
  assert.match(source, /setSelectionUndoStack\(current =>/);
  assert.match(source, /selectionIds: \[\.\.\.selectionIds\]/);
  assert.match(source, /const snapshot = selectionRedoStack\[selectionRedoStack\.length - 1\]/);
  assert.match(source, /alignCanvasComponents\(page\.components/);
});

test('Free Canvas uses clean component objects and a compact icon-based palette', async () => {
  const source = await readFile(new URL('../src/core/builders/PageBuilder/pageBuilderView.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/core/builders/PageBuilder/styles-md227.css', import.meta.url), 'utf8');

  assert.match(source, /page\.layoutMode !== 'free-canvas' && <div className="record-component-head"/);
  assert.doesNotMatch(source, /Select a component to add it, or drag it onto the canvas\./);
  assert.doesNotMatch(source, /Free Canvas uses registered components from the shared library\./);
  assert.match(source, /component-card-icon" aria-hidden="true">\{renderPaletteIcon\(component\)\}/);
  assert.doesNotMatch(source, /renderPaletteComponentPreview/);
  assert.match(styles, /\.page-builder-layout\.canvas-unified-builder \.component-grid \{\s*display:flex;\s*flex-direction:column;/);
  assert.match(styles, /\.page-builder-layout\.canvas-unified-builder \.component-library-card \{\s*position:relative;\s*display:flex;\s*flex-direction:row;/);
});
