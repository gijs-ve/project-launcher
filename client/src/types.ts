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
  jiraBoardUrl?: string;
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
  /** Base URL shared by all projects, e.g. https://yourcompany.atlassian.net */
  baseUrl?: string;
  /**
   * Target status name used by the bulk transition action on the project detail
   * view (e.g. "In Review", "In Progress", "Done").  The app will automatically
   * chain through intermediate steps if a direct transition is not available.
   */
  bulkTransitionStatus?: string;
}

export interface Config {
  projects: Project[];
  links: Link[];
  codeEditor?: string;
  jira?: JiraCredentials;
}

// ── Jira types ──────────────────────────────────────────────────────────────

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    assignee: JiraUser | null;
    priority: { name: string; iconUrl?: string } | null;
    issuetype: { name: string; iconUrl?: string } | null;
    reporter?: JiraUser | null;
    labels?: string[];
    created?: string;
    updated?: string;
    description?: AdfNode | null;
    comment?: { comments: JiraComment[] };
  };
}

export interface JiraComment {
  id: string;
  author: JiraUser;
  body: AdfNode;
  created: string;
  updated: string;
}

/** Atlassian Document Format node (simplified) */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
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
