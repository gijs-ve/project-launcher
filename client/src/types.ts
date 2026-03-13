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
  /** Manually saved Jira users that always appear in bulk-assign dropdown. */
  savedAssignees?: JiraUser[];
}

export interface TempoFavorite {
  /** Unique ID (string timestamp). */
  id: string;
  /** Label shown in the quick-log dropdown, e.g. "Stand-up". */
  label: string;
  /** Jira issue key, e.g. "PROJ-42". */
  ticketKey: string;
  /** Resolved numeric Jira issue ID (cached to avoid repeated API calls). */
  ticketId?: number;
  /** Duration in minutes to log on one click. */
  minutes: number;
}

export interface TempoConfig {
  apiToken: string;
  /** Default worklog description used when none is entered (required by Tempo). */
  defaultDescription?: string;
  /** Quick-log favorites: one-click time entries for frequently used tickets. */
  favorites?: TempoFavorite[];
}

export interface Config {
  projects: Project[];
  links: Link[];
  codeEditor?: string;
  jira?: JiraCredentials;
  tempo?: TempoConfig;
  /** Persistent cache of Jira numeric issue ID → issue key (e.g. "220130" → "SLODEV-1337") */
  issueKeyCache?: Record<string, string>;
}

// ── TEMPO types ──────────────────────────────────────────────────────────────

export interface TempoWorklog {
  tempoWorklogId: number;
  issueId: number;
  /** Jira issue key (e.g. "ABC-123"), included when TEMPO returns it or when enriched by server. */
  issueKey?: string;
  timeSpentSeconds: number;
  /** YYYY-MM-DD */
  startDate: string;
  description?: string;
  author: {
    accountId: string;
    displayName?: string;
  };
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
    attachment?: JiraAttachment[];
    /** Original time estimate in seconds (Jira field: timeoriginalestimate) */
    timeoriginalestimate?: number | null;
  };
}

export interface JiraAttachment {
  id: string; // numeric string, e.g. "10042"
  filename: string;
  mimeType: string;
  content: string; // direct download URL
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
