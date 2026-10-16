import type { FlowMetadata, ObjectMetadata, FlowValidationDependencies } from '../../index.js';

type ScreenValidationContext = {
  flow: FlowMetadata;
  element: FlowMetadata['elements'][number];
  objects: ObjectMetadata[];
  tenantId: string;
  errors: string[];
  validateConditions: (conditions: unknown, object: { apiName: string; fields: Array<{ apiName: string }> } | undefined, elementLabel: string) => void;
  validateConditionLogic: (logic: unknown, elementLabel: string, conditionCount?: number) => void;
  deps: FlowValidationDependencies;
};

export function validateScreenElement(context: ScreenValidationContext): void {
  const { flow, element, objects, tenantId, errors, validateConditions, validateConditionLogic, deps } = context;
  const { asConfigRows, libraryComponentVisible, isValidFlowDateTime, isValidFlowTime, z, getState, isSafeFlowRegex } = deps;
    if (element.type === 'Screen') {
      if (element.config.layout !== undefined && !['One Column', 'Two Columns'].includes(String(element.config.layout))) {
        errors.push(`Screen "${element.label}" layout must be One Column or Two Columns.`);
      }
      const outcomes = asConfigRows(element.config.outcomes);
      const labels = outcomes.map((outcome) => typeof outcome.label === 'string' ? outcome.label.trim() : '');
      const names = outcomes.map((outcome) => typeof outcome.name === 'string' ? outcome.name.trim() : '');
      const connectors = flow.connectors.filter((connector) => connector.from === element.id && connector.kind !== 'fault');
      if (outcomes.some((outcome) => typeof outcome.label !== 'string' || !outcome.label.trim())) {
        errors.push(`Screen "${element.label}" outcomes must have labels.`);
      }
      if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length
        || new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
        errors.push(`Screen "${element.label}" outcome labels and API names must be unique.`);
      }
      const routeKeys = new Set<string>();
      for (const connector of connectors) {
        if (!outcomes.length) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but no configured outcomes.`);
          continue;
        }
        if (!connector.label) {
          if (connectors.length > 1) errors.push(`Screen "${element.label}" has multiple paths but a connector is missing its outcome label.`);
          continue;
        }
        const key = connector.label.toLowerCase();
        if (!outcomes.some((outcome) =>
          String(outcome.label ?? '').toLowerCase() === key || String(outcome.name ?? '').toLowerCase() === key)) {
          errors.push(`Screen connector "${connector.id}" does not match an outcome on "${element.label}".`);
        }
        if (routeKeys.has(key)) errors.push(`Screen "${element.label}" has more than one connector for outcome "${connector.label}".`);
        routeKeys.add(key);
      }
      for (const outcome of outcomes) {
        const label = String(outcome.label ?? '').trim().toLowerCase();
        const name = String(outcome.name ?? '').trim().toLowerCase();
        const matchingConnectors = connectors.filter((connector) => {
          const connectorLabel = connector.label.trim().toLowerCase();
          return connectorLabel && (connectorLabel === label || connectorLabel === name);
        });
        const implicitDefaultPath = outcomes.length === 1 && connectors.length === 1
          && !connectors[0].label && String(outcome.name ?? '').toLowerCase() === 'default';
        if (!implicitDefaultPath && matchingConnectors.length !== 1) {
          errors.push(`Screen "${element.label}" outcome "${String(outcome.label ?? outcome.name ?? '')}" must have exactly one connector.`);
        }
      }
      const fields = asConfigRows(element.config.fields);
      const displayFields = fields.filter((field) => ['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      for (const field of displayFields) {
        if (field.type === 'Display Text' && (typeof field.text !== 'string' || !field.text.trim())) {
          errors.push(`Display Text component "${String(field.label ?? '')}" on "${element.label}" requires text content.`);
        }
        if (field.type === 'Display Image') {
          const imageUrl = typeof field.imageUrl === 'string' ? field.imageUrl.trim() : '';
          let validHttpsImage = false;
          try {
            const imageAddress = new URL(imageUrl);
            validHttpsImage = imageAddress.protocol === 'https:'
              && Boolean(imageAddress.hostname)
              && !imageAddress.username
              && !imageAddress.password;
          } catch {
            validHttpsImage = false;
          }
          if (!validHttpsImage) errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires an HTTPS image URL.`);
          if (typeof field.imageAltText !== 'string' || !field.imageAltText.trim()) {
            errors.push(`Display Image component "${String(field.label ?? '')}" on "${element.label}" requires alternative text.`);
          }
        }
        if (field.type === 'Section') {
          if (typeof field.label !== 'string' || !field.label.trim()) {
            errors.push(`Section component on "${element.label}" requires a label.`);
          }
          if (field.description !== undefined
            && (typeof field.description !== 'string' || field.description.length > 255)) {
            errors.push(`Description on Section component "${String(field.label ?? '')}" must be no longer than 255 characters.`);
          }
          if (field.columns !== undefined && ![1, 2].includes(Number(field.columns))) {
            errors.push(`Section component "${String(field.label ?? '')}" must contain one or two columns.`);
          }
        }
      }
      const inputFields = fields.filter((field) => !['Display Text', 'Display Image', 'Section'].includes(String(field.type)));
      const fieldNames = inputFields.map((field) => typeof field.apiName === 'string'
        ? field.apiName.trim()
        : String(field.label ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''));
      if (new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length
        || fieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
        errors.push(`Screen "${element.label}" fields must have unique, valid API names.`);
      }
      for (const field of inputFields) {
        if (typeof field.helpText === 'string' && field.helpText.length > 255) {
          errors.push(`Help text on screen field "${String(field.label ?? '')}" exceeds 255 characters.`);
        }
        const type = String(field.type ?? 'Text');
        const supportedTypes = ['Text', 'Password', 'Number', 'Currency', 'Date', 'Time', 'Date/Time', 'Email', 'URL', 'Phone', 'Checkbox', 'Toggle', 'Slider', 'Picklist', 'Multi-Select Picklist', 'Long Text Area', 'Address', 'Name', 'Lookup', 'Choice Lookup', 'Data Table', 'File Upload', 'Repeater', 'Custom Component'];
        if (!supportedTypes.includes(type)) {
          errors.push(`Screen field "${String(field.label ?? '')}" on "${element.label}" uses unsupported data type "${type}".`);
        }
        if (type === 'Custom Component') {
          const apiName = typeof field.componentApiName === 'string' ? field.componentApiName.trim() : '';
          const definition = getState().libraryComponents.find((component) =>
            component.apiName === apiName && component.surfaces.includes('flow') && component.status !== 'Draft'
            && libraryComponentVisible(component, tenantId, Object.keys(getState().tenants)));
          if (!definition) {
            errors.push(`Custom screen component "${apiName}" on "${element.label}" must reference a published Flow-enabled registry component.`);
          }
          if (field.componentPropsJson !== undefined) {
            try {
              const parsed = typeof field.componentPropsJson === 'string' && field.componentPropsJson.length <= 32768
                ? JSON.parse(field.componentPropsJson) : null;
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
                || ['__proto__', 'constructor', 'prototype'].some((key) => Object.prototype.hasOwnProperty.call(parsed,key))) {
                throw new Error('Component properties must be a safe object');
              }
            } catch {
              errors.push(`Custom screen component "${apiName}" on "${element.label}" has invalid component properties.`);
            }
          }
        }
        if (['Lookup', 'Choice Lookup'].includes(type) && !objects.some((object) => object.apiName === field.objectApiName)) {
          errors.push(`${type} screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid target object.`);
        }
        if (type === 'Choice Lookup' && field.displayField !== undefined
          && !objects.find((object) => object.apiName === field.objectApiName)?.fields.some((item) => item.apiName === field.displayField)) {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" requires a valid choice label field.`);
        }
        if (type === 'Choice Lookup' && field.multipleSelections !== undefined
          && typeof field.multipleSelections !== 'boolean') {
          errors.push(`Choice Lookup screen field "${String(field.label ?? '')}" on "${element.label}" must configure multiple selections as true or false.`);
        }
        if (type === 'Data Table') {
          const collectionName = typeof field.collection === 'string' ? field.collection : '';
          const collection = flow.resources.find((resource) => resource.name === collectionName && resource.type === 'Record Collection');
          if (!collection) errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires a Record Collection resource.`);
          const columnNames = Array.isArray(field.columns) ? field.columns.filter((column): column is string => typeof column === 'string') : [];
          if (!columnNames.length || new Set(columnNames).size !== columnNames.length) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" requires unique columns.`);
          } else if (collection && !objects.find((object) => object.apiName === collection.dataType)?.fields.some((item) => columnNames.includes(item.apiName))) {
            errors.push(`Data Table screen field "${String(field.label ?? '')}" on "${element.label}" has columns that are not fields on its collection object.`);
          }
        }
        if (type === 'File Upload') {
          const maxFiles = field.maxFiles === undefined ? 1 : field.maxFiles;
          const maxFileSize = field.maxFileSize === undefined ? 512 : field.maxFileSize;
          const allowedTypes = Array.isArray(field.allowedTypes) ? field.allowedTypes : [];
          if (!Number.isInteger(maxFiles) || Number(maxFiles) < 1 || Number(maxFiles) > 10) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must allow between 1 and 10 files.`);
          }
          if (!Number.isInteger(maxFileSize) || Number(maxFileSize) < 1 || Number(maxFileSize) > 512) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" must limit each file to 1 through 512 KB.`);
          }
          if (allowedTypes.some((mime) => typeof mime !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(mime))) {
            errors.push(`File Upload screen field "${String(field.label ?? '')}" has an invalid allowed MIME type.`);
          }
        }
        if (type === 'Repeater') {
          const subfields = asConfigRows(field.subfields);
          if (!subfields.length || subfields.length > 20) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" must define between 1 and 20 subfields.`);
          }
          const subfieldNames = subfields.map((subfield) => typeof subfield.apiName === 'string' ? subfield.apiName.trim() : '');
          if (subfieldNames.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
            || new Set(subfieldNames.map((name) => name.toLowerCase())).size !== subfieldNames.length) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" subfields must have unique, valid API names.`);
          }
          const allowedSubfieldTypes = ['Text', 'Number', 'Date', 'Email', 'Checkbox'];
          if (subfields.some((subfield) => !allowedSubfieldTypes.includes(String(subfield.type ?? 'Text')))) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" uses an unsupported subfield type.`);
          }
          const minimumRows = field.minimumRows === undefined ? 0 : field.minimumRows;
          const maximumRows = field.maximumRows === undefined ? 10 : field.maximumRows;
          if (!Number.isInteger(minimumRows) || Number(minimumRows) < 0 || Number(minimumRows) > 50
            || !Number.isInteger(maximumRows) || Number(maximumRows) < 1 || Number(maximumRows) > 50
            || Number(minimumRows) > Number(maximumRows)) {
            errors.push(`Repeater screen field "${String(field.label ?? '')}" requires valid row limits from 0 to 50.`);
          }
        }
        const displayAs = field.displayAs;
        if (displayAs !== undefined) {
          const supportedDisplays: Record<string, string[]> = {
            Picklist: ['Dropdown', 'Radio Buttons'],
            'Multi-Select Picklist': ['Multi-Select Dropdown', 'Checkbox Group']
          };
          if (!supportedDisplays[type]?.includes(String(displayAs))) {
            errors.push(`Display mode "${String(displayAs)}" is not supported for ${type} screen field "${String(field.label ?? '')}".`);
          }
        }
        const minLength = field.minLength;
        const maxLength = field.maxLength;
        const min = field.min;
        const max = field.max;
        const step = field.step;
        if (minLength !== undefined && (!Number.isInteger(minLength) || Number(minLength) < 0)) {
          errors.push(`Minimum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (maxLength !== undefined && (!Number.isInteger(maxLength) || Number(maxLength) < 0)) {
          errors.push(`Maximum length on screen field "${String(field.label ?? '')}" must be a non-negative integer.`);
        }
        if (typeof minLength === 'number' && typeof maxLength === 'number' && minLength > maxLength) {
          errors.push(`Minimum length exceeds maximum length on screen field "${String(field.label ?? '')}".`);
        }
        if (minLength !== undefined || maxLength !== undefined) {
          if (!['Text', 'Password', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Length limits are only supported on text screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) {
          errors.push(`Minimum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) {
          errors.push(`Maximum value on screen field "${String(field.label ?? '')}" must be a finite number.`);
        }
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          errors.push(`Minimum value exceeds maximum value on screen field "${String(field.label ?? '')}".`);
        }
        if (min !== undefined || max !== undefined) {
          if (!['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Numeric limits are only supported on Number, Currency, and Slider screen fields ("${String(field.label ?? '')}").`);
          }
          if (step !== undefined && (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)) {
            errors.push(`Step on screen field "${String(field.label ?? '')}" must be a positive finite number.`);
          }
          if (step !== undefined && !['Number', 'Currency', 'Slider'].includes(type)) {
            errors.push(`Step is only supported on numeric and Slider screen fields ("${String(field.label ?? '')}").`);
          }
        }
        if (field.pattern !== undefined) {
          if (typeof field.pattern !== 'string' || !isSafeFlowRegex(field.pattern) || !['Text', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(type)) {
            errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" uses unsupported syntax or is not on a text field.`);
          } else {
            try {
              new RegExp(`^(?:${field.pattern})$`);
            } catch {
              errors.push(`Validation pattern on screen field "${String(field.label ?? '')}" is invalid.`);
            }
          }
        }
        if (field.validationMessage !== undefined
          && (typeof field.validationMessage !== 'string' || field.validationMessage.length > 255)) {
          errors.push(`Validation message on screen field "${String(field.label ?? '')}" must be at most 255 characters.`);
        }
        const visibilityConditions = asConfigRows(field.visibilityConditions);
        if (visibilityConditions.length) {
          validateConditions(field.visibilityConditions, undefined, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`);
          validateConditionLogic(field.visibilityLogic, `visibility rule for "${String(field.label ?? '')}" on "${element.label}"`, visibilityConditions.length);
          for (const condition of visibilityConditions) {
            if (typeof condition.field === 'string' && !fieldNames.includes(condition.field)
              && !flow.resources.some((resource) => resource.name === condition.field)) {
              errors.push(`Visibility condition on "${String(field.label ?? '')}" references unknown screen field "${condition.field}".`);
            }
          }
        }
        const defaultValue = field.defaultValue;
        const choices = field.choices;
        if (defaultValue !== undefined && defaultValue !== null && defaultValue !== '') {
          const validType = type === 'Multi-Select Picklist'
            ? Array.isArray(defaultValue) && defaultValue.every((value) => typeof value === 'string')
            : ['Checkbox', 'Toggle'].includes(type)
              ? typeof defaultValue === 'boolean'
              : ['Number', 'Currency', 'Slider'].includes(type)
                ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
                : typeof defaultValue === 'string';
          if (!validType) errors.push(`Default value on ${type} screen field "${String(field.label ?? '')}" has an incompatible value type.`);
          if (type === 'Picklist' && (!Array.isArray(choices) || !choices.includes(defaultValue))) {
            errors.push(`Default value on picklist screen field "${String(field.label ?? '')}" must be one of its configured choices.`);
          }
          if (type === 'Multi-Select Picklist' && Array.isArray(choices)
            && Array.isArray(defaultValue) && defaultValue.some((value) => !choices.includes(value))) {
            errors.push(`Default value on multi-select screen field "${String(field.label ?? '')}" must contain only configured choices.`);
          }
          if (type === 'Date' && typeof defaultValue === 'string'
            && (!/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)
              || !Number.isFinite(Date.parse(`${defaultValue}T00:00:00.000Z`))
              || new Date(`${defaultValue}T00:00:00.000Z`).toISOString().slice(0, 10) !== defaultValue)) {
            errors.push(`Default value on date screen field "${String(field.label ?? '')}" must be a valid date.`);
          }
          if (type === 'Date/Time' && typeof defaultValue === 'string' && !isValidFlowDateTime(defaultValue)) {
            errors.push(`Default value on date/time screen field "${String(field.label ?? '')}" must be a valid date and time.`);
          }
          if (type === 'Time' && typeof defaultValue === 'string' && !isValidFlowTime(defaultValue)) {
            errors.push(`Default value on time screen field "${String(field.label ?? '')}" must be a valid time.`);
          }
          if (type === 'Email' && typeof defaultValue === 'string' && !z.string().email().safeParse(defaultValue).success) {
            errors.push(`Default value on email screen field "${String(field.label ?? '')}" must be a valid email address.`);
          }
          if (type === 'URL' && typeof defaultValue === 'string' && !z.string().url().safeParse(defaultValue).success) {
            errors.push(`Default value on URL screen field "${String(field.label ?? '')}" must be a valid URL.`);
          }
        }
      }
      const choices = inputFields.filter((field) => ['Picklist', 'Multi-Select Picklist'].includes(String(field.type)));
      for (const field of choices) {
        if (!Array.isArray(field.choices) || !field.choices.length || field.choices.some((choice) => typeof choice !== 'string' || !choice.trim())) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" requires one or more choices.`);
        } else if (new Set(field.choices).size !== field.choices.length) {
          errors.push(`${String(field.type)} screen field "${String(field.label ?? '')}" on "${element.label}" has duplicate choices.`);
        }
      }
    }
}
