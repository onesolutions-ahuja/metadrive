import type {FieldTypeDefinition} from '../FieldRegistry.js';
/** FileField: shared attachment/media service metadata descriptor. */
export const FileDefinition:FieldTypeDefinition=Object.freeze({
 name:'FileField',dataType:null,kind:'attachment',
 storage:'file-service'
});

// File operations retain the shared SQL/RBAC-protected file service.
export {RecordFileService,validateTenantImage} from '../../system-files/record-file-service.js';
