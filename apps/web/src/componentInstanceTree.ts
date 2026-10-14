/** Phase 2c: compatible instance-tree and responsive placement contract.
 * Pure metadata operations; actual rendering remains in the existing component host.
 */
export type ResponsiveViewport = 'desktop' | 'tablet' | 'phone';
export type ComponentPlacement = {x:number;y:number;width:number;height:number};
export type ComponentInstanceNode = {
  id:string;
  registeredApiName:string;
  parentId?:string;
  slot?:string;
  layout?:Partial<Record<ResponsiveViewport,ComponentPlacement>>;
};
const validId=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x);
const validPlacement=(v:ComponentPlacement)=>[v.x,v.y,v.width,v.height].every(Number.isFinite)
  &&v.width>0&&v.height>0&&v.x>=0&&v.y>=0;
export function validateInstanceTree(nodes:readonly ComponentInstanceNode[]):string[] {
  const errors:string[]=[];
  const index=new Map<string,ComponentInstanceNode>();
  for(const node of nodes){
    if(!validId(node.id)||!validId(node.registeredApiName)) errors.push('Invalid instance identity');
    if(index.has(node.id))errors.push('Duplicate instance: '+node.id);
    index.set(node.id,node);
    if(node.slot!==undefined&&!validId(node.slot))errors.push('Invalid slot: '+node.id);
    for(const [viewport,placement] of Object.entries(node.layout??{})){
      if(!['desktop','tablet','phone'].includes(viewport)||!placement||!validPlacement(placement))
        errors.push('Invalid placement: '+node.id+' / '+viewport);
    }
  }
  for(const node of nodes){
    if(node.parentId!==undefined&&!index.has(node.parentId))errors.push('Missing parent: '+node.id);
    const visited=new Set<string>();
    let current:ComponentInstanceNode|undefined=node;
    while(current?.parentId){
      if(visited.has(current.id)||current.parentId===node.id){
        errors.push('Circular instance ancestry: '+node.id);break;
      }
      visited.add(current.id);
      current=index.get(current.parentId);
    }
  }
  return errors;
}
export function resolveInstancePlacement(node:ComponentInstanceNode,viewport:ResponsiveViewport):ComponentPlacement|undefined{
  const layout=node.layout;
  return layout?.[viewport]??(viewport==='phone'?layout?.tablet:undefined)??layout?.desktop;
}
export function childrenForSlot(nodes:readonly ComponentInstanceNode[],parentId:string,slot:string):ComponentInstanceNode[]{
  return nodes.filter(node=>node.parentId===parentId&&node.slot===slot);
}
