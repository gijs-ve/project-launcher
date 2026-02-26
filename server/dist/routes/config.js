"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_js_1 = require("../config.js");
const router = (0, express_1.Router)();
// GET /api/config — return the full config
router.get('/', (_req, res) => {
    res.json((0, config_js_1.readConfig)());
});
// PATCH /api/config — replace the full config and persist it
router.patch('/', (req, res) => {
    const incoming = req.body;
    if (!incoming || !Array.isArray(incoming.projects) || !Array.isArray(incoming.links)) {
        res.status(400).json({ error: 'Invalid config shape' });
        return;
    }
    (0, config_js_1.writeConfig)(incoming);
    res.json(incoming);
});
exports.default = router;
