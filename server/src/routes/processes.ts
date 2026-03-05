import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { processManager } from '../processes.js';
import { LaunchOptions } from '../processes.js';
import { readConfig } from '../config.js';

const router = Router();

// GET /api/projects/status — all project statuses
router.get('/status', (_req: Request, res: Response) => {
  res.json(processManager.getAllStatuses());
});

// POST /api/projects/:id/start
router.post('/:id/start', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const project = findProject(id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const opts: LaunchOptions = {
    extraArgs: req.body?.extraArgs ?? undefined,
    envVars: req.body?.envVars ?? undefined,
  };
  processManager.start(project, opts);
  res.json({ ok: true });
});

// POST /api/projects/:id/stop
router.post('/:id/stop', (req: Request, res: Response) => {
  const id = String(req.params.id);
  processManager.stop(id);
  res.json({ ok: true });
});

// POST /api/projects/:id/restart
router.post('/:id/restart', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const project = findProject(id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  processManager.restart(project);
  res.json({ ok: true });
});

// POST /api/projects/:id/open-editor — open project cwd in the configured editor
router.post('/:id/open-editor', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const project = findProject(id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const config = readConfig();
  const editorCmd = (config.codeEditor ?? 'code').trim() || 'code';

  // Split into command + args (e.g. "cursor" or "code --new-window")
  const parts = editorCmd.split(/\s+/);
  const cmd = parts[0];
  const args = [...parts.slice(1), project.cwd];

  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();

  res.json({ ok: true });
});

function findProject(id: string) {
  const config = readConfig();
  return config.projects.find((p) => p.id === id) ?? null;
}

export default router;
