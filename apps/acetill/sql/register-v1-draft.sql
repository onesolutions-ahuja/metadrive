-- Acetill v1 draft registry. Execute only through authorised release/publisher tooling.
-- This does not grant licences or install Acetill for any tenant.
-- Do not mark published until page components, RBAC and checkout Flows are tested.
BEGIN;
INSERT INTO md_apps(api_name,label,enabled)
VALUES ('Acetill','Acetill',true)
ON CONFLICT (api_name) DO NOTHING;

INSERT INTO md_app_package_versions(app_id,version,published,description,brand_color)
SELECT id,1,false,'Acetill transaction-only POS. MetaDrive owns authentication, products, customers and administration.','#1769D2'
FROM md_apps WHERE api_name='Acetill'
ON CONFLICT (app_id,version) DO NOTHING;

-- The app installer materialises these pages into tenant SQL only on installation.
INSERT INTO md_app_package_page_templates(app_id,version,api_name,title)
SELECT a.id,1,v.api_name,v.title FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister','Register'),
 ('AcetillSale','New Sale'),
 ('AcetillCheckout','Checkout'),
 ('AcetillReceipt','Receipt')
) v(api_name,title)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

INSERT INTO md_app_package_navigation(app_id,version,entry_type,api_name,sort_order)
SELECT a.id,1,'App Page',v.api_name,v.sort_order FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister',10),
 ('AcetillSale',20),
 ('AcetillCheckout',30),
 ('AcetillReceipt',40)
) v(api_name,sort_order)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- Each tenant must already have the canonical shared objects before Acetill installs.
INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,1,'Object',o.api_name,'' FROM md_apps a
CROSS JOIN (VALUES ('Product'),('Cart'),('CartLine'),('Order'),('OrderLine')) o(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- Reuse existing core One components, with no Acetill-specific copies.
-- The package installer resolves each required Component against tenant SQL.
INSERT INTO md_app_package_resources(app_id,version,resource_type,api_name,parent_api)
SELECT a.id,1,'Component',c.api_name,'' FROM md_apps a
CROSS JOIN (VALUES ('OneText'),('OneSearch'),('OneItemGrid'),('OneShoppingCart'),('OneButton'),('OneBadge'),('OneDivider'),('OneMetric')) c(api_name)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

-- SQL-backed, editable published page component instances.
INSERT INTO md_app_package_page_component_templates(app_id,version,page_api,component_api,slot,sort_order)
SELECT a.id,1,p.page_api,p.component_api,p.slot,p.sort_order
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
SELECT a.id,1,p.page_api,p.component_api,p.slot,p.sort_order,p.property_path,p.data_type,p.value_text
FROM md_apps a
CROSS JOIN (VALUES
 ('AcetillRegister','OneBadge','header',5,'text','string','ACETILL POS'),
 ('AcetillRegister','OneText','main',10,'text','string','Welcome to Acetill'),
 ('AcetillRegister','OneText','main',10,'fontSize','number','28'),
 ('AcetillRegister','OneText','main',15,'text','string','Your store and available registers are managed in UNE Solutions. Register selection will be connected through a published Flow.'),
 ('AcetillRegister','OneButton','main',20,'label','string','Open register'),
 ('AcetillRegister','OneButton','main',20,'disabled','boolean','true'),
 ('AcetillSale','OneText','header',5,'text','string','New sale'),
 ('AcetillSale','OneSearch','main',10,'placeholder','string','Search products or scan a barcode'),
 ('AcetillSale','OneSearch','main',10,'searchKey','string','acetill-catalogue'),
 ('AcetillSale','OneItemGrid','main',20,'title','string','Products'),
 ('AcetillSale','OneItemGrid','main',20,'showHeading','boolean','false'),
 ('AcetillSale','OneItemGrid','main',20,'currencyCode','string','GBP'),
 ('AcetillSale','OneItemGrid','main',20,'recordActiveFieldApiName','string','Active'),
 ('AcetillSale','OneItemGrid','main',20,'selectionBehavior','string','add'),
 ('AcetillSale','OneItemGrid','main',20,'objectApiName','string','Product'),
 ('AcetillSale','OneItemGrid','main',20,'titleFieldApiName','string','Name'),
 ('AcetillSale','OneItemGrid','main',20,'priceFieldApiName','string','Price'),
 ('AcetillSale','OneItemGrid','main',20,'searchKey','string','acetill-catalogue'),
 ('AcetillSale','OneItemGrid','main',20,'cartTargetKey','string','acetill'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'title','string','Current sale'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'viewMode','string','basket'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'currencyCode','string','GBP'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'nameFieldApiName','string','Name'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'priceFieldApiName','string','Price'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'cartTargetKey','string','acetill'),
 ('AcetillSale','OneShoppingCart','sidebar',30,'checkoutLabel','string','Checkout'),
 ('AcetillCheckout','OneText','header',5,'text','string','Review your sale'),
 ('AcetillCheckout','OneShoppingCart','main',10,'title','string','Checkout'),
 ('AcetillCheckout','OneShoppingCart','main',10,'viewMode','string','basket'),
 ('AcetillCheckout','OneShoppingCart','main',10,'nameFieldApiName','string','Name'),
 ('AcetillCheckout','OneShoppingCart','main',10,'priceFieldApiName','string','Price'),
 ('AcetillCheckout','OneButton','main',20,'label','string','Complete sale (connect Flow)'),
 ('AcetillCheckout','OneButton','main',20,'disabled','boolean','true'),
 ('AcetillCheckout','OneShoppingCart','main',10,'cartTargetKey','string','acetill'),
 ('AcetillReceipt','OneBadge','header',5,'text','string','RECEIPT'),
 ('AcetillReceipt','OneText','main',10,'text','string','Receipt'),
 ('AcetillReceipt','OneText','main',10,'fontSize','number','28'),
 ('AcetillReceipt','OneText','main',20,'text','string','Receipt details will be populated from the confirmed Order using your published Flow. No placeholder receipt is treated as proof of payment.'),
 ('AcetillReceipt','OneButton','main',30,'label','string','Print receipt (connect Flow)'),
 ('AcetillReceipt','OneButton','main',30,'disabled','boolean','true')
) p(page_api,component_api,slot,sort_order,property_path,data_type,value_text)
WHERE a.api_name='Acetill'
ON CONFLICT DO NOTHING;

COMMIT;
