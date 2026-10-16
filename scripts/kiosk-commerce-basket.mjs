// Shared pricing and basket transformation for Flow custom actions and UI components.
// All amounts are integer minor units to avoid floating-point price drift.
export const minor = amount => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw Error('Invalid nonnegative price');
  return Math.round(amount * 100);
};
export const money = cents => Math.round(cents) / 100;
export function validateSelections(groups, options, selectedIds) {
  const selected=new Set(selectedIds);
  if (selected.size!==selectedIds.length) throw Error('Duplicate modifier option');
  const optionMap=new Map(options.filter(o=>o.IsActive!==false).map(o=>[o.Id,o]));
  for(const id of selected) if(!optionMap.has(id)) throw Error('Inactive or unknown modifier option');
  for(const group of groups.filter(g=>g.IsActive!==false)){
    const count=[...selected].filter(id=>optionMap.get(id)?.GroupId===group.Id).length;
    const minimum=Number(group.MinSelections??(group.IsRequired?1:0));
    const maximum=Number(group.MaxSelections??Number.MAX_SAFE_INTEGER);
    if(!Number.isInteger(minimum)||!Number.isInteger(maximum)||minimum<0||maximum<minimum)
      throw Error('Invalid modifier group limits');
    if(count<minimum||count>maximum)throw Error('Modifier selections violate '+group.Name);
  }
  const allowed=new Set(groups.map(g=>g.Id));
  for(const id of selected)if(!allowed.has(optionMap.get(id).GroupId))throw Error('Unassigned modifier group');
  return selectedIds.map(id=>optionMap.get(id));
}
export function priceBasketLine({product,quantity,modifiers=[]}) {
  if(!Number.isInteger(quantity)||quantity<1||quantity>999)throw Error('Quantity must be 1–999');
  const base=minor(Number(product.DefaultPrice??product.Price__c));
  const extras=modifiers.reduce((n,o)=>n+minor(Number(o.PriceAdjustment??0)),0);
  return {quantity,baseUnitPrice:money(base),modifierTotal:money(extras),
    unitPrice:money(base+extras),lineTotal:money((base+extras)*quantity)};
}
export function basketTotals(lines,taxRate=0){
  if(typeof taxRate!=='number'||!Number.isFinite(taxRate)||taxRate<0||taxRate>1)
    throw Error('Tax rate must be between zero and one');
  const subtotal=lines.reduce((sum,line)=>sum+minor(Number(line.LineTotal)),0);
  const tax=Math.round(subtotal*taxRate);
  return {subtotal:money(subtotal),taxAmount:money(tax),total:money(subtotal+tax)};
}
export function lineFingerprint(productId,modifierIds){
  return String(productId)+':'+[...new Set(modifierIds)].sort().join(',');
}
// Atomicity and permission checking remain the responsibility of the existing
// Object/Record and Flow engines. This module never writes directly to SQL.
