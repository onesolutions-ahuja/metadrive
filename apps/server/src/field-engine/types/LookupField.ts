import type {FieldTypeDefinition} from '../FieldRegistry.js';
/** LookupField: reference metadata descriptor. */
export const LookupDefinition:FieldTypeDefinition=Object.freeze({
 name:'LookupField',dataType:'reference',kind:'relationship',
 relationshipType:'Lookup',
 storage:'record'
});
