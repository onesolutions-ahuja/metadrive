import { pool } from '../db';
import { CreateObjectDTO, CreateFieldDTO, SysObject, SysField } from '../types/metadata';

export class MetadataService {
  static async createObject(dto: CreateObjectDTO): Promise<SysObject> {
    const query = `
      INSERT INTO sys_objects (api_name, label, plural_label)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [dto.api_name, dto.label, dto.plural_label];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getAllObjects(): Promise<SysObject[]> {
    const query = `SELECT * FROM sys_objects ORDER BY created_at DESC;`;
    const result = await pool.query(query);
    return result.rows;
  }

  static async getObjectByApiName(apiName: string): Promise<SysObject | null> {
    const query = `SELECT * FROM sys_objects WHERE api_name = $1;`;
    const result = await pool.query([apiName]);
    return result.rows[0] || null;
  }

  static async createField(dto: CreateFieldDTO): Promise<SysField> {
    const query = `
      INSERT INTO sys_fields (object_id, api_name, label, field_type, is_required)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [dto.object_id, dto.api_name, dto.label, dto.field_type, dto.is_required || false];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getFieldsByObjectId(objectId: number): Promise<SysField[]> {
    const query = `SELECT * FROM sys_fields WHERE object_id = $1 ORDER BY id ASC;`;
    const result = await pool.query(query, [objectId]);
    return result.rows;
  }
}