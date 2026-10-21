/** Canonical metadata flag for database-enforced uniqueness and external IDs. */
export function requiresUniqueValue(field:{is_unique:boolean;external_id:boolean}):boolean {
 return field.is_unique||field.external_id;
}
