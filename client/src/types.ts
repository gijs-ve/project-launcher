export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'errored';

export interface LaunchOptions {
  /** Extra arguments appended to the command (e.g. "-- --experimental-https") */
  extraArgs?: string;
  /** Additional env vars merged into the process environment */
  envVars?: Record<string, string>;
}

/** A predefined modified-launch option shown in the Start dropdown */
export interface LaunchPreset {
  label: string;
  description: string;
  options: LaunchOptions;
}

export const LAUNCH_PRESETS: LaunchPreset[] = [
  {
    label: 'HTTPS',
    description: '--experimental-https',
    options: { extraArgs: '-- --experimental-https' },
  },
  {
    label: 'Debug',
    description: 'Attach Node.js debugger (--inspect)',
    options: { envVars: { NODE_OPTIONS: '--inspect' } },
  },
  {
    label: 'Expose to network',
    description: '--host (LAN / mobile access)',
    options: { extraArgs: '-- --host' },
  },
  {
    label: 'Production mode',
    description: 'NODE_ENV=production',
    options: { envVars: { NODE_ENV: 'production' } },
  },
];

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
  jiraBaseUrl?: string;
  jiraProjectKeys?: string[];
}

export interface Link {
  id: string;
  label: string;
  url: string;
  openMode: 'browser' | 'webview';
}

export interface JiraCredentials {
  email: string;
  apiToken: string;
}

export interface Config {
  projects: Project[];
  links: Link[];
  codeEditor?: string;
  jira?: JiraCredentials;
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
