-- Acetill v2 UI package. Execute only through authorised release/publisher tooling.
-- This does not grant licences or install Acetill for any tenant.
-- Checkout and receipt actions fail closed until their named Autolaunched Flows are active and authorised.
BEGIN;
INSERT INTO md_apps(api_name,label,enabled)
VALUES ('Acetill','Acetill',true)
ON CONFLICT (api_name) DO NOTHING;

INSERT INTO md_app_package_versions(app_id,version,published,description,brand_color)
SELECT id,2,true,'Acetill POS pages using MetaDrive authentication, data, permissions and Flows.','#1769D2'
FROM md_apps WHERE api_name='Acetill'
ON CONFLICT (app_id,version) DO UPDATE SET published=EXCLUDED.published;

-- The app installer materialises these pages into tenant SQL only on installation.
INSERT INTO md_app_package_page_templates(app_id,version,api_name,title)
SELECT a.id,2,v.api_name,v.title FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister','Register'),
 ('AcetillSale','New Sale'),
 ('AcetillCheckout','Checkout'),
 ('AcetillReceipt','Receipt')
) v(api_name,title)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

INSERT INTO md_app_package_home_page_templates(app_id,version,page_api,form_factor)
SELECT a.id,2,'AcetillRegister',f.form_factor
FROM md_apps a CROSS JOIN (VALUES ('desktop'),('phone')) f(form_factor)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

INSERT INTO md_app_package_navigation(app_id,version,entry_type,api_name,sort_order)
SELECT a.id,2,'App Page',v.api_name,v.sort_order FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister',10),
 ('AcetillSale',20),
 ('AcetillCheckout',30),
 ('AcetillReceipt',40)
) v(api_name,sort_order)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,2,'App Page',p.api_name,'' FROM md_apps a
CROSS JOIN (VALUES ('AcetillRegister'),('AcetillSale'),('AcetillCheckout'),('AcetillReceipt')) p(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- Each tenant must already have the canonical shared objects before Acetill installs.
INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,2,'Object',o.api_name,'' FROM md_apps a
CROSS JOIN (VALUES ('Product'),('Cart'),('CartLine'),('Order'),('OrderLine')) o(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,2,'Field',f.api_name,'Product' FROM md_apps a
CROSS JOIN (VALUES ('Name'),('Price'),('Active')) f(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- Reuse existing core One components, with no Acetill-specific copies.
-- The package installer resolves each required Component against tenant SQL.
INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,2,'Component',c.api_name,'' FROM md_apps a
CROSS JOIN (VALUES ('OneText'),('OneSearch'),('OneItemGrid'),('OneShoppingCart'),('OneButton'),('OneBadge'),('OneDivider'),('OneMetric')) c(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- SQL-backed, editable published page component instances.
INSERT INTO md_app_package_page_component_templates(app_id,version,page_api,component_api,slot,sort_order)
SELECT a.id,2,p.page_api,p.component_api,p.slot,p.sort_order
FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister','OneBadge','header',5),
 ('AcetillRegister','OneText','main',10),
 ('AcetillRegister','OneText','main',15),
 ('AcetillRegister','OneButton','main',20),
 ('AcetillSale','OneText','header',5),
 ('AcetillSale','OneSearch','main',10),
 ('AcetillSale','OneItemGrid','main',20),
 ('AcetillSale','OneShoppingCart','sidebar',30),
 ('AcetillCheckout','OneText','header',5),
 ('AcetillCheckout','OneShoppingCart','main',10),
 ('AcetillCheckout','OneButton','main',20),
 ('AcetillReceipt','OneBadge','header',5),
 ('AcetillReceipt','OneText','main',10),
 ('AcetillReceipt','OneText','main',20),
 ('AcetillReceipt','OneButton','main',30)
) p(page_api,component_api,slot,sort_order)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- Declarative properties, not application-specific TypeScript render branches.
INSERT INTO md_app_package_page_property_templates
 (app_id,version,page_api,component_api,slot,sort_order,property_path,data_type,value_text)
SELECT a.id,2,p.page_api,p.component_api,p.slot,p.sort_order,p.property_path,p.data_type,p.value_text
FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister','OneBadge','header',5,'text','string','ACETILL POS'),
 ('AcetillRegister','OneText','main',10,'text','string','Welcome to Acetill'),
 ('AcetillRegister','OneText','main',10,'fontSize','number','28'),
 ('AcetillRegister','OneText','main',15,'text','string','Your products, registers and transaction permissions are managed by UNE Solutions.'),
 ('AcetillRegister','OneButton','main',20,'label','string','Start a sale'),
 ('AcetillRegister','OneButton','main',20,'disabled','boolean','false'),
 ('AcetillRegister','OneButton','main',20,'actionFlows','object',NULL),
 ('AcetillRegister','OneButton','main',20,'actionFlows.click','object',NULL),
 ('AcetillRegister','OneButton','main',20,'actionFlows.click.actionType','string','Navigate'),
 ('AcetillRegister','OneButton','main',20,'actionFlows.click.navigationTargetType','string','App Page'),
 ('AcetillRegister','OneButton','main',20,'actionFlows.click.navigationPageApiName','string','AcetillSale'),
 ('AcetillSale','OneText','header',5,'text','string','New sale'),
 ('AcetillSale','OneSearch','main',10,'placeholder','string','Search products or scan a barcode'),
 ('AcetillSale','OneSearch','main',10,'searchKey','string','acetill-catalogue'),
 ('AcetillSale','OneItemGrid','main',20,'title','string','Products'),
 ('AcetillSale','OneItemGrid','main',20,'showHeading','boolean','false'),
 ('AcetillSale','OneItemGrid','main',20,'cardRadius','number','18'),
 ('AcetillSale','OneItemGrid','main',20,'cardPadding','number','9'),
 ('AcetillSale','OneItemGrid','main',20,'cardHover','string','lift'),
 ('AcetillSale','OneItemGrid','main',20,'imageFit','string','cover'),
 ('AcetillSale','OneItemGrid','main',20,'imageRadius','number','18'),
 ('AcetillSale','OneItemGrid','main',20,'imageAspectRatio','string','4/3'),
 ('AcetillSale','OneItemGrid','main',20,'cardShadow','string','sm'),
 ('AcetillSale','OneItemGrid','main',20,'currencyCode','string','GBP'),
 ('AcetillSale','OneItemGrid','main',20,'recordActiveFieldApiName','string','Active'),
 ('AcetillSale','OneItemGrid','main',20,'selectionBehavior','string','add'),
 ('AcetillSale','OneItemGrid','main',20,'objectApiName','string','Product'),
 ('AcetillSale','OneItemGrid','main',20,'titleFieldApiName','string','Name'),
 ('AcetillSale','OneItemGrid','main',20,'priceFieldApiName','string','Price'),
 ('AcetillSale','OneItemGrid','main',20,'searchKey','string','acetill-catalogue'),
 ('AcetillSale','OneItemGrid','main',20,'cartTargetKey','string','acetill'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'title','string','Current order'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'presentationStyle','string','modernTouch'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'productImageRadius','number','18'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'viewMode','string','basket'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'currencyCode','string','GBP'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'nameFieldApiName','string','Name'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'priceFieldApiName','string','Price'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'cartTargetKey','string','acetill'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutLabel','string','Complete sale'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutStatusOutput','string','status'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutRequestOutput','string','requestId'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutMessageOutput','string','message'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutChangeOutput','string','changeDueMinor'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows','object',NULL),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout','object',NULL),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.flowApiName','string','AcetillCompleteSale'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.flowType','string','Autolaunched Flow'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.inputs','object',NULL),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.inputs.checkoutRequest','string','$event'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs','object',NULL),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs.status','string','checkoutStatus'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs.requestId','string','checkoutRequestId'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs.message','string','checkoutMessage'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs.changeDueMinor','string','checkoutChangeDueMinor'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'actionFlows.checkout.outputs.orderId','string','orderId'),
 ('AcetillCheckout','OneText','header',5,'text','string','Review your sale'),
 ('AcetillCheckout','OneShoppingCart','main',10,'title','string','Checkout'),
 ('AcetillCheckout','OneShoppingCart','main',10,'viewMode','string','basket'),
 ('AcetillCheckout','OneShoppingCart','main',10,'nameFieldApiName','string','Name'),
 ('AcetillCheckout','OneShoppingCart','main',10,'priceFieldApiName','string','Price'),
 ('AcetillCheckout','OneShoppingCart','main',10,'currencyCode','string','GBP'),
 ('AcetillCheckout','OneShoppingCart','main',10,'cartTargetKey','string','acetill'),
 ('AcetillCheckout','OneShoppingCart','main',10,'checkoutLabel','string','Complete sale'),
 ('AcetillCheckout','OneShoppingCart','main',10,'checkoutStatusOutput','string','status'),
 ('AcetillCheckout','OneShoppingCart','main',10,'checkoutRequestOutput','string','requestId'),
 ('AcetillCheckout','OneShoppingCart','main',10,'checkoutMessageOutput','string','message'),
 ('AcetillCheckout','OneShoppingCart','main',10,'checkoutChangeOutput','string','changeDueMinor'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows','object',NULL),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout','object',NULL),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.flowApiName','string','AcetillCompleteSale'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.flowType','string','Autolaunched Flow'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.inputs','object',NULL),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.inputs.checkoutRequest','string','$event'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs','object',NULL),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs.status','string','checkoutStatus'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs.requestId','string','checkoutRequestId'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs.message','string','checkoutMessage'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs.changeDueMinor','string','checkoutChangeDueMinor'),
 ('AcetillCheckout','OneShoppingCart','main',10,'actionFlows.checkout.outputs.orderId','string','orderId'),
 ('AcetillCheckout','OneButton','main',20,'label','string','Return to sale'),
 ('AcetillCheckout','OneButton','main',20,'disabled','boolean','false'),
 ('AcetillCheckout','OneButton','main',20,'actionFlows','object',NULL),
 ('AcetillCheckout','OneButton','main',20,'actionFlows.click','object',NULL),
 ('AcetillCheckout','OneButton','main',20,'actionFlows.click.actionType','string','Navigate'),
 ('AcetillCheckout','OneButton','main',20,'actionFlows.click.navigationTargetType','string','App Page'),
 ('AcetillCheckout','OneButton','main',20,'actionFlows.click.navigationPageApiName','string','AcetillSale'),
 ('AcetillReceipt','OneBadge','header',5,'text','string','RECEIPT'),
 ('AcetillReceipt','OneText','main',10,'text','string','Receipt'),
 ('AcetillReceipt','OneText','main',10,'fontSize','number','28'),
 ('AcetillReceipt','OneText','main',20,'text','string','Only a confirmed Order can be printed. MetaDrive verifies the active receipt Flow and record permissions.'),
 ('AcetillReceipt','OneButton','main',30,'label','string','Print receipt'),
 ('AcetillReceipt','OneButton','main',30,'disabled','boolean','false'),
 ('AcetillReceipt','OneButton','main',30,'actionFlows','object',NULL),
 ('AcetillReceipt','OneButton','main',30,'actionFlows.click','object',NULL),
 ('AcetillReceipt','OneButton','main',30,'actionFlows.click.flowApiName','string','AcetillPrintReceipt'),
 ('AcetillReceipt','OneButton','main',30,'actionFlows.click.flowType','string','Autolaunched Flow'),
 ('AcetillReceipt','OneButton','main',30,'actionFlows.click.inputs','object',NULL),
 ('AcetillReceipt','OneButton','main',30,'actionFlows.click.inputs.orderId','string','$state.orderId')
) p(page_api,component_api,slot,sort_order,property_path,data_type,value_text)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

COMMIT;
