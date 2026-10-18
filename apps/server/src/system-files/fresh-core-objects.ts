import type {PoolClient} from 'pg';

/** Fresh install Core catalog. Metadata only: no business records or sample data. */
export const FRESH_CORE_OBJECTS = [
  {
    "apiName": "Invoice",
    "label": "Invoice",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "InvoiceNumber",
        "label": "Invoice Number",
        "dataType": "text"
      },
      {
        "apiName": "Customer",
        "label": "Customer",
        "dataType": "reference",
        "relatedObject": "Customer"
      },
      {
        "apiName": "InvoiceDate",
        "label": "Invoice Date",
        "dataType": "date"
      },
      {
        "apiName": "Total",
        "label": "Total",
        "dataType": "number"
      }
    ]
  },
  {
    "apiName": "InvoiceLine",
    "label": "Invoice Line",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Invoice",
        "label": "Invoice",
        "dataType": "reference",
        "relatedObject": "Invoice"
      },
      {
        "apiName": "Product",
        "label": "Product",
        "dataType": "reference",
        "relatedObject": "Product"
      },
      {
        "apiName": "Quantity",
        "label": "Quantity",
        "dataType": "number"
      },
      {
        "apiName": "UnitPrice",
        "label": "Unit Price",
        "dataType": "number"
      }
    ]
  },
  {
    "apiName": "Product",
    "label": "Product",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "SKU",
        "label": "SKU",
        "dataType": "text"
      },
      {
        "apiName": "Price",
        "label": "Price",
        "dataType": "number"
      },
      {
        "apiName": "Active",
        "label": "Active",
        "dataType": "boolean"
      }
    ]
  },
  {
    "apiName": "ProductLine",
    "label": "Product Line",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Product",
        "label": "Product",
        "dataType": "reference",
        "relatedObject": "Product"
      },
      {
        "apiName": "Quantity",
        "label": "Quantity",
        "dataType": "number"
      }
    ]
  },
  {
    "apiName": "Contact",
    "label": "Contact",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Email",
        "label": "Email",
        "dataType": "text"
      },
      {
        "apiName": "Phone",
        "label": "Phone",
        "dataType": "text"
      },
      {
        "apiName": "Account",
        "label": "Account",
        "dataType": "reference",
        "relatedObject": "Account"
      }
    ]
  },
  {
    "apiName": "Customer",
    "label": "Customer",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Email",
        "label": "Email",
        "dataType": "text"
      },
      {
        "apiName": "Phone",
        "label": "Phone",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "Vendor",
    "label": "Vendor",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Email",
        "label": "Email",
        "dataType": "text"
      },
      {
        "apiName": "Phone",
        "label": "Phone",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "Purchase",
    "label": "Purchase",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Vendor",
        "label": "Vendor",
        "dataType": "reference",
        "relatedObject": "Vendor"
      },
      {
        "apiName": "PurchaseDate",
        "label": "Purchase Date",
        "dataType": "date"
      },
      {
        "apiName": "Total",
        "label": "Total",
        "dataType": "number"
      }
    ]
  },
  {
    "apiName": "PurchaseLine",
    "label": "Purchase Line",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Purchase",
        "label": "Purchase",
        "dataType": "reference",
        "relatedObject": "Purchase"
      },
      {
        "apiName": "Product",
        "label": "Product",
        "dataType": "reference",
        "relatedObject": "Product"
      },
      {
        "apiName": "Quantity",
        "label": "Quantity",
        "dataType": "number"
      }
    ]
  },
  {
    "apiName": "Account",
    "label": "Account",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Phone",
        "label": "Phone",
        "dataType": "text"
      },
      {
        "apiName": "Website",
        "label": "Website",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "Lead",
    "label": "Lead",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Email",
        "label": "Email",
        "dataType": "text"
      },
      {
        "apiName": "Status",
        "label": "Status",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "Case",
    "label": "Case",
    "category": "standard",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Subject",
        "label": "Subject",
        "dataType": "text"
      },
      {
        "apiName": "Status",
        "label": "Status",
        "dataType": "text"
      },
      {
        "apiName": "Contact",
        "label": "Contact",
        "dataType": "reference",
        "relatedObject": "Contact"
      }
    ]
  },
  {
    "apiName": "User",
    "label": "User",
    "category": "system",
    "fields": [
      {
        "apiName": "Email",
        "label": "Email",
        "dataType": "text"
      },
      {
        "apiName": "Enabled",
        "label": "Enabled",
        "dataType": "boolean"
      },
      {
        "apiName": "Tenant",
        "label": "Tenant",
        "dataType": "reference",
        "relatedObject": "Tenant"
      }
    ]
  },
  {
    "apiName": "Tenant",
    "label": "Tenant",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Slug",
        "label": "Slug",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "Role",
    "label": "Role",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "ParentRole",
        "label": "Parent Role",
        "dataType": "reference",
        "relatedObject": "Role"
      }
    ]
  },
  {
    "apiName": "PermissionSet",
    "label": "Permission Set",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "PermissionAssignment",
    "label": "Permission Assignment",
    "category": "system",
    "fields": [
      {
        "apiName": "User",
        "label": "User",
        "dataType": "reference",
        "relatedObject": "User"
      },
      {
        "apiName": "PermissionSet",
        "label": "Permission Set",
        "dataType": "reference",
        "relatedObject": "PermissionSet"
      }
    ]
  },
  {
    "apiName": "AppExchange",
    "label": "App Exchange",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Version",
        "label": "Version",
        "dataType": "text"
      },
      {
        "apiName": "Enabled",
        "label": "Enabled",
        "dataType": "boolean"
      }
    ]
  },
  {
    "apiName": "FieldDefinition",
    "label": "Field Definition",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "ObjectApiName",
        "label": "Object API Name",
        "dataType": "text"
      },
      {
        "apiName": "DataType",
        "label": "Data Type",
        "dataType": "text"
      }
    ]
  },
  {
    "apiName": "ComponentDefinition",
    "label": "Component Definition",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "RendererKey",
        "label": "Renderer Key",
        "dataType": "text"
      },
      {
        "apiName": "Enabled",
        "label": "Enabled",
        "dataType": "boolean"
      }
    ]
  },
  {
    "apiName": "PageDefinition",
    "label": "Page Definition",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Enabled",
        "label": "Enabled",
        "dataType": "boolean"
      }
    ]
  },
  {
    "apiName": "FlowDefinition",
    "label": "Flow Definition",
    "category": "system",
    "fields": [
      {
        "apiName": "Name",
        "label": "Name",
        "dataType": "text"
      },
      {
        "apiName": "Version",
        "label": "Version",
        "dataType": "number"
      },
      {
        "apiName": "Active",
        "label": "Active",
        "dataType": "boolean"
      }
    ]
  }
] as const;

/** Call within tenant provisioning's SQL transaction, after tenant creation.
 * Missing metadata is added; existing definitions and tenant edits stay untouched.
 */
export async function seedFreshCoreObjects(client:PoolClient,tenantId:string) {
  for(const object of FRESH_CORE_OBJECTS) {
    await client.query(
      'INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,api_name) DO NOTHING',
      [tenantId,object.apiName,object.label,object.category==='system']);
  }
  // Register all objects first so reference-field foreign keys are valid.
  for(const object of FRESH_CORE_OBJECTS) for(const field of object.fields) {
    const relatedObject='relatedObject' in field ? field.relatedObject : null;
    await client.query(
      'INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING',
      [tenantId,object.apiName,field.apiName,field.label,field.dataType,relatedObject]);
  }
}
