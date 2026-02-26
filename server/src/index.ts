import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import configRouter from './routes/config.js';
import processesRouter from './routes/processes.js';
import { processManager } from './processes.js';
import { ClientMessage } from './types.js';

const PORT = 4000;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/config', configRouter);
app.use('/api/projects', processesRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

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
  console.log(`Launch server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
