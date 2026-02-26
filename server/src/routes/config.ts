import { Router, Request, Response } from 'express';
import { readConfig, writeConfig } from '../config.js';
import { Config } from '../types.js';

const router = Router();

// GET /api/config — return the full config
router.get('/', (_req: Request, res: Response) => {
  res.json(readConfig());
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
