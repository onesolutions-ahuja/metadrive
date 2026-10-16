/** Shared protected component revision helpers; metadata remains in OneEngine's existing registry. */
export function libraryRevision(component){
 const {version,label,description,surfaces,resize,jsxSource,cssSource,compiledJs,scopedCss,updatedAt}=component;
 return {version,label,description,surfaces,resize,jsxSource,cssSource,compiledJs,scopedCss,updatedAt};
}
export function nextLibraryRevision(component){
 return Math.max(component.version,component.pendingDraft?.version??0,...(component.revisions??[]).map(row=>row.version))+1;
}
export function libraryHistory(component){
 return [...(component.revisions??[]).map(row=>({version:row.version,status:'Published',updatedAt:row.updatedAt})),
  {version:component.version,status:component.status??'Published',updatedAt:component.updatedAt},
  ...(component.pendingDraft?[{version:component.pendingDraft.version,status:'Draft',updatedAt:component.pendingDraft.updatedAt}]:[])];
}
