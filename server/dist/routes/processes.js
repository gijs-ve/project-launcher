"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const processes_js_1 = require("../processes.js");
const config_js_1 = require("../config.js");
const router = (0, express_1.Router)();
// GET /api/projects/status — all project statuses
router.get('/status', (_req, res) => {
    res.json(processes_js_1.processManager.getAllStatuses());
});
// POST /api/projects/:id/start
router.post('/:id/start', (req, res) => {
    const id = String(req.params.id);
    const project = findProject(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    processes_js_1.processManager.start(project);
    res.json({ ok: true });
});
// POST /api/projects/:id/stop
router.post('/:id/stop', (req, res) => {
    const id = String(req.params.id);
    processes_js_1.processManager.stop(id);
    res.json({ ok: true });
});
// POST /api/projects/:id/restart
router.post('/:id/restart', (req, res) => {
    const id = String(req.params.id);
    const project = findProject(id);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    processes_js_1.processManager.restart(project);
    res.json({ ok: true });
});
function findProject(id) {
    const config = (0, config_js_1.readConfig)();
    return config.projects.find((p) => p.id === id) ?? null;
}
exports.default = router;
