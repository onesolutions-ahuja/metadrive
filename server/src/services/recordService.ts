import { pool } from '../db';
import { SysRecord } from '../types/metadata';

export class RecordService {
  static async createRecord(objectApiName: string, data: Record<string, any>): Promise<SysRecord> {
    const query = `
      INSERT INTO sys_records (object_api_name, data)
      VALUES ($1, $2::jsonb)
      RETURNING *;
    `;
    const result = await pool.query(query, [objectApiName, JSON.stringify(data)]);
    return result.rows[0];
  }

  static async getRecordsByObject(objectApiName: string): Promise<SysRecord[]> {
    const query = `
      SELECT * FROM sys_records 
      WHERE object_api_name = $1 
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [objectApiName]);
    return result.rows;
  }

  static async getRecordById(id: number): Promise<SysRecord | null> {
    const query = `SELECT * FROM sys_records WHERE id = $1;`;
    const result = await pool.query([id]);
    return result.rows[0] || null;
  }

  static async updateRecord(id: number, data: Record<string, any>): Promise<SysRecord | null> {
    const query = `
      UPDATE sys_records 
      SET data = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *;
    `;
    const result = await pool.query(query, [JSON.stringify(data), id]);
    return result.rows[0] || null;
  }

  static async deleteRecord(id: number): Promise<boolean> {
    const query = `DELETE FROM sys_records WHERE id = $1;`;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}