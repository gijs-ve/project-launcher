export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'errored';

export interface ProjectLink {
  label: string;
  url: string;
  openMode: 'browser' | 'webview';
}

export interface Project {
  id: string;
  name: string;
  cwd: string;
  command: string;
  url?: string;
  color: string;
  links?: ProjectLink[];
}

export interface Link {
  id: string;
  label: string;
  url: string;
  openMode: 'browser' | 'webview';
}

export interface Config {
  projects: Project[];
  links: Link[];
}

// WebSocket message types — Server → Client
export type ServerMessage =
  | { type: 'initial-state'; statuses: Record<string, ProjectStatus> }
  | { type: 'status-update'; projectId: string; status: ProjectStatus }
  | { type: 'output'; projectId: string; data: string }
  | { type: 'buffer-replay'; projectId: string; lines: string[] };

// WebSocket message types — Client → Server
export type ClientMessage =
  | { type: 'subscribe-output'; projectId: string }
  | { type: 'unsubscribe-output'; projectId: string }
  | { type: 'stdin'; projectId: string; data: string };
