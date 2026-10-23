import assert from 'node:assert/strict';
import {test} from 'node:test';
import {startVisiblePolling,type PollingHost} from '../src/core/workspace/Refresh/visiblePolling.js';

function fixture(){
  let visible=true;
  const listeners=new Set<()=>void>();
  const timers=new Map<number,{callback:()=>void;delay:number}>();
  let id=0;
  const host:PollingHost={
    visible:()=>visible,
    subscribe:callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},
    schedule:(callback,delay)=>{timers.set(++id,{callback,delay});return id;},
    cancel:timer=>{timers.delete(timer as number);}
  };
  return {host,timers,listeners,
    visibility:(value:boolean)=>{visible=value;listeners.forEach(listener=>listener());},
    tick:()=>{const entry=timers.entries().next().value;assert.ok(entry);timers.delete(entry[0]);entry[1].callback();}
  };
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('slow reads complete before the next poll, so newly added records are delivered',async()=>{
  const f=fixture();
  const records=['old'];
  const displayed:string[][]=[];
  let complete:()=>void=()=>{};
  let calls=0;
  const stop=startVisiblePolling(async()=>{
    calls++;
    await new Promise<void>(resolve=>{complete=resolve;});
    displayed.push([...records]);
  },error=>{throw error;},5000,f.host);
  assert.equal(calls,1);
  assert.equal(f.timers.size,0,'no timer can supersede an unfinished request');
  records.push('new incoming message');
  f.visibility(true);
  f.visibility(true);
  assert.equal(calls,1,'return/online events coalesce during a read');
  complete();await settle();
  assert.deepEqual(displayed,[['old','new incoming message']]);
  assert.equal(f.timers.size,1);
  f.tick();
  assert.equal(calls,2);
  complete();await settle();
  assert.equal([...f.timers.values()][0].delay,5000);
  stop();
  assert.equal(f.timers.size,0);
  assert.equal(f.listeners.size,0);
});

test('polling pauses when hidden and refreshes immediately on return',async()=>{
  const f=fixture();let calls=0;
  const stop=startVisiblePolling(async()=>{calls++;},error=>{throw error;},5000,f.host);
  await settle();assert.equal(calls,1);assert.equal(f.timers.size,1);
  f.visibility(false);assert.equal(f.timers.size,0);
  f.visibility(true);assert.equal(calls,2);
  await settle();stop();
});

test('failures retry and disposal during a pending request never reschedules',async()=>{
  const f=fixture();const errors:unknown[]=[];let fail=true;
  let complete:()=>void=()=>{};
  const stop=startVisiblePolling(async()=>{
    if(fail){fail=false;throw new Error('temporary connection failure');}
    await new Promise<void>(resolve=>{complete=resolve;});
  },error=>{errors.push(error);},5000,f.host);
  await settle();assert.equal(errors.length,1);assert.equal(f.timers.size,1);
  f.tick();stop();complete();await settle();
  assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
