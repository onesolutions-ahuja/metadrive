import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// POST /api/reports/aggregate -> Dynamic GROUP BY query on JSONB fields
router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    const { object_api_name, group_by_field, aggregate_field, function_type } = req.body;
    
    // Sanitize field names to prevent SQL injection
    const cleanGroup = group_by_field.replace(/[^a-zA-Z0-9_]/g, '');
    const cleanAgg = aggregate_field ? aggregate_field.replace(/[^a-zA-Z0-9_]/g, '') : '*';
    const func = (function_type || 'COUNT').toUpperCase();

    const query = `
      SELECT 
        data->>'${cleanGroup}' AS category,
        ${func === 'COUNT' ? 'COUNT(*)' : `${func}((data->>'${cleanAgg}')::numeric)`} AS metric
      FROM sys_records
      WHERE object_api_name = $1
      GROUP BY data->>'${cleanGroup}'
      ORDER BY metric DESC;
    `;

    const result = await pool.query(query, [object_api_name]);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;