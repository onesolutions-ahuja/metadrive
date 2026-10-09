export interface CreateObjectDTO {
  api_name: string;
  label: string;
  plural_label: string;
}

export interface CreateFieldDTO {
  object_id: number;
  api_name: string;
  label: string;
  field_type: 'Text' | 'Number' | 'Date' | 'Lookup' | 'Picklist';
  is_required?: boolean;
}

export interface SysObject {
  id: number;
  api_name: string;
  label: string;
  plural_label: string;
  created_at: string;
}

export interface SysField {
  id: number;
  object_id: number;
  api_name: string;
  label: string;
  field_type: string;
  is_required: boolean;
  created_at: string;
}

export interface SysRecord {
  id: number;
  object_api_name: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}