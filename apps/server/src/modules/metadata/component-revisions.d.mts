type RevisionFields='version'|'label'|'description'|'surfaces'|'resize'|'jsxSource'|'cssSource'|'compiledJs'|'scopedCss'|'updatedAt';
type ComponentRevisionFields={
 version:number;label:string;description:string;surfaces:readonly string[];
 resize:unknown;jsxSource:string;cssSource:string;compiledJs:string;scopedCss:string;updatedAt:string;
};
export function libraryRevision<T extends ComponentRevisionFields>(component:T):Pick<T,RevisionFields>;
export function nextLibraryRevision(component:{
 version:number;pendingDraft?:{version:number};revisions?:readonly {version:number}[];
}):number;
export function libraryHistory(component:ComponentRevisionFields & {
 status?:string;revisions?:readonly (ComponentRevisionFields & {version:number})[];
 pendingDraft?:ComponentRevisionFields & {version:number};
}):Array<{version:number;status:string;updatedAt:string}>;
