// Stable public entrypoint for lossless state projection and restoration.
import {createHash} from 'node:crypto';
import {projectState} from './platform-state-project.mjs';
import {restoreState} from './platform-state-restore.mjs';
export {projectState,restoreState};
function fail(message) { throw new Error('MetaDrive relational projection: ' + message); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
export function stateDigest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function verifyProjection(state,rows=projectState(state)) {
  const expected=stateDigest(state);
  const actual=stateDigest(restoreState(rows));
  if (actual!==expected) fail('round-trip mismatch: expected '+expected+' but reconstructed '+actual);
  return {digest:expected,counts:Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,value.length]))};
}
