import {readFileSync} from 'node:fs';

// Core definitions are templates only. Optional business objects are not
// installed into every tenant merely because they exist in this catalog.
export function coreSeedDefinitions() {
  const metadata = JSON.parse(readFileSync(new URL('../../data/platform-metadata.json',import.meta.url),'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../../../web/src/custom-components/manifest.json',import.meta.url),'utf8'));
  const {users: _legacySampleUsers, ...accessTemplates}=metadata.accessControl??{};
  return {
    objectDefinitions: structuredClone(metadata.objects ?? []),
    flowDefinitions: structuredClone(metadata.flows ?? []),
    pageDefinitions: structuredClone(metadata.pages ?? []),
    accessControlTemplates: structuredClone(accessTemplates),
    sharedComponents: structuredClone(manifest.filter(c=>c.scope==='platform'))
  };
}
