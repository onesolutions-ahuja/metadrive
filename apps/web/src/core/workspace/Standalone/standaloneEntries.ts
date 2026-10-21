import {ACETILL_STANDALONE_ENTRY} from '../../../../../acetill/src/standalone-entry';
import {ACEASSIST_STANDALONE_ENTRY} from '../../../../../aceassist/src/standalone-entry';

/** Presentation-only route declarations from independently owned app packages. */
const entries=[ACETILL_STANDALONE_ENTRY,ACEASSIST_STANDALONE_ENTRY] as const;
export type StandaloneEntry=(typeof entries)[number];

/** Accept only registered product root paths. No generic /slug bypass or setup redirect. */
export function resolveStandaloneEntry(pathname:string,basePath=''):StandaloneEntry|null {
  const base=basePath.replace(/\/$/,'');
  const local=base && pathname.startsWith(base+'/')?pathname.slice(base.length):pathname;
  const match=/^\/([a-z][a-z0-9]*?)\/?$/.exec(local);
  return match?entries.find(e=>e.slug===match[1])??null:null;
}
