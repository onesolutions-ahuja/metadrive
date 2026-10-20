import type {FieldTypeDefinition} from '../FieldRegistry.js';
/** ImageField: shared attachment/media service metadata descriptor. */
export const ImageDefinition:FieldTypeDefinition=Object.freeze({
 name:'ImageField',dataType:null,kind:'attachment',
 storage:'media-service'
});

// Image validation and media storage are shared tenant-aware services.
export {validateTenantImage} from '../../system-files/record-file-service.js';
export {TenantMediaService} from '../../system-files/tenant-media-service.js';
