import type {FieldTypeDefinition} from '../FieldRegistry.js';
/** MasterDetailField: reference metadata descriptor. */
export const MasterDetailDefinition:FieldTypeDefinition=Object.freeze({
 name:'MasterDetailField',dataType:'reference',kind:'relationship',
 relationshipType:'Master-Detail',
 storage:'record'
});
