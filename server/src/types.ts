// Shared types used by both server modules and client

export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'errored';

export interface ProjectLink {
  label: string;
  url: string;
  openMode: 'browser' | 'webview';
}

export interface Category {
  id: string;
  name: string;
  color: string;
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
  /** Azure DevOps project name, e.g. "MySolution" */
  adoProject?: string;
  /** ADO git repository name or ID */
  adoRepoId?: string;
  /** Optional category this project belongs to */
  categoryId?: string;
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
}

export interface TempoFavorite {
  id: string;
  label: string;
  ticketKey: string;
  ticketId?: number;
  minutes: number;
}

export interface TempoConfig {
  apiToken: string;
  defaultDescription?: string;
  favorites?: TempoFavorite[];
}

export interface Config {
  projects: Project[];
  links: Link[];
  categories?: Category[];
  codeEditor?: string;
  jira?: JiraCredentials;
  tempo?: TempoConfig;
  /** Persistent cache of Jira numeric issue ID → issue key (e.g. "220130" → "SLODEV-1337") */
  issueKeyCache?: Record<string, string>;
  /** Microsoft Teams Incoming Webhook URL for notifications */
  teamsWebhookUrl?: string;
  /** Azure DevOps integration */
  ado?: AdoConfig;
}

export interface AdoConfig {
  /** e.g. https://dev.azure.com/yourorg */
  orgUrl: string;
  /** Personal Access Token (Code: Read, Pull Request Threads: Read & Write) */
  personalAccessToken: string;
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
