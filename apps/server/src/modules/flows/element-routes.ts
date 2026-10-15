import type { Express, Request, Response, RequestHandler } from 'express';

/** Metadata-driven Flow element discovery shared by builders and runtimes. */
export function registerFlowElementRoutes(app: Express, requirePermission: (permission: string) => RequestHandler): void {
  app.get('/api/metadata/flow-elements', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ elements: [
      { type: 'Screen', group: 'Interaction', allowedFlowTypes: ['Screen Flow'] },
      { type: 'Decision', group: 'Logic' }, { type: 'Assignment', group: 'Logic' },
      { type: 'Loop', group: 'Logic' }, { type: 'Wait', group: 'Logic' },
      { type: 'Collection Filter', group: 'Logic' }, { type: 'Collection Sort', group: 'Logic' },
      { type: 'Transform', group: 'Data' }, { type: 'Roll Back Records', group: 'Data', allowedFlowTypes: ['Screen Flow', 'Autolaunched Flow'] },
      { type: 'Publish Platform Event', group: 'Data' }, { type: 'Get Records', group: 'Data' },
      { type: 'Orchestration Stage', group: 'Interaction' },
      { type: 'Create Records', group: 'Data' }, { type: 'Update Records', group: 'Data' },
      { type: 'Delete Records', group: 'Data' }, { type: 'Action', group: 'Interaction' },
      { type: 'HTTP Callout', group: 'Interaction' }, { type: 'Subflow', group: 'Interaction' }
    ] });
  });
  
}
