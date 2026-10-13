/**
 * Install declarative business-app metadata through the shared AppExchange lifecycle.
 * Neither this primitive nor Object/Flow execution contains kiosk-specific logic.
 * Existing tenant definitions and customisations are never overwritten.
 */
export function applyInstallableAppPackages(tenant, catalog) {
  let next = tenant;
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  for (const pkg of packages) {
    const installed = (next.records?.Connector_App__c ?? []).find(row => row.AppKey__c === pkg.appKey);
    // Installed business apps must expose editable metadata even before trial/licence activation.
    // Runtime usage and protected actions remain subject to normal entitlement/RBAC checks.
    if (!installed || installed.Installed__c !== true ||
      (pkg.appKey !== 'pos' && !['Trial','Licensed'].includes(installed.LicenceStatus__c))) continue;
    const objects = [...next.objects];
    let changed = false;
    for (const candidate of [...(pkg.objects ?? []), ...(pkg.extendObjects ?? [])]) {
      const at = objects.findIndex(item => item.apiName === candidate.apiName);
      if (at < 0) {
        if (!candidate.label || !candidate.kind) throw Error('A new package object needs its complete metadata definition');
        objects.push(structuredClone(candidate));
        changed = true;
      } else {
        const old = objects[at];
        const additions = (candidate.fields ?? []).filter(field =>
          !(old.fields ?? []).some(existing => existing.apiName === field.apiName));
        if (additions.length) {
          objects[at] = {...old, fields:[...old.fields,...structuredClone(additions)]};
          changed = true;
        }
      }
    }
    const mergeByApiName = (oldItems, newItems) => {
      const additions = (newItems ?? []).filter(item => !oldItems.some(old => old.apiName === item.apiName));
      if (additions.length) changed = true;
      return [...oldItems,...structuredClone(additions)];
    };
    const flows = mergeByApiName(next.flows, pkg.flows).map(flow => {
      if (!(pkg.flows ?? []).some(item => item.apiName === flow.apiName)) return flow;
      let fixed = false;
      const elements = (flow.elements ?? []).map(element => {
        if (element.type !== 'Decision' || (element.config?.outcomes ?? []).some(o => o.name === 'Default')) return element;
        const linked = (flow.connectors ?? []).filter(c => c.from === element.id && c.kind === 'normal' && c.label?.trim().toLowerCase() === 'default outcome');
        if (linked.length !== 1) return element;
        fixed = true;
        return {...element, config:{...element.config,outcomes:[...(element.config?.outcomes ?? []),{name:'Default',label:'Default Outcome',conditions:[]}]}};
      });
      if (fixed) changed = true;
      return fixed ? {...flow,elements} : flow;
    });
    const apps = mergeByApiName(next.apps, pkg.apps);
    const pages = mergeByApiName(next.pages, pkg.pages);
    const permissionTemplate = pkg.profile;
    let accessControl = next.accessControl;
    if (permissionTemplate && !accessControl.profiles.some(p => p.id === permissionTemplate.id)) {
      const standard = accessControl.profiles.find(p=>p.id === 'standard-user')
        ?? accessControl.profiles.find(p=>p.id !== 'system-administrator');
      if (!standard) throw Error('No assignable profile is available for app installation');
      const perms = {};
      for (const [name, rights] of Object.entries(permissionTemplate.objectPermissions ?? {})) {
        perms[name] = {read:false,create:false,edit:false,delete:false,viewAll:false,modifyAll:false,...rights};
      }
      accessControl = {...accessControl,profiles:[...accessControl.profiles,{
        ...structuredClone(standard),
        id:permissionTemplate.id,label:permissionTemplate.label,
        apiName:permissionTemplate.apiName,
        isStandard:false,
        systemPermissions:[...(permissionTemplate.systemPermissions ?? [])],
        objectPermissions:perms,
        fieldPermissions: Object.fromEntries(objects.flatMap(object=>
          object.fields.map(field=>[object.apiName+'.'+field.apiName,{
            read:Boolean(perms[object.apiName]?.read),
            edit:Boolean(perms[object.apiName]?.create || perms[object.apiName]?.edit)
          }]))),
        appPermissions:{[pkg.apps?.[0]?.apiName]:true},
        tabPermissions:permissionTemplate.tabPermissions ?? {},
        navigationDefaultAccess:permissionTemplate.navigationDefaultAccess ?? 'Allow'
      }]};
      changed = true;
    }
    const appId = pkg.apps?.[0]?.apiName;
    const profileId = pkg.profile?.id;
    if (appId && profileId) {
      const index = pages.findIndex(page=>page.apiName === pkg.pages?.[0]?.apiName);
      if (index !== -1) {
        const page = pages[index];
        const exists = (page.activationAssignments ?? []).some(a => a.appId === appId && a.profileId === profileId);
        const assignments = [...(page.activationAssignments ?? [])];
        if (!exists) {
          assignments.push({
            id:'package-'+pkg.appKey+'-home',
            scope:'App and Profile',appId,profileId,recordTypeId:null,formFactors:['Desktop','Phone']
          });
        }
        // App default also allows an authorised tenant admin to preview the
        // kiosk in a separate popup without changing their own login.
        if (!(assignments.some(a=>a.appId===appId && a.scope==='App Default'))) {
          assignments.push({
            id:'package-'+pkg.appKey+'-app-default',scope:'App Default',
            appId,profileId:null,recordTypeId:null,formFactors:['Desktop','Phone']
          });
        }
        // Upgrade only a package-owned, unchanged legacy accent to the
        // revised kiosk visual preset. Customised tenant colors stay intact.
        const seeded = pkg.pages?.[0]?.components ?? [];
        // Migrate only the exact legacy single-component POS page. Do not
        // replace tenant-authored multi-layer pages or later customizations.
        if (pkg.appKey === 'pos' && (page.components ?? []).length === 1
            && page.components[0].id === 'pos-sales-workspace'
            && page.components[0].type === 'Custom:TillSalesWorkspace') {
          pages[index] = {...page,activationAssignments:assignments,
            components:structuredClone(seeded)};
          changed = true;
          continue;
        }
        const upgradedComponents = (page.components ?? []).map(component => {
          const template = seeded.find(item => item.id === component.id && item.type === component.type);
          if (!template) return component;
          const missingCategories = template.properties?.categoryObjectApiName &&
            !component.properties?.categoryObjectApiName;
          const legacyAccent = component.properties?.accentColor === '#ffca26'
            && template.properties?.accentColor !== '#ffca26';
          const missingWelcome = template.properties?.welcomeImage && !component.properties?.welcomeImage;
          if (!missingCategories && !legacyAccent && !missingWelcome) return component;
          return { ...component, properties: {
            ...component.properties,
            ...(missingWelcome ? { welcomeImage: template.properties.welcomeImage, labels: template.properties.labels } : {}),
            ...(missingCategories ? {
              categoryObjectApiName: template.properties.categoryObjectApiName,
              categoryNameField: template.properties.categoryNameField
            } : {}),
            ...(legacyAccent ? {
              accentColor: template.properties.accentColor,
              ...(component.properties.inkColor === '#202124' ? { inkColor: template.properties.inkColor } : {})
            } : {})
          } };
        });
        if (assignments.length !== (page.activationAssignments ?? []).length ||
          upgradedComponents.some((item, at) => item !== page.components[at])) {
          pages[index] = {...page,activationAssignments:assignments,components:upgradedComponents};
          changed = true;
        }
      }
    }
    // Sample menu lives in ordinary tenant records, never inside the React UI.
    // Only seed an empty object collection; never replace customer records.
    let records = next.records;
    for (const [objectName, examples] of Object.entries(pkg.demoRecords ?? {})) {
      if (!objects.some(item => item.apiName === objectName)) continue;
      const existing = records[objectName] ?? [];
      const exampleIds = new Set(examples.map(item => item.Id));
      const stamp = new Date().toISOString();
      const repaired = existing.map(item => exampleIds.has(item.Id) && (!item.CreatedDate || !item.LastModifiedDate)
        ? { ...item, CreatedDate: item.CreatedDate || stamp, LastModifiedDate: item.LastModifiedDate || stamp }
        : item);
      const additions = existing.length ? [] : examples.map(item => ({
        ...structuredClone(item), CreatedDate: item.CreatedDate || stamp, LastModifiedDate: item.LastModifiedDate || stamp
      }));
      if (additions.length || repaired.some((item, index) => item !== existing[index])) {
        records = { ...records, [objectName]: [...repaired, ...additions] };
        changed = true;
      }
    }
    if (changed) next = {...next,objects,flows,apps,pages,records,accessControl};
  }
  return next;
}
