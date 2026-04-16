import * as pty from 'node-pty';
import { WebSocket } from 'ws';
import { Project, ProjectStatus, ServerMessage } from './types.js';
import { readConfig } from './config.js';

export interface LaunchOptions {
  /** Extra arguments appended to the command string (e.g. "-- --experimental-https") */
  extraArgs?: string;
  /** Additional environment variables merged into the process env */
  envVars?: Record<string, string>;
}

// Maximum number of output lines kept in memory per project
const BUFFER_LIMIT = 500;

interface ProcessEntry {
  pty: pty.IPty;
  status: ProjectStatus;
  /** Rolling output buffer — last BUFFER_LIMIT lines */
  buffer: string[];
  /** Clients subscribed to this project's output */
  subscribers: Set<WebSocket>;
}

class ProcessManager {
  private processes = new Map<string, ProcessEntry>();
  /** All connected WebSocket clients (for status broadcasts) */
  private allClients = new Set<WebSocket>();

  // ---------------------------------------------------------------------------
  // Client registration
  // ---------------------------------------------------------------------------

  addClient(ws: WebSocket): void {
    this.allClients.add(ws);

    // Send the current status of every tracked project on connect
    const statuses: Record<string, ProjectStatus> = {};
    for (const [id, entry] of this.processes) {
      statuses[id] = entry.status;
    }
    this.send(ws, { type: 'initial-state', statuses });
  }

  removeClient(ws: WebSocket): void {
    this.allClients.delete(ws);
    // Remove from all per-project subscriber sets
    for (const entry of this.processes.values()) {
      entry.subscribers.delete(ws);
    }
  }

  // ---------------------------------------------------------------------------
  // Output subscriptions
  // ---------------------------------------------------------------------------

  subscribeOutput(ws: WebSocket, projectId: string): void {
    const entry = this.processes.get(projectId);
    if (!entry) return;

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

  unsubscribeOutput(ws: WebSocket, projectId: string): void {
    this.processes.get(projectId)?.subscribers.delete(ws);
  }

  getLogs(projectId: string, lines = 100): string[] {
    const entry = this.processes.get(projectId);
    if (!entry) return [];
    const limit = Math.min(Math.max(1, lines), 500);
    return entry.buffer.slice(-limit);
  }

  // ---------------------------------------------------------------------------
  // Process lifecycle
  // ---------------------------------------------------------------------------

  start(project: Project, opts?: LaunchOptions): void {
    // If already running, do nothing
    const existing = this.processes.get(project.id);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return;
    }

    this.setStatus(project.id, 'starting');

    // Spawn through the user's login shell so it inherits the full PATH
    // (e.g. NVM, Homebrew, etc.) regardless of how this server was started.
    const shell = process.env.SHELL || '/bin/zsh';

    // Build the effective command, appending any extra args from launch options
    const effectiveCommand = opts?.extraArgs
      ? `${project.command} ${opts.extraArgs}`
      : project.command;

    // Merge extra env vars (e.g. NODE_ENV=production, NODE_OPTIONS=--inspect)
    const effectiveEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(opts?.envVars ?? {}),
    };

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shell, ['-l', '-c', effectiveCommand], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: project.cwd,
        env: effectiveEnv,
      });
    } catch (err) {
      console.error(`[ProcessManager] Failed to spawn ${project.id}:`, err);
      this.setStatus(project.id, 'errored');
      return;
    }

    const entry: ProcessEntry = {
      pty: proc,
      status: 'starting',
      buffer: [],
      // Preserve existing subscribers if the process is being restarted
      subscribers: existing?.subscribers ?? new Set(),
    };
    this.processes.set(project.id, entry);

    // Transition to running on first output — a simple heuristic
    let hasOutput = false;

    proc.onData((data: string) => {
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
      const msg: ServerMessage = { type: 'output', projectId: project.id, data };
      for (const ws of entry.subscribers) {
        this.send(ws, msg);
      }
    });

    proc.onExit(({ exitCode }) => {
      const next: ProjectStatus = exitCode === 0 ? 'stopped' : 'errored';
      this.setStatus(project.id, next);
    });
  }

  stop(projectId: string): void {
    const entry = this.processes.get(projectId);
    if (!entry) return;

    try {
      entry.pty.kill();
    } catch {
      // Process may already be dead
    }
    this.setStatus(projectId, 'stopped');
  }

  restart(project: Project): void {
    this.stop(project.id);
    // Small delay so the port is freed before we re-bind
    setTimeout(() => this.start(project), 600);
  }

  writeInput(projectId: string, data: string): void {
    const entry = this.processes.get(projectId);
    if (entry && (entry.status === 'running' || entry.status === 'starting')) {
      entry.pty.write(data);
    }
  }

  getStatus(projectId: string): ProjectStatus {
    return this.processes.get(projectId)?.status ?? 'stopped';
  }

  getAllStatuses(): Record<string, ProjectStatus> {
    const result: Record<string, ProjectStatus> = {};
    for (const [id, entry] of this.processes) {
      result[id] = entry.status;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private setStatus(projectId: string, status: ProjectStatus): void {
    const entry = this.processes.get(projectId);
    if (entry) {
      entry.status = status;
    }

    // Broadcast the new status to every connected client
    const msg: ServerMessage = { type: 'status-update', projectId, status };
    for (const ws of this.allClients) {
      this.send(ws, msg);
    }

    // Notify Teams channel on notable status changes
    if (status === 'errored' || status === 'running' || status === 'stopped') {
      const cfg = readConfig();
      const statusWebhook = cfg.teamsWebhooks?.['status'] ?? cfg.teamsWebhookUrl;
      if (statusWebhook) {
        const icons: Record<string, string> = { running: '🟢', stopped: '⚪', errored: '🔴' };
        const colors: Record<string, string> = { running: '00B300', stopped: '808080', errored: 'CC0000' };
        const accentColor = colors[status] ?? '808080';
        fetch(statusWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'message',
            attachments: [
              {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: {
                  type: 'AdaptiveCard',
                  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                  version: '1.2',
                  body: [
                    {
                      type: 'TextBlock',
                      size: 'Medium',
                      weight: 'Bolder',
                      color: status === 'errored' ? 'Attention' : status === 'running' ? 'Good' : 'Default',
                      text: `${icons[status] ?? '•'} Proud Lazy: ${projectId} is ${status}`,
                    },
                  ],
                  msteams: { width: 'Full' },
                },
              },
            ],
          }),
        }).catch((err) => console.error('[Teams] webhook error:', err));
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        // Socket closed between the readyState check and the write — remove it
        this.removeClient(ws);
      }
    }
  }
}

// Singleton — shared across route handlers and the WebSocket server
export const processManager = new ProcessManager();
