import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function registerProductionFrontend(app: Express, frontendDist: string): void {
  if (!existsSync(resolve(frontendDist, 'index.html'))) return;
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    if (!req.accepts('html')) return next();
    return res.sendFile(resolve(frontendDist, 'index.html'));
  });
}

export function registerPlatformErrorHandler(app: Express): void {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Platform API request failed', error);
    return res.status(500).json({ error: 'Platform API request failed' });
  });
}
