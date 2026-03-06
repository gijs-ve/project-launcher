import { Router, Request, Response } from 'express';
import { readConfig, writeConfig } from '../config.js';
import { Config } from '../types.js';

const router = Router();

// GET /api/config — return the full config
router.get('/', (_req: Request, res: Response) => {
  res.json(readConfig());
});

// GET /api/config/export — download the config as a .gizzyb file
router.get('/export', (_req: Request, res: Response) => {
  const config = readConfig();
  const json = JSON.stringify(config, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="launch.config.gizzyb"');
  res.send(json);
});

// POST /api/config/import — validate and apply an uploaded config
router.post('/import', (req: Request, res: Response) => {
  const incoming = req.body as Config;

  if (!incoming || !Array.isArray(incoming.projects) || !Array.isArray(incoming.links)) {
    res.status(400).json({ error: 'Invalid .gizzyb file: missing projects or links array' });
    return;
  }

  writeConfig(incoming);
  res.json(incoming);
});

// PATCH /api/config — replace the full config and persist it
router.patch('/', (req: Request, res: Response) => {
  const incoming = req.body as Config;

  if (!incoming || !Array.isArray(incoming.projects) || !Array.isArray(incoming.links)) {
    res.status(400).json({ error: 'Invalid config shape' });
    return;
  }

  writeConfig(incoming);
  res.json(incoming);
});

export default router;
