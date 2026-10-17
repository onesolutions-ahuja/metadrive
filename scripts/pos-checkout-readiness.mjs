/**
 * Read-only, tenant-scoped POS metadata readiness assessment.
 * This diagnostic does not install applications, change a tenant or grant permissions.
 * App definition and business logic remain in metadata/Flows, not in Core.
 */
const get=(items,name)=>items.find(x=>x.apiName===name);
const field=(object,name)=>object?.fields?.find(x=>x.apiName===name);
const has=(items,name)=>items.some(item=>item?.apiName===name);
const output=(flow,name)=>flow?.resources?.find(x=>x.name===name);
export function assessCheckoutReadiness({objects=[],flows=[],pages=[]}={}){
 const issues=[],checks=[];
 const check=(id,pass,note)=>{checks.push({id,pass,note});if(!pass)issues.push(id)};
 const products=get(objects,'Product');
 const order=get(objects,'Order__c')||get(objects,'Order');
 const lines=get(objects,'OrderLine__c')||get(objects,'OrderItem');
 const invoice=get(objects,'Invoice');
 const invoiceItems=get(objects,'InvoiceItem');
 const payment=get(objects,'Payment');
 const stocks=get(objects,'StockBalance');
 const inventory=get(objects,'InventoryTransaction');
 const allNames=new Set(objects.map(o=>o.apiName));
 for(const obj of objects){
   if(obj.apiName!=='Product'&&obj.apiName!=='Order'&&obj.apiName!=='OrderItem'&&obj.apiName!=='Invoice'&&obj.apiName!=='InvoiceItem')continue;
   const invalid=(obj.fields??[]).filter(f=>/^(Lookup|Master-Detail)\(/.test(f.dataType)&&
      (!f.relationship||!allNames.has(f.relationship.targetObject)));
   check('relationships:'+obj.apiName,!invalid.length,
     invalid.map(f=>f.apiName+' → '+(f.relationship?.targetObject??f.dataType)).join(', '));
   const empty=(obj.fields??[]).filter(f=>['Picklist','Multi-Select Picklist'].includes(f.dataType)&&!f.picklistValues?.length);
   check('picklists:'+obj.apiName,!empty.length,empty.map(f=>f.apiName).join(', '));
 }
 check('product:available',Boolean(products),'Product object exists');
 check('product:age-field',field(products,'AgeRestricted')?.dataType==='Checkbox',
   'An explicit product age-restriction field is required for UK checkout');
 check('order:available',Boolean(order),'Order object exists');
 check('order:session-field',Boolean(field(order,'BasketSessionKey')),
   'Draft basket must use a unique authenticated session key; not a shared literal');
 check('order:status-field',Boolean(field(order,'Status')),'Order Status required');
 check('lines:available',Boolean(lines),'Order lines required');
 check('lines:parent-lookup',Boolean(field(lines,'OrderId')?.relationship?.targetObject==='Order'
   ||field(lines,'OrderId')?.relationship?.targetObject==='Order__c'), 'Order line must link to Order');
 check('invoice:available',Boolean(invoice),'Invoice object exists');
 check('invoice:order-link',Boolean(field(invoice,'OrderId')),'Invoice must link to source Order');
 check('invoice-items:available',Boolean(invoiceItems),'InvoiceItem object exists');
 check('invoice-items:invoice-link',Boolean(field(invoiceItems,'InvoiceId')),'InvoiceItem must link to Invoice');
 check('payment:available',Boolean(payment),'Payment object exists');
 check('stock:available',Boolean(stocks&&inventory),
   'StockBalance and InventoryTransaction objects required for controlled stock updates');
 const cashFlow=flows.find(f=>/COPILOT POS - Cash Checkout/i.test(f.label))
   ??flows.find(f=>/cash.+checkout|checkout.+cash/i.test(f.label));
 check('flow:checkout-found',Boolean(cashFlow),'Cash checkout Flow exists in this tenant');
 check('flow:inactive',!cashFlow||cashFlow.status!=='Active','Do not activate an untested checkout');
 const elements=cashFlow?.elements??[];
 check('flow:cash-screen',!cashFlow||elements.some(e=>e.type==='Screen'&&/cash|received|tender/i.test(e.label)),
   'Cash Received screen must be present');
 check('flow:order-query',!cashFlow||elements.some(e=>e.type==='Get Records'&&e.config?.object===order?.apiName),
   'Checkout must query the Order from a trusted basket session');
 check('flow:line-query',!cashFlow||elements.some(e=>e.type==='Get Records'
    && ['OrderItem','OrderLine__c'].includes(String(e.config?.object??''))
    && (e.config?.conditions??[]).some(c=>c.field==='OrderId' && /^\{!?[A-Za-z_$][A-Za-z0-9_$.]*\}$/.test(String(c.value??'')))),
   'Get Records must query Order Lines using an earlier parent ID reference');
 check('flow:invoice-create',!cashFlow||elements.some(e=>e.type==='Create Records'&&e.config?.object==='Invoice'),
   'Flow must create an Invoice after validation');
 check('flow:invoice-lines',!cashFlow||elements.some(e=>e.type==='Create Records'&&e.config?.object==='InvoiceItem'),
   'Flow must create matching Invoice Items');
 check('flow:payment-record',!cashFlow||elements.some(e=>e.type==='Create Records'&&e.config?.object==='Payment'),
   'Cash payment needs a durable record; client-reported success is insufficient');
 check('flow:age-gate',!cashFlow||elements.some(e=>e.type==='Decision'&&/age|challeng|verification/i.test(e.label)),
   'Age-restricted sales need an enforced approval path');
 check('flow:stock-update',!cashFlow||elements.some(e=>['Create Records','Update Records'].includes(e.type)
   && ['StockBalance','InventoryTransaction','InventoryTransactionItem'].includes(String(e.config?.object??''))),
   'Stock movement must be written as business records');
 const till=pages.find(p=>/cashier|till/i.test(p.label+' '+p.apiName));
 const customer=pages.find(p=>/customer.*display/i.test(p.label+' '+p.apiName));
 check('page:till',Boolean(till),'Cashier Page must exist');
 check('page:customer',Boolean(customer),'Customer display Page must exist');
 check('page:drafts',(!till||till.status!=='Active')&&(!customer||customer.status!=='Active'),
   'Do not activate Pages before safe end-to-end checkout test');
 check('page:sync',Boolean(till&&customer), 'Both Pages must be paired and tested in a browser');
 return {readyForLiveTest:issues.length===0,checks,issues,
   checkoutFlow:{found:Boolean(cashFlow),status:cashFlow?.status??'Missing',elements:elements.length},
   tillPage:till?.status??'Missing',customerPage:customer?.status??'Missing',
   // These cannot be established by metadata inspection alone.
   runtimeAssertions:['staff age verification with audited authorisation',
      'insufficient cash rejection','exactly-one payment and invoice for retry',
      'invoice items match source order','atomic inventory decrement and rollback',
      'no cross-tenant/basket access','same-origin customer display pairing']};
}
