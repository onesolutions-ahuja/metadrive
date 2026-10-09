import { Router, Request, Response } from 'express';
import { MetadataService } from '../services/metadataService';

const router = Router();

// POST /api/metadata/objects
router.post('/objects', async (req: Request, res: Response) => {
  try {
    const { api_name, label, plural_label } = req.body;
    if (!api_name || !label || !plural_label) {
      return res.status(400).json({ error: 'api_name, label, and plural_label are required' });
    }
    const newObject = await MetadataService.createObject({ api_name, label, plural_label });
    return res.status(201).json(newObject);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/metadata/objects
router.get('/objects', async (req: Request, res: Response) => {
  try {
    const objects = await MetadataService.getAllObjects();
    return res.json(objects);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/metadata/fields
router.post('/fields', async (req: Request, res: Response) => {
  try {
    const { object_id, api_name, label, field_type, is_required } = req.body;
    if (!object_id || !api_name || !label || !field_type) {
      return res.status(400).json({ error: 'object_id, api_name, label, and field_type are required' });
    }
    const newField = await MetadataService.createField({ object_id, api_name, label, field_type, is_required });
    return res.status(201).json(newField);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/metadata/objects/:objectId/fields
router.get('/objects/:objectId/fields', async (req: Request, res: Response) => {
  try {
    const objectId = parseInt(req.params.objectId, 10);
    const fields = await MetadataService.getFieldsByObjectId(objectId);
    return res.json(fields);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;