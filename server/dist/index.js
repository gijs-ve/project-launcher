"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const config_js_1 = __importDefault(require("./routes/config.js"));
const processes_js_1 = __importDefault(require("./routes/processes.js"));
const processes_js_2 = require("./processes.js");
const PORT = 4000;
// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = (0, express_1.default)();
// Allow requests from the Vite dev server and the Electron renderer
const allowedOrigins = [
    'http://localhost:5173',
    `http://localhost:${PORT}`,
];
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        // Allow requests with no origin (e.g. same-origin requests, Electron file://)
        if (!origin || allowedOrigins.includes(origin))
            return cb(null, true);
        cb(new Error(`CORS blocked: ${origin}`));
    },
}));
app.use(express_1.default.json());
// In packaged Electron builds, serve the built React client as static files
if (process.env.ELECTRON_STATIC_DIR) {
    app.use(express_1.default.static(process.env.ELECTRON_STATIC_DIR));
}
app.use('/api/config', config_js_1.default);
app.use('/api/projects', processes_js_1.default);
// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));
// SPA fallback: serve index.html for any unknown route so React Router works
// Only active in packaged Electron mode where ELECTRON_STATIC_DIR is set
if (process.env.ELECTRON_STATIC_DIR) {
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(process.env.ELECTRON_STATIC_DIR, 'index.html'));
    });
}
// ---------------------------------------------------------------------------
// HTTP + WebSocket server (shared port)
// ---------------------------------------------------------------------------
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    processes_js_2.processManager.addClient(ws);
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'subscribe-output') {
                processes_js_2.processManager.subscribeOutput(ws, msg.projectId);
            }
            else if (msg.type === 'unsubscribe-output') {
                processes_js_2.processManager.unsubscribeOutput(ws, msg.projectId);
            }
            else if (msg.type === 'stdin') {
                processes_js_2.processManager.writeInput(msg.projectId, msg.data);
            }
        }
        catch {
            // Ignore malformed messages
        }
    });
    ws.on('close', () => {
        console.log('[WS] Client disconnected');
        processes_js_2.processManager.removeClient(ws);
    });
    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        processes_js_2.processManager.removeClient(ws);
    });
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
    console.log(`Launch server running on http://localhost:${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
