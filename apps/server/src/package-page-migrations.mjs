/** Generic, declarative page upgrades for trusted bundled app packages.
 * Migrations only modify components matching a package-supplied template.
 * Tenant overrides are preserved unless an exact legacy value is identified.
 */
export function upgradePackagedPageComponents(page, seeded, migration = {}) {
  const legacy = (migration.replaceLayouts ?? []).some(rule =>
    (page.components ?? []).length === 1 &&
    page.components[0].id === rule.id &&
    page.components[0].type === rule.type);
  if (legacy) return {upgradedComponents:structuredClone(seeded), migratedLayout:true};
  const templates = new Map(seeded.map(item => [item.id + '\u0000' + item.type, item]));
  let changed = false;
  const upgradedComponents = (page.components ?? []).map(component => {
    const template = templates.get(component.id + '\u0000' + component.type);
    if (!template) return component;
    const properties = component.properties ?? {};
    const next = {...properties};
    let repaired = false;
    for (const rule of migration.propertyRules ?? []) {
      if (rule.templateKey && !(rule.templateKey in (template.properties ?? {}))) continue;
      const actual = properties[rule.when.key];
      const matches = rule.when.mode === 'missing' ? !actual
        : rule.when.mode === 'equals' && actual === rule.when.value;
      if (!matches) continue;
      for (const copy of rule.copy ?? []) {
        const key = typeof copy === 'string' ? copy : copy.key;
        if (typeof copy !== 'string' && copy.ifEquals !== undefined &&
            properties[key] !== copy.ifEquals) continue;
        if (!Object.hasOwn(template.properties ?? {},key)) continue;
        next[key] = structuredClone(template.properties[key]);
        repaired = true;
      }
    }
    if (!repaired) return component;
    changed = true;
    return {...component,properties:next};
  });
  return {upgradedComponents:changed ? upgradedComponents : page.components ?? [],migratedLayout:false};
}
