import { Router, Request, Response } from 'express';
import { RecordService } from '../services/recordService';

const router = Router();

// POST /api/records/:objectApiName -> Create Record
router.post('/:objectApiName', async (req: Request, res: Response) => {
  try {
    const { objectApiName } = req.params;
    const recordData = req.body;
    const newRecord = await RecordService.createRecord(objectApiName, recordData);
    return res.status(201).json(newRecord);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/records/:objectApiName -> List Records for Object
router.get('/:objectApiName', async (req: Request, res: Response) => {
  try {
    const { objectApiName } = req.params;
    const records = await RecordService.getRecordsByObject(objectApiName);
    return res.json(records);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/records/detail/:id -> Get Single Record
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const record = await RecordService.getRecordById(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    return res.json(record);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/records/detail/:id -> Update Record
router.put('/detail/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await RecordService.updateRecord(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Record not found' });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/records/detail/:id -> Delete Record
router.delete('/detail/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = await RecordService.deleteRecord(id);
    if (!success) return res.status(404).json({ error: 'Record not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;