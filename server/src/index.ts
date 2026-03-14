import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import configRouter from './routes/config.js';
import processesRouter from './routes/processes.js';
import jiraRouter from './routes/jira.js';
import tempoRouter from './routes/tempo.js';
import { processManager } from './processes.js';
import { ClientMessage } from './types.js';

const PORT = 4000;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// Allow requests from the Vite dev server and the Electron renderer.
// Accept any localhost origin so differing Vite port assignments don't break dev.
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. same-origin requests, Electron file://)
    if (!origin) return cb(null, true);
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return cb(null, true);
    } catch {
      // ignore malformed origins
    }
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));
app.use(express.json());

// In packaged Electron builds, serve the built React client as static files
if (process.env.ELECTRON_STATIC_DIR) {
  app.use(express.static(process.env.ELECTRON_STATIC_DIR));
}

app.use('/api/config', configRouter);
app.use('/api/projects', processesRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/tempo', tempoRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// SPA fallback: serve index.html for any unknown route so React Router works
// Only active in packaged Electron mode where ELECTRON_STATIC_DIR is set
if (process.env.ELECTRON_STATIC_DIR) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(process.env.ELECTRON_STATIC_DIR as string, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server (shared port)
// ---------------------------------------------------------------------------
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  processManager.addClient(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;

      if (msg.type === 'subscribe-output') {
        processManager.subscribeOutput(ws, msg.projectId);
      } else if (msg.type === 'unsubscribe-output') {
        processManager.unsubscribeOutput(ws, msg.projectId);
      } else if (msg.type === 'stdin') {
        processManager.writeInput(msg.projectId, msg.data);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    processManager.removeClient(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    processManager.removeClient(ws);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Proud Lazy server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
