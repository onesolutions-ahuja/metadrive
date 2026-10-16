import {upgradePackagedPageComponents,upgradePackagedFlow} from './package-page-migrations.mjs';
import {seedCredentialGrants} from './credential-grant-seeder.mjs';

/**
 * Install declarative business-app metadata through the shared AppExchange lifecycle.
 * No application-specific execution paths are permitted in the shared installer.
 * Existing tenant definitions and customisations are never overwritten.
 */
export function applyInstallableAppPackages(tenant, catalog, tenantId = '') {
  let next = retireUninstalledPackageMetadata(tenant, catalog);
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const packageKeyCounts = new Map();
  for (const pkg of packages) packageKeyCounts.set(pkg.appKey, (packageKeyCounts.get(pkg.appKey) ?? 0) + 1);
  for (const pkg of packages) {
    // Reject ambiguous catalog definitions without touching the tenant.
    if (!pkg.appKey || packageKeyCounts.get(pkg.appKey) !== 1) continue;
    const matchingInstallations = (next.records?.Connector_App__c ?? [])
      .filter(row => row.AppKey__c === pkg.appKey);
    // Ambiguous installation state never activates package metadata.
    const installed = matchingInstallations.length === 1 ? matchingInstallations[0] : undefined;
    // Installed business apps must expose editable metadata even before trial/licence activation.
    // Runtime usage and protected actions remain subject to normal entitlement/RBAC checks.
    if (!installed || installed.Installed__c !== true ||
      (!pkg.installation?.allowInstalledMetadataWithoutLicence && !['Trial','Licensed'].includes(installed.LicenceStatus__c))) continue;
    const chosenPage = pkg.installation?.defaultPageApiName;
    const chosenApp = pkg.installation?.defaultAppApiName;
    if (chosenPage && !(pkg.pages ?? []).some(page => page.apiName === chosenPage)) {
      throw Error('Package default page is not registered: ' + chosenPage);
    }
    if (chosenApp && !(pkg.apps ?? []).some(app => app.apiName === chosenApp)) {
      throw Error('Package default app is not registered: ' + chosenApp);
    }
    const objects = [...next.objects];
    const introducedObjects = new Set();
    const introducedFields = new Set();
    let changed = false;
    for (const candidate of [...(pkg.objects ?? []), ...(pkg.extendObjects ?? [])]) {
      const at = objects.findIndex(item => item.apiName === candidate.apiName);
      if (at < 0) {
        if (!candidate.label || !candidate.kind) throw Error('A new package object needs its complete metadata definition');
        objects.push(structuredClone(candidate));
        introducedObjects.add(candidate.apiName);
        for (const field of candidate.fields ?? []) introducedFields.add(candidate.apiName+'.'+field.apiName);
        changed = true;
      } else {
        const old = objects[at];
        const additions = (candidate.fields ?? []).filter(field =>
          !(old.fields ?? []).some(existing => existing.apiName === field.apiName));
        if (additions.length) {
          for (const field of additions) introducedFields.add(candidate.apiName+'.'+field.apiName);
          const initialPolicy = candidate.recordWritePolicy && !old.recordWritePolicy
            && additions.some(field => !candidate.recordWritePolicy.protectedFieldApiNames
              || candidate.recordWritePolicy.protectedFieldApiNames.includes(field.apiName));
          objects[at] = {...old, fields:[...old.fields,...structuredClone(additions)],
            ...(initialPolicy ? {recordWritePolicy:structuredClone(candidate.recordWritePolicy)} : {})};
          changed = true;
        }
      }
    }
    const mergeByApiName = (oldItems, newItems) => {
      const additions = (newItems ?? []).filter(item => !oldItems.some(old => old.apiName === item.apiName));
      if (additions.length) changed = true;
      return [...oldItems,...structuredClone(additions)];
    };
    const packagedFlowNames = new Set((pkg.flows ?? []).map(flow => flow.apiName));
    const flows = mergeByApiName(next.flows,pkg.flows).map(flow => {
      if (!packagedFlowNames.has(flow.apiName)) return flow;
      const upgraded = upgradePackagedFlow(flow,pkg.installation?.flowMigrations);
      if (upgraded !== flow) changed = true;
      return upgraded;
    });
    const apps = mergeByApiName(next.apps, pkg.apps).map(app => {
      const template = (pkg.apps ?? []).find(candidate => candidate.apiName === app.apiName);
      if (!template) return app;
      // Add package-provided pages without replacing tenant-owned navigation or order.
      const missing = (template.navigationPageApiNames ?? []).filter(name =>
        !(app.navigationPageApiNames ?? []).includes(name));
      if (!missing.length) return app;
      changed = true;
      const navigationOrder = [...(app.navigationOrder ?? [])];
      for (const apiName of missing) {
        if (!navigationOrder.some(item => item.type === 'Page' && item.apiName === apiName))
          navigationOrder.push({type:'Page',apiName});
      }
      return {...app,
        navigationPageApiNames:[...(app.navigationPageApiNames ?? []),...missing],
        navigationOrder};
    });
    const pages = mergeByApiName(next.pages, pkg.pages);
    // A package may introduce a new editable landing page. Move only its own
    // generated activation assignments; never touch tenant-authored assignments.
    const defaultPageApiName = pkg.installation?.defaultPageApiName;
    const defaultPage = pages.find(page => page.apiName === defaultPageApiName);
    if (defaultPageApiName && defaultPage?.pageType !== 'App Page') {
      const packageAssignmentIds = new Set((pkg.installation?.activationAssignments ?? []).map(rule => 'package-'+pkg.appKey+'-'+rule.idSuffix));
      for (let i=0;i<pages.length;i++) {
        if (pages[i].apiName === defaultPageApiName) continue;
        const original = pages[i].activationAssignments ?? [];
        const retained = original.filter(assignment=>!packageAssignmentIds.has(assignment.id));
        if (retained.length !== original.length) {
          pages[i] = {...pages[i],activationAssignments:retained};
          changed = true;
        }
      }
    }
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
            edit:Boolean(perms[object.apiName]?.create || perms[object.apiName]?.edit),
            ...(permissionTemplate.fieldPermissions?.[object.apiName+'.'+field.apiName] ?? {})
          }]))),
        appPermissions:Object.fromEntries((pkg.apps ?? []).map(app => [app.apiName,true])),
        tabPermissions:permissionTemplate.tabPermissions ?? {},
        navigationDefaultAccess:permissionTemplate.navigationDefaultAccess ?? 'Allow'
      }]};
      changed = true;
    }
    // Only grant initial access to metadata introduced by this installation.
    // Existing explicit grants and denies remain administrator-owned.
    if (permissionTemplate) {
      const index = accessControl.profiles.findIndex(profile => profile.id === permissionTemplate.id);
      if (index !== -1) {
        const profile = accessControl.profiles[index];
        const objectPermissions = {...profile.objectPermissions};
        const fieldPermissions = {...profile.fieldPermissions};
        let updated = false;
        for (const [name, rights] of Object.entries(permissionTemplate.objectPermissions ?? {})) {
          if (introducedObjects.has(name) && !Object.hasOwn(objectPermissions,name)) {
            objectPermissions[name] = {read:false,create:false,edit:false,delete:false,viewAll:false,modifyAll:false,...rights};
            updated = true;
          }
        }
        for (const key of introducedFields) {
          if (Object.hasOwn(fieldPermissions,key)) continue;
          const name = key.slice(0,key.indexOf('.'));
          const rights = objectPermissions[name];
          if (!rights) continue;
          fieldPermissions[key] = {
            read:Boolean(rights.read || rights.viewAll || rights.modifyAll),
            edit:Boolean(rights.create || rights.edit || rights.modifyAll),
            ...(permissionTemplate.fieldPermissions?.[key] ?? {})
          };
          updated = true;
        }
        if (updated) {
          const profiles = [...accessControl.profiles];
          profiles[index] = {...profile,objectPermissions,fieldPermissions};
          accessControl = {...accessControl,profiles};
          changed = true;
        }
      }
    }
    // Package metadata may enable installation of additional object fields
    // after administrator provisioning. Grant only previously absent
    // permissions, never overwrite an explicit deny or tenant-customized grant.
    if (pkg.installation?.repairMissingAdministratorPermissions === true) {
      const adminIndex = accessControl.profiles.findIndex(profile => profile.id === 'system-administrator');
      if (adminIndex !== -1) {
        const administrator = accessControl.profiles[adminIndex];
        const objectPermissions = {...(administrator.objectPermissions ?? {})};
        const fieldPermissions = {...(administrator.fieldPermissions ?? {})};
        let repaired = false;
        const required = pkg.installation?.administratorObjectPermissions ?? pkg.profile?.objectPermissions ?? {};
        for (const [objectApiName, templateRights] of Object.entries(required)) {
          const object = objects.find(candidate => candidate.apiName === objectApiName);
          if (!object) continue;
          const permission = objectPermissions[objectApiName];
          // Existing tenant permission settings (including denies) are authoritative.
          if (!permission) {
            objectPermissions[objectApiName] = {
              read: Boolean(templateRights.read), create: Boolean(templateRights.create),
              edit: Boolean(templateRights.edit), delete: Boolean(templateRights.delete),
              viewAll: Boolean(templateRights.viewAll), modifyAll: Boolean(templateRights.modifyAll)
            };
            repaired = true;
          }
          const effective = objectPermissions[objectApiName];
          for (const field of object.fields ?? []) {
            const key = objectApiName + '.' + field.apiName;
            if (Object.hasOwn(fieldPermissions, key)) continue;
            fieldPermissions[key] = {
              read: Boolean(effective.read || effective.viewAll || effective.modifyAll),
              edit: Boolean(effective.create || effective.edit || effective.modifyAll)
            };
            repaired = true;
          }
        }
        if (repaired) {
          const profiles = [...accessControl.profiles];
          profiles[adminIndex] = {...administrator,objectPermissions,fieldPermissions};
          accessControl = {...accessControl,profiles};
          changed = true;
        }
      }
    }
    // Every package page is upgraded by the same metadata-driven migration engine.
    // Only package-generated assignments are movable; tenant assignments remain.
    for (const templatePage of pkg.pages ?? []) {
      const at = pages.findIndex(page => page.apiName === templatePage.apiName);
      if (at < 0) continue;
      const page = pages[at];
      const {upgradedComponents,migratedLayout} =
        upgradePackagedPageComponents(page,templatePage.components ?? [],pkg.installation?.pageMigration);
      const assignments = [...(page.activationAssignments ?? [])];
      if (templatePage.apiName === defaultPageApiName) {
        const appId = pkg.installation?.defaultAppApiName;
        if (appId && !(pkg.apps ?? []).some(app => app.apiName === appId)) {
          throw Error('Package default application is not registered: ' + appId);
        }
        for (const rule of pkg.installation?.activationAssignments ?? []) {
          if (!appId) break;
          const assignment = {
            id:'package-'+pkg.appKey+'-'+rule.idSuffix,
            scope:rule.scope,appId,profileId:rule.profileId ?? null,
            recordTypeId:null,formFactors:rule.formFactors ?? ['Desktop','Phone']
          };
          const exists = assignments.some(existing =>
            existing.id === assignment.id ||
            (existing.appId === appId && existing.scope === rule.scope &&
              (rule.scope === 'App Default' || existing.profileId === assignment.profileId)));
          if (!exists) assignments.push(assignment);
        }
      }
      if (assignments.length !== (page.activationAssignments ?? []).length ||
          migratedLayout || upgradedComponents.some((item,index) => item !== page.components[index])) {
        pages[at] = {...page,activationAssignments:assignments,components:upgradedComponents};
        changed = true;
      }
    }
    // Package demo data lives in ordinary tenant records, never inside the React UI.
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
    const provisioned = seedCredentialGrants(
      {...next,objects,records,accessControl}, pkg.installation?.credentialGrantSeeds, tenantId);
    if (provisioned.records !== records) {
      records = provisioned.records;
      changed = true;
    }
    if (changed) next = {...next,objects,flows,apps,pages,records,accessControl};
  }
  return next;
}
/** Retire a packaged app's generated metadata exactly once, only while its old
 * Connector App installation record exists and no current package reuses its key.
 * All business Objects and their records remain untouched. */
export function retireUninstalledPackageMetadata(tenant, catalog) {
  const activeKeys = new Set((catalog?.packages ?? []).map(pkg => pkg.appKey));
  const rows = tenant.records?.Connector_App__c ?? [];
  const retired = (catalog?.retiredPackages ?? []).filter(pkg =>
    !activeKeys.has(pkg.appKey) && rows.some(row => row.AppKey__c === pkg.appKey));
  if (!retired.length) return tenant;
  const appKeys = new Set(retired.map(pkg => pkg.appKey));
  const apps = new Set(retired.flatMap(pkg => pkg.apps ?? []));
  const pages = new Set(retired.flatMap(pkg => pkg.pages ?? []));
  const flows = new Set(retired.flatMap(pkg => pkg.flows ?? []));
  const keepNavigation = app => ({
    ...app,
    navigationItems: (app.navigationItems ?? []).filter(name => !pages.has(name)),
    navigationPageApiNames: (app.navigationPageApiNames ?? []).filter(name => !pages.has(name)),
    navigationOrder: (app.navigationOrder ?? []).filter(item =>
      !((item.type === 'Page' || item.type === 'App Page') && pages.has(item.apiName)))
  });
  const stripAppGrants = item => ({
    ...item,
    appPermissions: Object.fromEntries(Object.entries(item.appPermissions ?? {})
      .filter(([name]) => !apps.has(name)))
  });
  return {
    ...tenant,
    apps: (tenant.apps ?? []).filter(app => !apps.has(app.apiName)).map(keepNavigation),
    pages: (tenant.pages ?? []).filter(page => !pages.has(page.apiName))
      .map(page => ({
        ...page,
        activationAssignments: (page.activationAssignments ?? [])
          .filter(rule => !apps.has(rule.appId))
      })),
    flows: (tenant.flows ?? []).filter(flow => !flows.has(flow.apiName)),
    accessControl: {
      ...tenant.accessControl,
      profiles: (tenant.accessControl?.profiles ?? []).map(stripAppGrants),
      permissionSets: (tenant.accessControl?.permissionSets ?? []).map(stripAppGrants)
    },
    records: {...tenant.records, Connector_App__c: rows.filter(row => !appKeys.has(row.AppKey__c))}
  };
}

/** Repair exact signed historical record IDs before strict snapshot parsing. */
export function repairHistoricPackageRecordAudits(raw, catalog) {
  if (!raw || typeof raw !== 'object') return false;
  let changed = false;
  const now = new Date().toISOString();
  for (const pkg of catalog?.retiredPackages ?? []) {
    for (const [objectName, ids] of Object.entries(pkg.auditRecordIds ?? {})) {
      const allowed = new Set(Array.isArray(ids) ? ids : []);
      for (const tenant of Object.values(raw.tenants ?? {})) {
        for (const record of tenant?.records?.[objectName] ?? []) {
          if (!allowed.has(record?.Id)) continue;
          if (!record.CreatedDate) { record.CreatedDate = now; changed = true; }
          if (!record.LastModifiedDate) { record.LastModifiedDate = now; changed = true; }
        }
      }
    }
  }
  return changed;
}

/** Repair only generated package assignments that conflict with App Page navigation rules. */
export function repairPackagedAppPageAssignments(raw, catalog) {
  if (!raw || typeof raw !== 'object' || !raw.tenants || typeof raw.tenants !== 'object') return false;
  const generated = new Map();
  const generatedPrefixes = [];
  for (const pkg of catalog?.packages ?? []) {
    const appId = pkg.installation?.defaultAppApiName;
    if (!appId) continue;
    const appPageNames = [];
    for (const page of pkg.pages ?? []) {
      if (page.pageType !== 'App Page') continue;
      appPageNames.push(page.apiName);
      for (const assignment of page.activationAssignments ?? []) {
        if (typeof assignment.id === 'string' && assignment.appId === appId) {
          generated.set(assignment.id, {appId, pageApiName:page.apiName});
        }
      }
    }
    if (appPageNames.length) generatedPrefixes.push({
      prefix:'package-'+pkg.appKey+'-',appId,pageApiNames:new Set(appPageNames)
    });
    const defaultPage = (pkg.pages ?? []).find(page =>
      page.apiName === pkg.installation?.defaultPageApiName && page.pageType === 'App Page');
    if (defaultPage) {
      for (const rule of pkg.installation?.activationAssignments ?? []) {
        if (typeof rule.idSuffix === 'string') generated.set(
          'package-'+pkg.appKey+'-'+rule.idSuffix,
          {appId, pageApiName:defaultPage.apiName}
        );
      }
    }
  }
  let changed = false;
  for (const tenant of Object.values(raw.tenants)) {
    if (!tenant || typeof tenant !== 'object' || !Array.isArray(tenant.pages)) continue;
    for (const page of tenant.pages) {
      if (page?.pageType !== 'App Page' || !Array.isArray(page.activationAssignments)) continue;
      const retained = page.activationAssignments.filter(assignment => {
        let definition = generated.get(assignment?.id);
        if (!definition) {
          definition = generatedPrefixes.find(candidate =>
            assignment?.id?.startsWith(candidate.prefix)
            && candidate.appId === assignment.appId
            && candidate.pageApiNames.has(page.apiName)
          );
        }
        if (!definition || definition.appId !== assignment.appId
          || (definition.pageApiName && definition.pageApiName !== page.apiName)) return true;
        const app = tenant.apps?.find(item => item.apiName === definition.appId);
        const isNavigable = (app?.navigationOrder ?? []).some(item =>
          item.type === 'App Page' && item.apiName === page.apiName)
          || (app?.navigationPageApiNames ?? []).includes(page.apiName)
          || (app?.navigationItems ?? []).includes(page.apiName);
        if (!isNavigable) return true;
        changed = true;
        return false;
      });
      if (retained.length !== page.activationAssignments.length) page.activationAssignments = retained;
    }
  }
  return changed;
}
