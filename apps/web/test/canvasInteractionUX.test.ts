import assert from 'node:assert/strict';
import test from 'node:test';
import { snapCanvasPosition, snapCanvasSize, wrapCanvasComponent, ungroupCanvasComponent } from '../src/core/builders/PageBuilder/canvasInteractions';

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
