export type IncomingReference={relationship_type:string;delete_behavior:string|null;required:boolean};
/** Inbound required/restricted lookups prevent deletion, independently of app metadata. */
export function assertDeletionAllowed(references:readonly IncomingReference[]):void{
 if(references.some(reference=>reference.relationship_type==='Lookup'&&
 (reference.delete_behavior==='Restrict'||reference.required)))
  throw new Error('Record delete restricted by a lookup relationship');
}
