"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processManager = void 0;
const pty = __importStar(require("node-pty"));
const ws_1 = require("ws");
// Maximum number of output lines kept in memory per project
const BUFFER_LIMIT = 500;
class ProcessManager {
    processes = new Map();
    /** All connected WebSocket clients (for status broadcasts) */
    allClients = new Set();
    // ---------------------------------------------------------------------------
    // Client registration
    // ---------------------------------------------------------------------------
    addClient(ws) {
        this.allClients.add(ws);
        // Send the current status of every tracked project on connect
        const statuses = {};
        for (const [id, entry] of this.processes) {
            statuses[id] = entry.status;
        }
        this.send(ws, { type: 'initial-state', statuses });
    }
    removeClient(ws) {
        this.allClients.delete(ws);
        // Remove from all per-project subscriber sets
        for (const entry of this.processes.values()) {
            entry.subscribers.delete(ws);
        }
    }
    // ---------------------------------------------------------------------------
    // Output subscriptions
    // ---------------------------------------------------------------------------
    subscribeOutput(ws, projectId) {
        const entry = this.processes.get(projectId);
        if (!entry)
            return;
        entry.subscribers.add(ws);
        // Replay the buffered output immediately so the client sees past lines
        if (entry.buffer.length > 0) {
            this.send(ws, {
                type: 'buffer-replay',
                projectId,
                lines: [...entry.buffer],
            });
        }
    }
    unsubscribeOutput(ws, projectId) {
        this.processes.get(projectId)?.subscribers.delete(ws);
    }
    // ---------------------------------------------------------------------------
    // Process lifecycle
    // ---------------------------------------------------------------------------
    start(project) {
        // If already running, do nothing
        const existing = this.processes.get(project.id);
        if (existing && (existing.status === 'running' || existing.status === 'starting')) {
            return;
        }
        this.setStatus(project.id, 'starting');
        // Spawn through the user's login shell so it inherits the full PATH
        // (e.g. NVM, Homebrew, etc.) regardless of how this server was started.
        const shell = process.env.SHELL || '/bin/zsh';
        let proc;
        try {
            proc = pty.spawn(shell, ['-l', '-c', project.command], {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd: project.cwd,
                env: process.env,
            });
        }
        catch (err) {
            console.error(`[ProcessManager] Failed to spawn ${project.id}:`, err);
            this.setStatus(project.id, 'errored');
            return;
        }
        const entry = {
            pty: proc,
            status: 'starting',
            buffer: [],
            // Preserve existing subscribers if the process is being restarted
            subscribers: existing?.subscribers ?? new Set(),
        };
        this.processes.set(project.id, entry);
        // Transition to running on first output — a simple heuristic
        let hasOutput = false;
        proc.onData((data) => {
            if (!hasOutput) {
                hasOutput = true;
                this.setStatus(project.id, 'running');
            }
            // Push to circular buffer
            entry.buffer.push(data);
            if (entry.buffer.length > BUFFER_LIMIT) {
                entry.buffer.shift();
            }
            // Broadcast to subscribers
            const msg = { type: 'output', projectId: project.id, data };
            for (const ws of entry.subscribers) {
                this.send(ws, msg);
            }
        });
        proc.onExit(({ exitCode }) => {
            const next = exitCode === 0 ? 'stopped' : 'errored';
            this.setStatus(project.id, next);
        });
    }
    stop(projectId) {
        const entry = this.processes.get(projectId);
        if (!entry)
            return;
        try {
            entry.pty.kill();
        }
        catch {
            // Process may already be dead
        }
        this.setStatus(projectId, 'stopped');
    }
    restart(project) {
        this.stop(project.id);
        // Small delay so the port is freed before we re-bind
        setTimeout(() => this.start(project), 600);
    }
    writeInput(projectId, data) {
        const entry = this.processes.get(projectId);
        if (entry && (entry.status === 'running' || entry.status === 'starting')) {
            entry.pty.write(data);
        }
    }
    getStatus(projectId) {
        return this.processes.get(projectId)?.status ?? 'stopped';
    }
    getAllStatuses() {
        const result = {};
        for (const [id, entry] of this.processes) {
            result[id] = entry.status;
        }
        return result;
    }
    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------
    setStatus(projectId, status) {
        const entry = this.processes.get(projectId);
        if (entry) {
            entry.status = status;
        }
        // Broadcast the new status to every connected client
        const msg = { type: 'status-update', projectId, status };
        for (const ws of this.allClients) {
            this.send(ws, msg);
        }
    }
    send(ws, msg) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(msg));
            }
            catch (err) {
                // Socket closed between the readyState check and the write — remove it
                this.removeClient(ws);
            }
        }
    }
}
// Singleton — shared across route handlers and the WebSocket server
exports.processManager = new ProcessManager();
