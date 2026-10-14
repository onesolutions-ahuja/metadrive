/** Shared object metadata structural checks and dependency graph. */
import type { ObjectMetadata, TenantData, FlowMetadata } from '../../index.js';
export function validateObjectRelationships(object: ObjectMetadata, knownObjects: ObjectMetadata[]): string | null {
  const masterDetails = object.fields.filter((field) => field.relationship?.type === 'Master-Detail');
  if (masterDetails.length > 2) return 'An object can have at most two master-detail relationships';
  if (masterDetails.length && object.kind !== 'Custom Object') return 'Master-detail relationship fields can only be created on custom objects';
  const hierarchicalRelationships = object.fields.filter((field) => field.relationship?.type === 'Hierarchical');
  if (hierarchicalRelationships.length > 1) return 'The User object can have at most one hierarchical relationship';
  if (hierarchicalRelationships.length && object.apiName !== 'User') return 'Hierarchical relationships can only be created on the User object';
  const relationshipNames = new Set<string>();
  const childRelationshipNames = new Set<string>();
  for (const field of object.fields) {
    if (!field.relationship) continue;
    if (!knownObjects.some((candidate) => candidate.apiName === field.relationship?.targetObject)) {
      return `Relationship target "${field.relationship.targetObject}" does not exist`;
    }
    if (field.relationship.type === 'Hierarchical' && field.relationship.targetObject !== 'User') {
      return 'Hierarchical relationships must reference the User object';
    }
    if (field.relationship.type === 'Master-Detail' && field.relationship.targetObject === object.apiName) {
      return 'An object cannot be its own master-detail parent';
    }
    const relationshipName = field.relationship.relationshipName.toLowerCase();
    if (relationshipNames.has(relationshipName)) return `Relationship name "${field.relationship.relationshipName}" is already in use on "${object.apiName}"`;
    relationshipNames.add(relationshipName);
    const childRelationshipName = `${field.relationship.targetObject}:${field.relationship.childRelationshipName.toLowerCase()}`;
    if (childRelationshipNames.has(childRelationshipName)) return `Child relationship name "${field.relationship.childRelationshipName}" is already in use on "${field.relationship.targetObject}"`;
    childRelationshipNames.add(childRelationshipName);
  }
  return null;
}

export function validateRelatedLookupFilters(object: ObjectMetadata, knownObjects: ObjectMetadata[]): string | null {
  for (const filter of object.relatedLookupFilters ?? []) {
    const lookupField = object.fields.find((field) => field.apiName === filter.fieldApiName);
    if (!lookupField?.relationship) {
      return `Related lookup filter "${filter.id}" must use a relationship field on "${object.apiName}"`;
    }
    if (lookupField.relationship.targetObject !== filter.relatedObject) {
      return `Related lookup filter "${filter.id}" must target "${lookupField.relationship.targetObject}"`;
    }
    const relatedObject = knownObjects.find((candidate) => candidate.apiName === filter.relatedObject);
    if (!relatedObject) return `Related lookup filter "${filter.id}" references unknown object "${filter.relatedObject}"`;
    if (!relatedObject.fields.some((field) => field.apiName === filter.relatedFieldApiName)) {
      return `Related lookup filter "${filter.id}" references unknown field "${filter.relatedFieldApiName}" on "${filter.relatedObject}"`;
    }
    const relatedField = relatedObject.fields.find((field) => field.apiName === filter.relatedFieldApiName)!;
    const category = (field: ObjectMetadata['fields'][number]): 'text' | 'number' | 'date' | 'boolean' | 'other' => {
      const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
      if (['Text', 'Long Text Area', 'Email', 'Phone', 'URL', 'Picklist', 'Multi-Select Picklist', 'Name', 'AutoNumber', 'Auto Number'].includes(type)) return 'text';
      if (['Number', 'Currency', 'Percent'].includes(type)) return 'number';
      if (['Date', 'Date/Time', 'DateTime'].includes(type)) return 'date';
      if (type === 'Checkbox') return 'boolean';
      return 'other';
    };
    const relatedCategory = category(relatedField);
    if (['Contains', 'Starts With'].includes(filter.operator) && relatedCategory !== 'text') {
      return `Related lookup filter "${filter.id}" uses ${filter.operator} with a non-text field`;
    }
    if (['Greater Than', 'Less Than'].includes(filter.operator) && !['number', 'date'].includes(relatedCategory)) {
      return `Related lookup filter "${filter.id}" uses ${filter.operator} with an unsupported field type`;
    }
    if (filter.valueFieldApiName) {
      const sourceField = object.fields.find((field) => field.apiName === filter.valueFieldApiName);
      if (!sourceField) {
        return `Related lookup filter "${filter.id}" references unknown field "${filter.valueFieldApiName}" on "${object.apiName}"`;
      }
      if (category(sourceField) !== relatedCategory) {
        return `Related lookup filter "${filter.id}" compares incompatible field types`;
      }
    } else if (['Greater Than', 'Less Than'].includes(filter.operator)) {
      if (relatedCategory === 'number' && !Number.isFinite(Number(filter.value))) {
        return `Related lookup filter "${filter.id}" requires a numeric comparison value`;
      }
      if (relatedCategory === 'date' && !Number.isFinite(Date.parse(filter.value))) {
        return `Related lookup filter "${filter.id}" requires a valid date comparison value`;
      }
    }
  }
  return null;
}

export function validateRelatedLists(object: ObjectMetadata, knownObjects: ObjectMetadata[], current?: ObjectMetadata): string | null {
  const allowedNames = new Set(knownObjects.flatMap((childObject) => childObject.fields.flatMap((field) =>
    field.relationship?.targetObject === object.apiName
      ? [field.relationship.childRelationshipName, childObject.pluralLabel]
      : []
  ).map((name) => name.toLocaleLowerCase())));
  for (const layout of object.pageLayouts ?? []) {
    const existing = current?.pageLayouts?.find((item) => item.id === layout.id)?.relatedLists ?? [];
    const invalid = layout.relatedLists.find((name) =>
      !allowedNames.has(name.toLocaleLowerCase()) && !existing.includes(name));
    if (invalid) return `Related list "${invalid}" is not a relationship on "${object.label}"`;
  }
  return null;
}

export function containsFieldReference(value: unknown, apiName: string): boolean {
  if (typeof value === 'string') {
    const escapedName = apiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_])${escapedName}($|[^A-Za-z0-9_])`).test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsFieldReference(item, apiName));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsFieldReference(item, apiName));
  return false;
}

export function flowUsesObject(flow: FlowMetadata, objectApiName: string): boolean {
  return flow.triggerObject === objectApiName
    || containsFieldReference(flow.startConfig, objectApiName)
    || flow.elements.some((element) =>
      element.config.object === objectApiName || element.config.objectApiName === objectApiName)
    || flow.resources.some((resource) => resource.dataType === objectApiName);
}

export function findFieldDependencies(tenant: TenantData, objectApiName: string, fieldApiName: string): string[] {
  const dependencies: string[] = [];
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (object) {
    if (object.pageLayouts?.some((layout) => layout.sections.some((section) => section.fieldApiNames.includes(fieldApiName)))) dependencies.push('a page layout');
    if (object.actions?.some((action) => action.fieldApiName === fieldApiName)) dependencies.push('a custom object action');
    if (object.compactLayout?.fieldApiNames.includes(fieldApiName)
      || object.compactLayouts?.some((layout) => layout.fieldApiNames.includes(fieldApiName))) dependencies.push('a compact layout');
    if (object.fieldSets?.some((fieldSet) => fieldSet.fieldApiNames.includes(fieldApiName))) dependencies.push('a field set');
    if (Object.values(object.searchLayouts ?? {}).some((fields) => fields.includes(fieldApiName))) dependencies.push('a search layout');
    if (object.fields.some((field) => field.apiName !== fieldApiName && field.formula && containsFieldReference(field.formula.expression, fieldApiName))) {
      dependencies.push('a formula field');
    }
    if (object.fields.some((field) => field.apiName !== fieldApiName && field.controllerFieldApiName === fieldApiName)) {
      dependencies.push('a dependent picklist');
    }
    if (object.recordTypes?.some((recordType) => Object.hasOwn(recordType.picklistValues ?? {}, fieldApiName))) {
      dependencies.push('record type picklist settings');
    }
    const relationshipField = object.fields.find((field) => field.apiName === fieldApiName && field.relationship);
    const relationship = relationshipField?.relationship;
    if (relationship && tenant.objects.some((candidate) =>
      candidate.apiName === relationship.targetObject
      && candidate.pageLayouts?.some((layout) => layout.relatedLists.includes(relationship.childRelationshipName)))) {
      dependencies.push('a related list on a page layout');
    }
  }
  for (const candidate of tenant.objects) {
    if (candidate.relatedLookupFilters?.some((filter) =>
      (candidate.apiName === objectApiName && filter.fieldApiName === fieldApiName)
      || (candidate.apiName === objectApiName && filter.valueFieldApiName === fieldApiName)
      || (filter.relatedObject === objectApiName && filter.relatedFieldApiName === fieldApiName))) {
      dependencies.push(`a related lookup filter on ${candidate.label}`);
    }
  }
  for (const flow of tenant.flows) {
    const flowConfigs = flow.elements.map((element) => element.config);
    if (flowUsesObject(flow, objectApiName)
      && containsFieldReference([flow.startConfig, flowConfigs, flow.resources, flow.versions], fieldApiName)) {
      dependencies.push(`flow ${flow.label}`);
    }
  }
  for (const page of tenant.pages) {
    if (page.targetObject === objectApiName && page.components.some((component) => containsFieldReference(component.properties, fieldApiName))) {
      dependencies.push(`Lightning page ${page.label}`);
    }
  }
  for (const report of tenant.reports) {
    const referencesBaseField = report.objectApiName === objectApiName && (
      report.fieldApiNames.includes(fieldApiName)
      || report.groupByFieldApiNames.includes(fieldApiName)
      || report.columnGroupByFieldApiName === fieldApiName
      || report.sortFieldApiName === fieldApiName
      || report.rowLimit.sortFieldApiName === fieldApiName
      || report.filters.some((filter) => filter.fieldApiName === fieldApiName)
      || report.standardFilters.dateFieldApiName === fieldApiName
    );
    const referencesCrossFilterField = report.crossFilters.some((crossFilter) =>
      crossFilter.childObjectApiName === objectApiName
      && crossFilter.filters.some((filter) => filter.fieldApiName === fieldApiName));
    const usesCrossFilterRelationship = report.crossFilters.some((crossFilter) =>
      crossFilter.childObjectApiName === objectApiName
      && object?.fields.some((field) => field.apiName === fieldApiName
        && field.relationship?.targetObject === report.objectApiName));
    if (referencesBaseField || referencesCrossFilterField || usesCrossFilterRelationship) {
      dependencies.push(`report ${report.label}`);
    }
  }
  for (const dashboard of tenant.dashboards) {
    const referencesFilter = dashboard.filters.some((filter) =>
      filter.objectApiName === objectApiName && filter.fieldApiName === fieldApiName);
    const referencesComponent = dashboard.components.some((component) =>
      component.objectApiName === objectApiName
      && (component.measureFieldApiName === fieldApiName
        || component.groupByFieldApiName === fieldApiName
        || component.xAxisFieldApiName === fieldApiName
        || component.displayFieldApiNames.includes(fieldApiName)
        || containsFieldReference(component.properties, fieldApiName)));
    if (referencesFilter || referencesComponent) dependencies.push(`dashboard ${dashboard.label}`);
  }
  return [...new Set(dependencies)];
}

export function findObjectDependencies(tenant: TenantData, objectApiName: string): string[] {
  const dependencies: string[] = [];
  const add = (description: string) => {
    if (!dependencies.includes(description)) dependencies.push(description);
  };
  for (const candidate of tenant.objects) {
    if (candidate.apiName !== objectApiName && candidate.fields.some((field) =>
      field.relationship?.targetObject === objectApiName)) {
      const fields = candidate.fields
        .filter((field) => field.relationship?.targetObject === objectApiName)
        .map((field) => field.apiName);
      add(`relationship field${fields.length === 1 ? '' : 's'} ${fields.join(', ')} on ${candidate.label}`);
    }
    if (candidate.apiName !== objectApiName && candidate.relatedLookupFilters?.some((filter) =>
      filter.relatedObject === objectApiName)) {
      add(`related lookup filter on ${candidate.label}`);
    }
    if (candidate.apiName !== objectApiName && candidate.pageLayouts?.some((layout) =>
      layout.relatedLists.some((relatedList) => tenant.objects
        .find((child) => child.apiName === objectApiName)?.fields.some((field) =>
          field.relationship?.targetObject === candidate.apiName
          && field.relationship.childRelationshipName === relatedList)))) {
      add(`related list on ${candidate.label}`);
    }
  }
  for (const app of tenant.apps ?? []) {
    if (app.navigationItems.includes(objectApiName)) add(`Lightning app ${app.label} navigation`);
  }
  for (const flow of tenant.flows) {
    if (flowUsesObject(flow, objectApiName)
      || containsFieldReference([flow.startConfig, flow.elements.map((element) => element.config), flow.resources, flow.versions], objectApiName)) {
      add(`flow ${flow.label}`);
    }
  }
  for (const page of tenant.pages) {
    if (page.targetObject === objectApiName
      || page.components.some((component) => containsFieldReference(component.properties, objectApiName))) {
      add(`Lightning page ${page.label}`);
    }
  }
  for (const report of tenant.reports) {
    if (report.objectApiName === objectApiName
      || report.crossFilters.some((crossFilter) => crossFilter.childObjectApiName === objectApiName)) {
      add(`report ${report.label}`);
    }
  }
  for (const dashboard of tenant.dashboards) {
    if (dashboard.filters.some((filter) => filter.objectApiName === objectApiName)
      || dashboard.components.some((component) => component.objectApiName === objectApiName
        || containsFieldReference(component.properties, objectApiName))) {
      add(`dashboard ${dashboard.label}`);
    }
  }
  for (const process of tenant.approvalProcesses) {
    if (process.objectApiName === objectApiName) add(`approval process ${process.label}`);
  }
  for (const alert of tenant.emailAlerts) {
    if (alert.objectApiName === objectApiName) add(`email alert ${alert.label}`);
  }
  for (const rule of tenant.accessControl.sharingRules) {
    if (rule.objectApiName === objectApiName) add(`sharing rule ${rule.label}`);
  }
  return dependencies;
}

