export function parseSubflowMappings(value: unknown, elementLabel: string, mappingType: 'input' | 'output'): Array<{ source: string; target: string }> {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') throw new Error(`Subflow "${elementLabel}" ${mappingType} mappings must be text assignments.`);
  const mappings: Array<{ source: string; target: string }> = [];
  const sources = new Set<string>();
  for (const entry of value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error(`Subflow "${elementLabel}" has an invalid ${mappingType} assignment "${entry}".`);
    const source = entry.slice(0, separator).trim();
    const target = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(source) || !target) {
      throw new Error(`Subflow "${elementLabel}" has an invalid ${mappingType} assignment "${entry}".`);
    }
    if (sources.has(source)) throw new Error(`Subflow "${elementLabel}" maps "${source}" more than once.`);
    sources.add(source);
    mappings.push({ source, target });
  }
  return mappings;
}
