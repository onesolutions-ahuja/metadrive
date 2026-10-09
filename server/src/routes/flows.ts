import { Router, Request, Response } from 'express';
import { TemporalService } from '../services/temporalService';

const router = Router();

// POST /api/flows/trigger -> Trigger a flow by Object event
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { flow_name, record_id, payload } = req.body;
    if (!flow_name) {
      return res.status(400).json({ error: 'flow_name is required' });
    }
    const workflowId = `flow-${flow_name}-${record_id || Date.now()}`;
    const result = await TemporalService.triggerWorkflow(flow_name, workflowId, [payload]);
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;