import type {ComponentSettingDefinition} from './componentSettingDefinitions';
import type {LightningAppMetadata} from './metadata';

/** Single metadata contract for standard App Manager form fields.
 * Existing app CRUD, navigation actions and server RBAC remain authoritative.
 */
export const appManagerFieldDefinitions:readonly ComponentSettingDefinition[]=[
 {propertyKey:'label',label:'App Label',kind:'TEXT',required:true,displayOrder:10},
 {propertyKey:'apiName',label:'Developer Name',kind:'TEXT',required:true,displayOrder:20},
 {propertyKey:'brandColor',label:'Brand Color',kind:'COLOR',required:true,defaultValue:'#0176d3',displayOrder:30},
 {propertyKey:'description',label:'Description',kind:'TEXT',displayOrder:40}
];
export type AppManagerFieldKey='label'|'apiName'|'brandColor'|'description';
export function validateAppManagerField(key:AppManagerFieldKey,value:unknown):string|null{
 if(typeof value!=='string')return 'A string value is required';
 if(key==='label')return value.trim()&&value.length<=80?null:'App Label must contain 1–80 characters';
 if(key==='apiName')return /^[A-Za-z][A-Za-z0-9_]*$/.test(value)?null:'Invalid Developer Name';
 if(key==='brandColor')return /^#[0-9a-fA-F]{6}$/.test(value)?null:'Brand Color must be a HEX colour';
 return value.length<=500?null:'Description must be at most 500 characters';
}
export function appManagerFieldValues(app:LightningAppMetadata){
 return Object.fromEntries(appManagerFieldDefinitions.map(item=>[item.propertyKey,app[item.propertyKey as AppManagerFieldKey]]));
}
