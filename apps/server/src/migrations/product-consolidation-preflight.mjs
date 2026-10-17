/** Non-destructive checks for canonical Product consolidation. */
export function inspectProducts(tenant){
  const standard=tenant.objects.find(x=>x.apiName==='Product');
  const canonical=tenant.objects.find(x=>x.apiName==='Product__c');
  const source=tenant.records?.Product??[];
  const target=tenant.records?.Product__c??[];
  const ids=new Set(target.map(x=>String(x.Id)));
  return {ready:Boolean(standard&&canonical)&&source.every(x=>x.Id&&!ids.has(String(x.Id))),sourceCount:source.length,targetCount:target.length};
}
