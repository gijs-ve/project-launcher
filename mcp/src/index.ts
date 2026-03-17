import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH =
  process.env.LAUNCH_CONFIG_PATH ??
  path.resolve(__dirname, '..', '..', 'launch.config.gizzyb');

const LAUNCH_SERVER = process.env.LAUNCH_SERVER_URL ?? 'http://localhost:4000';
const SNAPSHOT_PATH = path.resolve(path.dirname(CONFIG_PATH), 'launch.sprint-snapshot.json');

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

interface IssueSnap {
  key: string; summary: string; status: string; assignee: string; priority: string; type: string; project: string;
}
interface SprintSnapshot {
  savedAt: string;
  issues: IssueSnap[];
  statsByProject: Record<string, number>;
  statsByStatus: Record<string, number>;
  statsByAssignee: Record<string, number>;
}

function loadSnapshot(): SprintSnapshot | null {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as SprintSnapshot; }
  catch { return null; }
}

function saveSnapshot(snap: SprintSnapshot): void {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2), 'utf-8');
}

interface JiraCredentials { email: string; apiToken: string; baseUrl?: string }
interface ProjectLink { label: string; url: string; openMode?: string }
interface Project { id: string; name: string; cwd: string; command: string; color: string; url?: string; jiraProjectKeys?: string[]; links?: ProjectLink[]; adoProject?: string; adoRepoId?: string }
interface AdoConfig { orgUrl: string; personalAccessToken: string }
interface Config { projects: Project[]; jira?: JiraCredentials; tempo?: { apiToken: string }; teamsWebhookUrl?: string; ado?: AdoConfig }

function adoCtx() {
  const cfg = readConfig();
  if (!cfg.ado?.orgUrl || !cfg.ado?.personalAccessToken)
    throw new Error('No Azure DevOps config found. Add "ado": { "orgUrl": "...", "personalAccessToken": "..." } to launch.config.gizzyb');
  const orgUrl = cfg.ado.orgUrl.replace(/\/+$/, '');
  const auth = Buffer.from(`:${cfg.ado.personalAccessToken}`).toString('base64');
  return { orgUrl, auth };
}

async function adoFetch(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const { auth } = adoCtx();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(`ADO ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Config;
  } catch {
    return { projects: [] };
  }
}

function writeConfig(cfg: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

function jiraCtx() {
  const cfg = readConfig();
  const creds = cfg.jira;
  if (!creds?.email || !creds?.apiToken) throw new Error('No Jira credentials configured');
  const baseUrl = creds.baseUrl?.replace(/\/+$/, '');
  if (!baseUrl) throw new Error('No Jira base URL configured');
  const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
  return { baseUrl, auth };
}

function tempoToken() {
  const cfg = readConfig();
  const token = cfg.tempo?.apiToken;
  if (!token) throw new Error('No Tempo API token configured');
  return token;
}

/** Convert plain text to Atlassian Document Format (ADF) */
/** Parse inline Markdown spans into ADF inline nodes (bold, inline code, links). */
function parseInlineAdf(text: string): unknown[] {
  const nodes: unknown[] = [];
  // Matches: `code`, {{code}}, **bold**, *bold*, [label](url)
  const regex = /(`[^`\n]+`|\{\{[^}\n]+\}\}|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\n]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'code' }] });
    } else if (token.startsWith('{{') && token.endsWith('}}')) {
      nodes.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'code' }] });
    } else if (token.startsWith('**')) {
      nodes.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'strong' }] });
    } else if (token.startsWith('*')) {
      nodes.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'strong' }] });
    } else if (match[4] && match[5]) {
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'link', attrs: { href: match[5] } }] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push({ type: 'text', text: text.slice(lastIndex) });
  return nodes.length > 0 ? nodes : [{ type: 'text', text }];
}

/**
 * Convert a Markdown string into an Atlassian Document Format (ADF) doc node.
 * Supports: # headings, - /* bullet lists, 1. ordered lists, **bold**, *bold*,
 * `inline code`, {{inline code}}, [label](url), paragraphs.
 */
function textToAdf(text: string) {
  const lines = text.split('\n');
  const content: unknown[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings: ## Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: Math.min(headingMatch[1].length, 6) },
        content: parseInlineAdf(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      content.push({ type: 'rule' });
      i++;
      continue;
    }

    // Bullet list: - item or * item
    if (/^[\*\-]\s/.test(line)) {
      const items: unknown[] = [];
      while (i < lines.length && /^[\*\-]\s/.test(lines[i])) {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineAdf(lines[i].replace(/^[\*\-]\s+/, '')) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s/.test(line)) {
      const items: unknown[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineAdf(lines[i].replace(/^\d+\.\s+/, '')) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Fenced code block: ```
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      const codeAttrs: Record<string, string> = {};
      if (lang) codeAttrs.language = lang;
      content.push({ type: 'codeBlock', attrs: codeAttrs, content: [{ type: 'text', text: codeLines.join('\n') }] });
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph — collect consecutive non-special lines
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[\*\-]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !lines[i].trimStart().startsWith('```')
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      content.push({ type: 'paragraph', content: parseInlineAdf(paragraphLines.join(' ')) });
    }
  }

  return {
    type: 'doc',
    version: 1,
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
  };
}

async function jiraFetch(path: string, init?: RequestInit) {
  const { baseUrl, auth } = jiraCtx();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 300)}`);
  }
  // 204 No Content — return empty object
  if (res.status === 204) return {};
  return res.json();
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'oracle', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Tool list
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // — Projects / processes —
    {
      name: 'list_projects',
      description: 'List all projects configured in the Proud Lazy app.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_project_statuses',
      description: 'Get the running status (stopped/starting/running/errored) of all projects from the Proud Lazy server.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'start_project',
      description: 'Start a project managed by the Proud Lazy app.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID (from list_projects).' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'stop_project',
      description: 'Stop a running project managed by the Proud Lazy app.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID (from list_projects).' },
        },
        required: ['projectId'],
      },
    },

    // — Jira —
    {
      name: 'jira_get_my_user',
      description: 'Return the authenticated Jira user (accountId, displayName, emailAddress).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'jira_get_sprint_issues',
      description: 'Get active-sprint issues for a project. Falls back to all open issues on Kanban boards.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Proud Lazy project ID used to look up Jira project keys.' },
          maxResults: { type: 'number', description: 'Max number of issues to return (default 20).' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'jira_search_issues',
      description: 'Search Jira issues using a JQL query.',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'JQL query string, e.g. "assignee = currentUser() AND status != Done".' },
          maxResults: { type: 'number', description: 'Max number of issues to return (default 20).' },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Jira field names to include (default: summary, status, assignee, priority, issuetype).',
          },
        },
        required: ['jql'],
      },
    },
    {
      name: 'jira_get_issue',
      description: 'Fetch full details of a Jira issue including description, comments, and attachments.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
        },
        required: ['issueKey'],
      },
    },
    {
      name: 'jira_get_transitions',
      description: 'List the available workflow transitions for a Jira issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
        },
        required: ['issueKey'],
      },
    },
    {
      name: 'jira_transition_issue',
      description: 'Move a Jira issue to a new status by applying a transition.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          transitionId: { type: 'string', description: 'Transition ID from jira_get_transitions.' },
        },
        required: ['issueKey', 'transitionId'],
      },
    },
    {
      name: 'jira_add_comment',
      description: 'Add a comment to a Jira issue. Comments are ALWAYS posted as internal (visible to Developers role only) by default. Only set public: true when the user explicitly asks for a public comment. The body supports Markdown: ## headings, **bold**, `inline code`, ``` code blocks, - bullet lists, 1. ordered lists, [label](url) links.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          body: { type: 'string', description: 'Comment body in Markdown. Supports ## headings, **bold**, `code`, ``` fenced code blocks, - bullet lists, 1. ordered lists, [label](url) links.' },
          public: { type: 'boolean', description: 'ONLY set to true when the user explicitly requests a public comment. Default is false — comments are internal (Developers role only).' },
        },
        required: ['issueKey', 'body'],
      },
    },
    {
      name: 'jira_edit_comment',
      description: 'Edit an existing comment on a Jira issue. Comments are ALWAYS posted as internal (visible to Developers role only) by default. Only set public: true when the user explicitly asks for a public comment. The body supports Markdown: ## headings, **bold**, `inline code`, ``` code blocks, - bullet lists, 1. ordered lists, [label](url) links.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          commentId: { type: 'string', description: 'ID of the comment to edit (visible on the comment object from jira_get_issue).' },
          body: { type: 'string', description: 'New comment body in Markdown. Supports ## headings, **bold**, `code`, ``` fenced code blocks, - bullet lists, 1. ordered lists, [label](url) links.' },
          public: { type: 'boolean', description: 'ONLY set to true when the user explicitly requests a public comment. Default is false — comments are internal (Developers role only).' },
        },
        required: ['issueKey', 'commentId', 'body'],
      },
    },
    {
      name: 'jira_delete_comment',
      description: 'Delete a comment from a Jira issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          commentId: { type: 'string', description: 'ID of the comment to delete.' },
        },
        required: ['issueKey', 'commentId'],
      },
    },

    // — Tempo —
    {
      name: 'tempo_get_worklogs',
      description: 'Fetch Tempo worklogs for a given Jira issue. Provide either issueKey (e.g. "SLODEV-383") or the numeric issueId.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "SLODEV-383". Preferred over issueId.' },
          issueId: { type: 'string', description: 'Numeric Jira issue ID. Use issueKey instead when possible.' },
        },
        required: [],
      },
    },
    {
      name: 'teams_send_message',
      description: 'Send a message to the configured Microsoft Teams channel via an Incoming Webhook.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Message body (supports Markdown).' },
          title: { type: 'string', description: 'Optional bold title shown above the message.' },
          color: { type: 'string', description: 'Optional hex accent color, e.g. "0078D4" (blue). Defaults to Proud Lazy brand pink.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'tempo_log_time',
      description: 'Log time against a Jira issue via Tempo. Provide either issueKey (e.g. "SLODEV-383") or the numeric issueId.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "SLODEV-383". Preferred over issueId.' },
          issueId: { type: 'number', description: 'Numeric Jira issue ID. Use issueKey instead when possible.' },
          timeSpentSeconds: { type: 'number', description: 'Duration in seconds.' },
          startDate: { type: 'string', description: 'Date of the worklog in YYYY-MM-DD format.' },
          startTime: { type: 'string', description: 'Start time in HH:MM:SS format (optional).' },
          description: { type: 'string', description: 'Optional worklog description.' },
        },
        required: ['timeSpentSeconds', 'startDate'],
      },
    },

    // — Sprint snapshot + diff —
    {
      name: 'get_sprint_snapshot',
      description: 'Fetch open issues across all projects, compute stats, and compare against the previous saved snapshot. Returns current highlights PLUS a full changelog (new issues, resolved issues, status changes, reassignments) since the last call. Saves the result automatically for the next comparison.',
      inputSchema: {
        type: 'object',
        properties: {
          assigneeFilter: { type: 'string', description: 'Filter by accountId or "currentUser()" to limit results to one person.' },
          maxResults: { type: 'number', description: 'Max issues to fetch (default 200).' },
        },
        required: [],
      },
    },

    // — Standup —
    {
      name: 'get_standup_message',
      description: 'Generate a ready-to-paste daily standup message. Runs a full sprint snapshot (and saves it for future diffs), fetches your Tempo worklogs from the previous business day(s), and composes Yesterday / Today / Blockers / Sprint-changes sections scoped to the current Jira user.',
      inputSchema: {
        type: 'object',
        properties: {
          lookbackDays: { type: 'number', description: 'Business days of Tempo worklogs to pull for the "Yesterday" section (default 1).' },
        },
        required: [],
      },
    },

    // — Sprint overview —
    {
      name: 'get_sprint_overview',
      description: 'Fetch open Jira issues across ALL configured projects, grouped by Jira project key. Ideal for a cross-project standup view.',
      inputSchema: {
        type: 'object',
        properties: {
          assigneeFilter: { type: 'string', description: 'Filter by accountId or "currentUser()" to see only a specific person\'s issues.' },
          maxResults: { type: 'number', description: 'Max issues to return (default 100).' },
        },
        required: [],
      },
    },
    {
      name: 'get_process_logs',
      description: 'Retrieve recent stdout/stderr output lines from a running (or previously run) project process.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID (from list_projects).' },
          lines: { type: 'number', description: 'Number of most-recent lines to return (default 100, max 500).' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'project_health_check',
      description: 'Ping every configured project URL and report which are up or down. Quick check for "is everything running?".',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'add_project',
      description: 'Add a new project to the Proud Lazy app config. Validates the directory, optionally runs install (auto-detects pnpm/yarn/npm), then writes the project to launch.config.gizzyb.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique identifier in kebab-case, e.g. "my-project". Must not already exist.' },
          name: { type: 'string', description: 'Human-readable display name shown in the Proud Lazy UI.' },
          cwd: { type: 'string', description: 'Absolute path to the project directory on disk.' },
          command: { type: 'string', description: 'Dev command, e.g. "pnpm dev -p 3006" or "npm run dev".' },
          url: { type: 'string', description: 'Local URL the project runs on, e.g. "http://localhost:3006". Auto-generated from port if omitted.' },
          port: { type: 'number', description: 'Shorthand: sets url to http://localhost:{port}. Ignored if url is also provided.' },
          color: { type: 'string', description: 'Hex accent color, e.g. "#6366F1". A palette color is picked automatically if omitted.' },
          jiraProjectKeys: { type: 'array', items: { type: 'string' }, description: 'Jira project keys to associate, e.g. ["MYPROJ"].' },
          links: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Link label shown in the UI.' },
                url: { type: 'string', description: 'The URL to open.' },
                openMode: { type: 'string', description: '"browser" (default) or "app".' },
              },
              required: ['label', 'url'],
            },
            description: 'Quick-access links shown in the project panel, e.g. staging URL or Umbraco admin.',
          },
          install: { type: 'boolean', description: 'Run install before adding the project. Auto-detects pnpm/yarn/npm from lock files. Default: false.' },
          installCommand: { type: 'string', description: 'Override the auto-detected install command, e.g. "npm ci" or "pnpm install --frozen-lockfile".' },
        },
        required: ['id', 'name', 'cwd', 'command'],
      },
    },
    {
      name: 'remove_project',
      description: 'Remove a project from the Proud Lazy app config by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The project ID to remove (from list_projects).' },
        },
        required: ['id'],
      },
    },

    // — Git —
    {
      name: 'git_current_branch',
      description: 'Show the current git branch for every configured project that has a git repo. Also extracts any Jira issue key embedded in the branch name (e.g. feature/SNDEV-19-something → SNDEV-19).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'git_status',
      description: 'Show git status (staged, unstaged, untracked) for one or all configured projects.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Limit to a single project. Omit for all projects.' },
        },
        required: [],
      },
    },
    {
      name: 'git_log',
      description: 'Return the last N commits for a project (or all projects) with hash, author, date, and message.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Limit to one project. Omit for all.' },
          count: { type: 'number', description: 'Number of commits to return (default 10, max 50).' },
        },
        required: [],
      },
    },

    // — Jira write —
    {
      name: 'jira_create_issue',
      description: 'Create a new Jira issue. Returns the new issue key and URL.',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { type: 'string', description: 'Jira project key, e.g. "SNDEV".' },
          summary: { type: 'string', description: 'Issue title/summary.' },
          issueType: { type: 'string', description: 'Issue type name, e.g. "Story", "Bug", "Task" (default: "Task").' },
          description: { type: 'string', description: 'Plain-text description (converted to ADF automatically).' },
          assigneeAccountId: { type: 'string', description: 'Jira accountId to assign. Omit to leave unassigned.' },
          priority: { type: 'string', description: 'Priority name, e.g. "High", "Medium", "Low".' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply.' },
          parentKey: { type: 'string', description: 'Parent issue key (for sub-tasks or child issues).' },
        },
        required: ['projectKey', 'summary'],
      },
    },

    // — Jira users —
    {
      name: 'jira_lookup_user',
      description: 'Search for Jira users by name or email address. Returns accountId, displayName, and emailAddress for each match.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name or email to search for, e.g. "Sjoerd" or "sjoerd@example.com".' },
          maxResults: { type: 'number', description: 'Maximum number of results to return (default 10).' },
        },
        required: ['query'],
      },
    },

    // — Jira assign —
    {
      name: 'jira_assign_issue',
      description: 'Assign a Jira issue to a user by accountId.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          assigneeAccountId: { type: 'string', description: 'The Jira accountId of the user to assign.' },
        },
        required: ['issueKey', 'assigneeAccountId'],
      },
    },
    {
      name: 'jira_assign_to_test',
      description: 'Transition a Jira issue to the nearest "Ready for Test" status, assign it to a tester, and post a test comment — all in one action.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          assigneeAccountId: { type: 'string', description: 'The Jira accountId of the tester to assign.' },
          testUrl: { type: 'string', description: 'URL where the feature can be tested.' },
          testInstructions: { type: 'string', description: 'Instructions for the tester.' },
        },
        required: ['issueKey', 'assigneeAccountId'],
      },
    },

    // — Tempo extras —
    {
      name: 'tempo_update_worklog',
      description: 'Update an existing Tempo worklog by its tempoWorklogId. Use this to fix the description, adjust time spent, or change the date. Requires the worklog ID (from tempo_get_worklogs), issueId, and the full set of worklog fields (Tempo requires all fields on PUT).',
      inputSchema: {
        type: 'object',
        properties: {
          tempoWorklogId: { type: 'number', description: 'The numeric Tempo worklog ID to update.' },
          issueId: { type: 'number', description: 'Numeric Jira issue ID the worklog belongs to.' },
          issueKey: { type: 'string', description: 'Jira issue key (e.g. "SLODEV-383"). Used to resolve issueId if issueId is not provided.' },
          timeSpentSeconds: { type: 'number', description: 'Duration in seconds.' },
          startDate: { type: 'string', description: 'Date of the worklog in YYYY-MM-DD format.' },
          description: { type: 'string', description: 'New worklog description.' },
        },
        required: ['tempoWorklogId', 'timeSpentSeconds', 'startDate'],
      },
    },
    {
      name: 'tempo_get_my_teams',
      description: 'List the Tempo teams the current user is a member of. Returns teamId and name. Use teamId with tempo_team_hours to get reliable team-wide worklogs.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'tempo_week_summary',
      description: 'Total hours logged per day and per Jira project key for the current or previous week. Defaults to the current Jira user; pass accountId to check another team member.',
      inputSchema: {
        type: 'object',
        properties: {
          week: { type: 'string', description: '"current" (default) or "previous".' },
          accountId: { type: 'string', description: 'Jira accountId to check. Omit for yourself.' },
        },
        required: [],
      },
    },
    {
      name: 'tempo_missing_days',
      description: 'List working days with zero Tempo time logged within a date range. Defaults to the current Jira user; pass accountId to check another team member.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date YYYY-MM-DD (default: start of current month).' },
          to: { type: 'string', description: 'End date YYYY-MM-DD (default: today).' },
          accountId: { type: 'string', description: 'Jira accountId to check. Omit for yourself.' },
        },
        required: [],
      },
    },
    {
      name: 'tempo_team_hours',
      description: 'Fetch logged hours for a Tempo team (by teamId) or a list of accountIds over a date range. Using teamId is the reliable approach — it returns all members\'s worklogs in one call without permission issues. Returns per-person totals and missing weekdays.',
      inputSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'number', description: 'Tempo team ID (from tempo_get_my_teams). Preferred over accountIds.' },
          accountIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fallback: list of Jira accountIds to query individually. Use teamId instead when possible.',
          },
          from: { type: 'string', description: 'Start date YYYY-MM-DD (default: start of current week).' },
          to: { type: 'string', description: 'End date YYYY-MM-DD (default: today).' },
        },
        required: [],
      },
    },

    // — Azure DevOps —
    {
      name: 'ado_list_my_prs',
      description: 'List all active pull requests you authored or are reviewing across all configured ADO repos.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '"active" (default), "completed", or "abandoned".' },
        },
        required: [],
      },
    },
    {
      name: 'ado_get_pr',
      description: 'Get full details for a single ADO pull request: description, reviewers, CI status, and top-level comments.',
      inputSchema: {
        type: 'object',
        properties: {
          adoProject: { type: 'string', description: 'ADO project name, e.g. "MySolution". Uses first configured adoProject if omitted.' },
          repoId: { type: 'string', description: 'Repository name or ID. Uses first configured adoRepoId if omitted.' },
          prId: { type: 'number', description: 'Pull request ID.' },
        },
        required: ['prId'],
      },
    },
    {
      name: 'ado_create_pr',
      description: 'Create a pull request in an ADO repo. Auto-fills title from the Jira issue key found in the current branch name.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Proud Lazy project ID (from list_projects). Used to resolve adoProject/adoRepoId and the current git branch.' },
          title: { type: 'string', description: 'PR title. Auto-generated from branch Jira key if omitted.' },
          description: { type: 'string', description: 'PR description body (Markdown).' },
          targetBranch: { type: 'string', description: 'Target branch to merge into (default: "main").' },
          draft: { type: 'boolean', description: 'Mark as draft PR (default: false).' },
          workItemIds: { type: 'array', items: { type: 'number' }, description: 'ADO work item IDs to link.' },
          autoComplete: { type: 'boolean', description: 'Enable auto-complete on approval (default: false).' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'ado_link_pr_to_jira',
      description: 'Post a Jira comment on the linked Jira issue with the ADO PR URL, so both sides have cross-references.',
      inputSchema: {
        type: 'object',
        properties: {
          jiraKey: { type: 'string', description: 'Jira issue key, e.g. "SNDEV-19".' },
          prUrl: { type: 'string', description: 'Full ADO PR URL.' },
          prTitle: { type: 'string', description: 'PR title to include in the Jira comment.' },
        },
        required: ['jiraKey', 'prUrl'],
      },
    },
    {
      name: 'ado_list_prs',
      description: 'List pull requests across all configured ADO repositories. Unlike ado_list_my_prs this is NOT filtered to the current user — use creatorName to find a specific colleague\'s PRs (partial, case-insensitive match on display name).',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '"active" (default), "completed", "abandoned", or "all".' },
          creatorName: { type: 'string', description: 'Partial, case-insensitive match on the PR author\'s display name, e.g. "davey".' },
          reviewerName: { type: 'string', description: 'Partial, case-insensitive match on a reviewer\'s display name to filter PRs where that person is a reviewer.' },
        },
        required: [],
      },
    },
    {
      name: 'ado_add_pr_comment',
      description: 'Add a top-level review comment (new thread) to an ADO pull request.',
      inputSchema: {
        type: 'object',
        properties: {
          prId: { type: 'number', description: 'Pull request ID.' },
          content: { type: 'string', description: 'Comment text (plain text / Markdown).' },
          adoProject: { type: 'string', description: 'ADO project name. Uses first configured adoProject if omitted.' },
          repoId: { type: 'string', description: 'Repository name or ID. Uses first configured adoRepoId if omitted.' },
        },
        required: ['prId', 'content'],
      },
    },
    {
      name: 'ado_vote_pr',
      description: 'Cast a vote on an ADO pull request as the authenticated user (the owner of the PAT token).',
      inputSchema: {
        type: 'object',
        properties: {
          prId: { type: 'number', description: 'Pull request ID.' },
          vote: { type: 'string', description: '"approve", "approve-with-suggestions", "reject", "wait", or "reset" (removes vote).' },
          adoProject: { type: 'string', description: 'ADO project name. Uses first configured adoProject if omitted.' },
          repoId: { type: 'string', description: 'Repository name or ID. Uses first configured adoRepoId if omitted.' },
        },
        required: ['prId', 'vote'],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {

      // ── Projects / processes ──────────────────────────────────────────────

      case 'list_projects': {
        const { projects } = readConfig();
        return ok(projects.map(({ id, name: n, cwd, color, jiraProjectKeys }) =>
          ({ id, name: n, cwd, color, jiraProjectKeys })));
      }

      case 'get_project_statuses': {
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/status`);
        if (!res.ok) throw new Error(`Proud Lazy server ${res.status}`);
        return ok(await res.json());
      }

      case 'start_project': {
        const { projectId } = args as { projectId: string };
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/${encodeURIComponent(projectId)}/start`, { method: 'POST' });
        if (!res.ok) throw new Error(`Proud Lazy server ${res.status}`);
        return ok({ started: projectId });
      }

      case 'stop_project': {
        const { projectId } = args as { projectId: string };
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/${encodeURIComponent(projectId)}/stop`, { method: 'POST' });
        if (!res.ok) throw new Error(`Proud Lazy server ${res.status}`);
        return ok({ stopped: projectId });
      }

      // ── Jira — user ───────────────────────────────────────────────────────

      case 'jira_get_my_user': {
        const data = await jiraFetch('/rest/api/3/myself');
        return ok({ accountId: data.accountId, displayName: data.displayName, emailAddress: data.emailAddress });
      }

      // ── Jira — issues ─────────────────────────────────────────────────────

      case 'jira_get_sprint_issues': {
        const { projectId, maxResults = 20 } = args as { projectId: string; maxResults?: number };
        const cfg = readConfig();
        const project = cfg.projects.find((p) => p.id === projectId);
        if (!project) throw new Error(`Project '${projectId}' not found`);
        const keys = project.jiraProjectKeys ?? [];
        if (!keys.length) throw new Error('Project has no Jira project keys configured');

        const keyList = keys.map((k) => `"${k}"`).join(', ');
        const fields = ['summary', 'status', 'assignee', 'priority', 'issuetype'];

        let data = await jiraFetch('/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({
            jql: `project in (${keyList}) AND sprint in openSprints() ORDER BY updated DESC`,
            fields,
            maxResults,
          }),
        }).catch(() => null);

        if (!data) {
          data = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            body: JSON.stringify({
              jql: `project in (${keyList}) AND statusCategory != Done ORDER BY updated DESC`,
              fields,
              maxResults,
            }),
          });
        }

        return ok({ issues: data.issues ?? [] });
      }

      case 'jira_search_issues': {
        const { jql, maxResults = 20, fields = ['summary', 'status', 'assignee', 'priority', 'issuetype'] } =
          args as { jql: string; maxResults?: number; fields?: string[] };
        const data = await jiraFetch('/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({ jql, fields, maxResults }),
        });
        return ok({ issues: data.issues ?? [] });
      }

      case 'jira_get_issue': {
        const { issueKey } = args as { issueKey: string };
        const fields = 'summary,status,assignee,priority,issuetype,description,labels,created,updated,reporter,comment,attachment';
        const data = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`);
        return ok({ issue: data });
      }

      // ── Jira — transitions ────────────────────────────────────────────────

      case 'jira_get_transitions': {
        const { issueKey } = args as { issueKey: string };
        const data = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
        return ok({ transitions: data.transitions ?? [] });
      }

      case 'jira_transition_issue': {
        const { issueKey, transitionId } = args as { issueKey: string; transitionId: string };
        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
          method: 'POST',
          body: JSON.stringify({ transition: { id: transitionId } }),
        });
        return ok({ ok: true });
      }

      // ── Jira — comments ───────────────────────────────────────────────────

      case 'jira_add_comment': {
        const { issueKey, body, public: isPublic = false } = args as { issueKey: string; body: string; public?: boolean };
        const payload: Record<string, unknown> = { body: textToAdf(body) };
        if (!isPublic) payload.visibility = { type: 'role', value: 'Developers' };
        const data = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        return ok({ commentId: data.id, created: data.created });
      }

      case 'jira_edit_comment': {
        const { issueKey, commentId, body, public: isPublic = false } = args as { issueKey: string; commentId: string; body: string; public?: boolean };
        const editPayload: Record<string, unknown> = { body: textToAdf(body) };
        if (!isPublic) editPayload.visibility = { type: 'role', value: 'Developers' };
        const data = await jiraFetch(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
          {
            method: 'PUT',
            body: JSON.stringify(editPayload),
          },
        );
        return ok({ commentId: data.id, updated: data.updated });
      }

      case 'jira_delete_comment': {
        const { issueKey, commentId } = args as { issueKey: string; commentId: string };
        await jiraFetch(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
          { method: 'DELETE' },
        );
        return ok({ deleted: true, commentId });
      }

      // ── Tempo ─────────────────────────────────────────────────────────────

      // ── Teams ─────────────────────────────────────────────────────────────

      case 'teams_send_message': {
        const { text, title } = args as { text: string; title?: string; color?: string };
        const cfg = readConfig();
        const webhookUrl = cfg.teamsWebhookUrl;
        if (!webhookUrl) throw new Error('No teamsWebhookUrl configured in launch.config.gizzyb');
        const bodyBlocks: unknown[] = [];
        if (title) bodyBlocks.push({ type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: title });
        bodyBlocks.push({ type: 'TextBlock', text, wrap: true });
        const res = await fetch(webhookUrl, {
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
                  body: bodyBlocks,
                  msteams: { width: 'Full' },
                },
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`Teams webhook error ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok({ sent: true });
      }

      case 'tempo_get_worklogs': {
        let { issueId, issueKey: wlIssueKey } = args as { issueId?: string; issueKey?: string };
        if (!issueId && !wlIssueKey) throw new Error('Provide either issueKey (e.g. "SLODEV-383") or issueId.');
        if (wlIssueKey && !issueId) {
          const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(wlIssueKey)}?fields=summary`);
          issueId = String(issueData.id);
        }
        if (!/^\d+$/.test(issueId!)) throw new Error('issueId must be a positive integer');
        const token = tempoToken();
        const res = await fetch(`https://api.tempo.io/4/worklogs?issueId=${issueId}&limit=200`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Tempo API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok(await res.json());
      }

      case 'tempo_log_time': {
        let { issueId, issueKey: logIssueKey, timeSpentSeconds, startDate, startTime, description } =
          args as { issueId?: number; issueKey?: string; timeSpentSeconds: number; startDate: string; startTime?: string; description?: string };
        if (!issueId && !logIssueKey) throw new Error('Provide either issueKey (e.g. "SLODEV-383") or issueId.');
        if (logIssueKey && !issueId) {
          const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(logIssueKey)}?fields=summary`);
          issueId = Number(issueData.id);
        }
        const token = tempoToken();
        // Resolve the current Jira user so Tempo knows who logged the time
        const me = await jiraFetch('/rest/api/3/myself');
        const authorAccountId: string = me.accountId;
        const payload: Record<string, unknown> = { issueId, authorAccountId, timeSpentSeconds, startDate };
        if (startTime) payload.startTime = startTime;
        if (description) payload.description = description;
        const res = await fetch('https://api.tempo.io/4/worklogs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Tempo API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok(await res.json());
      }

      case 'tempo_update_worklog': {
        let { tempoWorklogId, issueId: updateIssueId, issueKey: updateIssueKey, timeSpentSeconds: updateTime, startDate: updateDate, description: updateDesc } =
          args as { tempoWorklogId: number; issueId?: number; issueKey?: string; timeSpentSeconds: number; startDate: string; description?: string };
        if (!updateIssueId && !updateIssueKey) throw new Error('Provide either issueKey or issueId.');
        if (updateIssueKey && !updateIssueId) {
          const issueData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(updateIssueKey)}?fields=summary`);
          updateIssueId = Number(issueData.id);
        }
        const updateToken = tempoToken();
        const updateMe = await jiraFetch('/rest/api/3/myself');
        const updateAuthor: string = updateMe.accountId;
        const updateRes = await fetch(`https://api.tempo.io/4/worklogs/${tempoWorklogId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${updateToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueId: updateIssueId, authorAccountId: updateAuthor, timeSpentSeconds: updateTime, startDate: updateDate, description: updateDesc ?? '' }),
        });
        if (!updateRes.ok) throw new Error(`Tempo API ${updateRes.status}: ${(await updateRes.text()).slice(0, 200)}`);
        return ok(await updateRes.json());
      }

      // ── Standup ───────────────────────────────────────────────────────────

      case 'get_standup_message': {
        const { lookbackDays = 1 } = args as { lookbackDays?: number };

        // 1. Current Jira user
        const me = await jiraFetch('/rest/api/3/myself');
        const myAccountId: string = me.accountId;
        const myDisplayName: string = me.displayName;

        // 2. Lookback date range (skip weekends)
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const fromDate = new Date(today);
        let remaining = Math.max(1, Math.floor(lookbackDays));
        while (remaining > 0) {
          fromDate.setDate(fromDate.getDate() - 1);
          if (fromDate.getDay() !== 0 && fromDate.getDay() !== 6) remaining--;
        }
        const fromDateStr = fromDate.toISOString().slice(0, 10);

        // 3. Tempo worklogs for the current user
        const standupToken = tempoToken();
        type WLEntry = { issueKey: string; description: string; timeSpentSeconds: number };
        const worklogsByDate: Record<string, WLEntry[]> = {};
        const wlRes = await fetch(
          `https://api.tempo.io/4/worklogs?authorAccountId=${myAccountId}&from=${fromDateStr}&to=${todayStr}&limit=200`,
          { headers: { Authorization: `Bearer ${standupToken}`, Accept: 'application/json' } },
        );
        if (wlRes.ok) {
          const wlData = await wlRes.json() as { results?: Record<string, unknown>[] };
          // Defensive client-side filter: admin tokens may ignore authorAccountId
          const mine = (wlData.results ?? []).filter((w) => {
            const authorId = (w.author as Record<string, unknown>)?.accountId as string | undefined;
            return !authorId || authorId === myAccountId;
          });
          for (const wl of mine) {
            const d = wl.startDate as string;
            if (!worklogsByDate[d]) worklogsByDate[d] = [];
            const issueObj = wl.issue as Record<string, unknown>;
            worklogsByDate[d].push({
              issueKey: (issueObj?.key as string) ?? String(issueObj?.id ?? '?'),
              description: (wl.description as string) ?? '',
              timeSpentSeconds: (wl.timeSpentSeconds as number) ?? 0,
            });
          }
        }

        // 4. Full sprint fetch (all users, no assignee filter)
        const sdCfg = readConfig();
        const sdAllKeys = [...new Set(sdCfg.projects.flatMap((p) => p.jiraProjectKeys ?? []))];
        if (!sdAllKeys.length) throw new Error('No Jira project keys configured');
        const sdKeyList = sdAllKeys.map((k) => `"${k}"`).join(', ');
        const sdFields = ['summary', 'status', 'assignee', 'priority', 'issuetype', 'project'];
        let sdData = await jiraFetch('/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({
            jql: `project in (${sdKeyList}) AND sprint in openSprints() AND statusCategory != Done ORDER BY project ASC, updated DESC`,
            fields: sdFields, maxResults: 200,
          }),
        }).catch(() => null);
        if (!sdData) {
          sdData = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            body: JSON.stringify({
              jql: `project in (${sdKeyList}) AND statusCategory != Done ORDER BY project ASC, updated DESC`,
              fields: sdFields, maxResults: 200,
            }),
          });
        }
        const sdIssues: IssueSnap[] = (sdData.issues ?? []).map((i: Record<string, unknown> & { fields: Record<string, unknown> }) => ({
          key: i.key as string,
          summary: (i.fields?.summary as string) ?? '',
          status: ((i.fields?.status as Record<string, unknown>)?.name as string) ?? '',
          assignee: ((i.fields?.assignee as Record<string, unknown>)?.displayName as string) ?? 'Unassigned',
          priority: ((i.fields?.priority as Record<string, unknown>)?.name as string) ?? '',
          type: ((i.fields?.issuetype as Record<string, unknown>)?.name as string) ?? '',
          project: ((i.fields?.project as Record<string, unknown>)?.key as string) ?? '',
        }));

        // 5. Save snapshot (updates baseline for next run)
        const sdStatsByProject: Record<string, number> = {};
        const sdStatsByStatus: Record<string, number> = {};
        const sdStatsByAssignee: Record<string, number> = {};
        for (const i of sdIssues) {
          sdStatsByProject[i.project] = (sdStatsByProject[i.project] ?? 0) + 1;
          sdStatsByStatus[i.status] = (sdStatsByStatus[i.status] ?? 0) + 1;
          sdStatsByAssignee[i.assignee] = (sdStatsByAssignee[i.assignee] ?? 0) + 1;
        }
        const sdPrevious = loadSnapshot();
        saveSnapshot({ savedAt: new Date().toISOString(), issues: sdIssues, statsByProject: sdStatsByProject, statsByStatus: sdStatsByStatus, statsByAssignee: sdStatsByAssignee });

        // 6. Diff against previous snapshot
        type SChange = { key: string; summary: string; from: string; to: string };
        let sdDiff: { comparedTo: string; added: IssueSnap[]; resolved: IssueSnap[]; statusChanged: SChange[]; reassigned: SChange[] } | null = null;
        if (sdPrevious) {
          const prevMap = new Map(sdPrevious.issues.map((i) => [i.key, i]));
          const currMap = new Map(sdIssues.map((i) => [i.key, i]));
          const added = sdIssues.filter((i) => !prevMap.has(i.key));
          const resolved = sdPrevious.issues.filter((i) => !currMap.has(i.key));
          const statusChanged: SChange[] = [];
          const reassigned: SChange[] = [];
          for (const curr of sdIssues) {
            const prev = prevMap.get(curr.key);
            if (!prev) continue;
            if (prev.status !== curr.status)
              statusChanged.push({ key: curr.key, summary: curr.summary, from: prev.status, to: curr.status });
            if (prev.assignee !== curr.assignee)
              reassigned.push({ key: curr.key, summary: curr.summary, from: prev.assignee, to: curr.assignee });
          }
          sdDiff = { comparedTo: sdPrevious.savedAt, added, resolved, statusChanged, reassigned };
        }

        // 7. My issues
        const myIssues = sdIssues.filter((i) => i.assignee === myDisplayName);
        const myInProgress = myIssues.filter((i) => i.status.toLowerCase().includes('progress'));
        const myInReview = myIssues.filter((i) => i.status.toLowerCase().includes('review') || i.status.toLowerCase().includes('test'));
        const myBlocked = myIssues.filter((i) => i.status.toLowerCase().includes('block') || i.status.toLowerCase().includes('wait'));
        const myOther = myIssues.filter((i) => !myInProgress.includes(i) && !myInReview.includes(i) && !myBlocked.includes(i));
        const myResolved = sdDiff?.resolved.filter((i) => i.assignee === myDisplayName) ?? [];
        const myMovedForward = sdDiff?.statusChanged.filter((c) => {
          const curr = sdIssues.find((x) => x.key === c.key);
          return curr?.assignee === myDisplayName &&
            (c.to.toLowerCase().includes('review') || c.to.toLowerCase().includes('test') || c.to.toLowerCase().includes('done'));
        }) ?? [];

        // 8. Format helpers
        const fmtSecs = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h${m ? `${m}m` : ''}` : `${m}m`; };
        const issueMap = new Map(sdIssues.map((i) => [i.key, i]));
        const fmtRef = (key: string, summary?: string) => { const s = summary ?? issueMap.get(key)?.summary; return s ? `${key} "${s}"` : key; };

        // 9. Yesterday section — Tempo worklogs merged across lookback window
        const yesterdayLines: string[] = [];
        const mergedWL: Record<string, { total: number; descs: string[] }> = {};
        for (const entries of Object.values(worklogsByDate)) {
          for (const e of entries) {
            if (!mergedWL[e.issueKey]) mergedWL[e.issueKey] = { total: 0, descs: [] };
            mergedWL[e.issueKey].total += e.timeSpentSeconds;
            if (e.description) mergedWL[e.issueKey].descs.push(e.description);
          }
        }
        for (const [key, info] of Object.entries(mergedWL)) {
          const note = info.descs.length ? ` — "${info.descs[0]}"` : '';
          yesterdayLines.push(`• ${fmtRef(key)} (${fmtSecs(info.total)})${note}`);
        }
        for (const i of myResolved) yesterdayLines.push(`• ${fmtRef(i.key, i.summary)} → DONE`);
        for (const c of myMovedForward) yesterdayLines.push(`• ${fmtRef(c.key, c.summary)} → ${c.to}`);

        // 10. Today section
        const todayLines = [
          ...myInProgress.map((i) => `• ${fmtRef(i.key)} (${i.status})`),
          ...myInReview.map((i) => `• ${fmtRef(i.key)} (${i.status})`),
          ...myOther.map((i) => `• ${fmtRef(i.key)} (${i.status})`),
        ];

        // 11. Blockers
        const blockerLines = myBlocked.map((i) => `• ${fmtRef(i.key)} (${i.status})`);

        // 12. Team sprint changes
        const teamLines: string[] = [];
        if (sdDiff) {
          const since = new Date(sdDiff.comparedTo).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
          teamLines.push(`Changes since ${since}:`);
          if (sdDiff.added.length) teamLines.push(`• +${sdDiff.added.length} new: ${sdDiff.added.map((i) => i.key).join(', ')}`);
          if (sdDiff.resolved.length) teamLines.push(`• ${sdDiff.resolved.length} resolved: ${sdDiff.resolved.map((i) => i.key).join(', ')}`);
          for (const c of sdDiff.statusChanged.slice(0, 6)) teamLines.push(`• ${c.key}: ${c.from} → ${c.to}`);
          if (sdDiff.statusChanged.length > 6) teamLines.push(`  …and ${sdDiff.statusChanged.length - 6} more status changes`);
          for (const r of sdDiff.reassigned.slice(0, 3)) teamLines.push(`• ${r.key} reassigned: ${r.from} → ${r.to}`);
        }

        // 13. Compose final message
        const dayLabel = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const message = [
          `Daily Standup — ${dayLabel}`,
          `(${myDisplayName})`,
          '',
          '── YESTERDAY ──────────────────────────',
          ...(yesterdayLines.length ? yesterdayLines : ['• Nothing logged']),
          '',
          '── TODAY ───────────────────────────────',
          ...(todayLines.length ? todayLines : ['• Nothing assigned']),
          '',
          '── BLOCKERS ────────────────────────────',
          ...(blockerLines.length ? blockerLines : ['• None']),
          '',
          '── SPRINT CHANGES ──────────────────────',
          ...(teamLines.length ? teamLines : ['• No previous snapshot available']),
        ].join('\n');

        return ok({
          message,
          meta: {
            user: myDisplayName,
            myOpenIssues: myIssues.length,
            worklogDates: Object.keys(worklogsByDate).sort(),
            snapshotUpdated: true,
            diffAvailable: sdDiff !== null,
          },
        });
      }

      // ── Sprint overview ───────────────────────────────────────────────────

      case 'get_sprint_snapshot': {
        const { assigneeFilter, maxResults = 200 } = args as { assigneeFilter?: string; maxResults?: number };
        const cfg = readConfig();
        const allKeys = [...new Set(cfg.projects.flatMap((p) => p.jiraProjectKeys ?? []))];
        if (!allKeys.length) throw new Error('No Jira project keys configured across any project');
        const keyList = allKeys.map((k) => `"${k}"`).join(', ');
        const fields = ['summary', 'status', 'assignee', 'priority', 'issuetype', 'project'];
        const assigneeCond = assigneeFilter ? ` AND assignee = ${assigneeFilter}` : '';
        let data = await jiraFetch('/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({
            jql: `project in (${keyList}) AND sprint in openSprints() AND statusCategory != Done${assigneeCond} ORDER BY project ASC, updated DESC`,
            fields, maxResults,
          }),
        }).catch(() => null);
        if (!data) {
          data = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            body: JSON.stringify({
              jql: `project in (${keyList}) AND statusCategory != Done${assigneeCond} ORDER BY project ASC, updated DESC`,
              fields, maxResults,
            }),
          });
        }

        // Build current issue list
        const currentIssues: IssueSnap[] = (data.issues ?? []).map((i: Record<string, unknown> & { fields: Record<string, unknown> }) => ({
          key: i.key as string,
          summary: (i.fields?.summary as string) ?? '',
          status: ((i.fields?.status as Record<string, unknown>)?.name as string) ?? '',
          assignee: ((i.fields?.assignee as Record<string, unknown>)?.displayName as string) ?? 'Unassigned',
          priority: ((i.fields?.priority as Record<string, unknown>)?.name as string) ?? '',
          type: ((i.fields?.issuetype as Record<string, unknown>)?.name as string) ?? '',
          project: ((i.fields?.project as Record<string, unknown>)?.key as string) ?? '',
        }));

        // Compute stats
        const statsByProject: Record<string, number> = {};
        const statsByStatus: Record<string, number> = {};
        const statsByAssignee: Record<string, number> = {};
        for (const i of currentIssues) {
          statsByProject[i.project] = (statsByProject[i.project] ?? 0) + 1;
          statsByStatus[i.status] = (statsByStatus[i.status] ?? 0) + 1;
          statsByAssignee[i.assignee] = (statsByAssignee[i.assignee] ?? 0) + 1;
        }

        // Load previous snapshot and compute diff
        const previous = loadSnapshot();
        let diff: Record<string, unknown> | null = null;
        if (previous) {
          const prevMap = new Map(previous.issues.map((i) => [i.key, i]));
          const currMap = new Map(currentIssues.map((i) => [i.key, i]));

          const added    = currentIssues.filter((i) => !prevMap.has(i.key));
          const resolved = previous.issues.filter((i) => !currMap.has(i.key));
          const statusChanged: Array<{ key: string; summary: string; from: string; to: string }> = [];
          const reassigned:    Array<{ key: string; summary: string; from: string; to: string }> = [];

          for (const curr of currentIssues) {
            const prev = prevMap.get(curr.key);
            if (!prev) continue;
            if (prev.status !== curr.status)
              statusChanged.push({ key: curr.key, summary: curr.summary, from: prev.status, to: curr.status });
            if (prev.assignee !== curr.assignee)
              reassigned.push({ key: curr.key, summary: curr.summary, from: prev.assignee, to: curr.assignee });
          }

          diff = {
            comparedTo: previous.savedAt,
            summary: {
              added: added.length,
              resolved: resolved.length,
              statusChanged: statusChanged.length,
              reassigned: reassigned.length,
              totalDelta: currentIssues.length - previous.issues.length,
            },
            added,
            resolved,
            statusChanged,
            reassigned,
          };
        }

        // Save current snapshot
        const snap: SprintSnapshot = {
          savedAt: new Date().toISOString(),
          issues: currentIssues,
          statsByProject,
          statsByStatus,
          statsByAssignee,
        };
        saveSnapshot(snap);

        return ok({
          savedAt: snap.savedAt,
          totalOpen: currentIssues.length,
          statsByProject,
          statsByStatus,
          statsByAssignee,
          highlights: {
            inProgress:   currentIssues.filter((i) => i.status.toLowerCase().includes('progress')),
            readyForTest: currentIssues.filter((i) => i.status.toLowerCase().includes('test') || i.status.toLowerCase().includes('review')),
            unassigned:   currentIssues.filter((i) => i.assignee === 'Unassigned').length,
          },
          diff,
        });
      }

      case 'get_sprint_overview': {
        const { assigneeFilter, maxResults = 100 } = args as { assigneeFilter?: string; maxResults?: number };
        const cfg = readConfig();
        const allKeys = [...new Set(cfg.projects.flatMap((p) => p.jiraProjectKeys ?? []))];
        if (!allKeys.length) throw new Error('No Jira project keys configured across any project');
        const keyList = allKeys.map((k) => `"${k}"`).join(', ');
        const fields = ['summary', 'status', 'assignee', 'priority', 'issuetype', 'project'];
        const assigneeCond = assigneeFilter ? ` AND assignee = ${assigneeFilter}` : '';
        let data = await jiraFetch('/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({
            jql: `project in (${keyList}) AND sprint in openSprints() AND statusCategory != Done${assigneeCond} ORDER BY project ASC, updated DESC`,
            fields,
            maxResults,
          }),
        }).catch(() => null);
        if (!data) {
          data = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            body: JSON.stringify({
              jql: `project in (${keyList}) AND statusCategory != Done${assigneeCond} ORDER BY project ASC, updated DESC`,
              fields,
              maxResults,
            }),
          });
        }
        const byProject: Record<string, unknown[]> = {};
        for (const issue of (data.issues ?? [])) {
          const projKey = issue.fields?.project?.key ?? 'Unknown';
          if (!byProject[projKey]) byProject[projKey] = [];
          byProject[projKey].push({
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            assignee: issue.fields?.assignee?.displayName ?? 'Unassigned',
            priority: issue.fields?.priority?.name,
            type: issue.fields?.issuetype?.name,
          });
        }
        return ok({ total: data.total ?? 0, projectCount: allKeys.length, byProject });
      }

      // ── Process logs ──────────────────────────────────────────────────────

      case 'get_process_logs': {
        const { projectId, lines = 100 } = args as { projectId: string; lines?: number };
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/${encodeURIComponent(projectId)}/logs?lines=${lines}`);
        if (!res.ok) throw new Error(`Proud Lazy server ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok(await res.json());
      }

      // ── Health check ──────────────────────────────────────────────────────

      case 'project_health_check': {
        const { projects } = readConfig();
        const results = await Promise.all(
          projects
            .filter((p) => p.url)
            .map(async (p) => {
              try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 3000);
                const r = await fetch(p.url!, { signal: controller.signal, method: 'HEAD' })
                  .catch(() => fetch(p.url!, { signal: controller.signal, method: 'GET' }));
                clearTimeout(tid);
                return { id: p.id, name: p.name, url: p.url, httpStatus: r.status, up: r.ok };
              } catch {
                return { id: p.id, name: p.name, url: p.url, httpStatus: null, up: false };
              }
            }),
        );
        return ok({ projects: results });
      }

      // ── Config management ─────────────────────────────────────────────────

      case 'add_project': {
        const {
          id, name: projectName, cwd, command,
          url, port, color,
          jiraProjectKeys, links,
          install = false, installCommand,
        } = args as {
          id: string; name: string; cwd: string; command: string;
          url?: string; port?: number; color?: string;
          jiraProjectKeys?: string[]; links?: ProjectLink[];
          install?: boolean; installCommand?: string;
        };

        if (!/^[a-z0-9-]+$/.test(id))
          throw new Error('id must be kebab-case (lowercase letters, numbers, hyphens only)');
        if (!fs.existsSync(cwd))
          throw new Error(`Directory does not exist: ${cwd}`);

        const cfg = readConfig();
        if (cfg.projects.some((p) => p.id === id))
          throw new Error(`Project '${id}' already exists`);

        // ── Install step ──
        let installLog: string | null = null;
        if (install) {
          let cmd = installCommand;
          if (!cmd) {
            if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')))      cmd = 'pnpm install';
            else if (fs.existsSync(path.join(cwd, 'yarn.lock')))       cmd = 'yarn install';
            else if (fs.existsSync(path.join(cwd, 'package.json')))   cmd = 'npm install';
            else throw new Error('Cannot detect package manager. Provide installCommand explicitly or set install: false.');
          }
          try {
            installLog = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 180_000 }).slice(0, 3000);
          } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string; message?: string };
            const out = [e.stdout, e.stderr].filter(Boolean).join('\n') || String(err);
            throw new Error(`Install failed:\n${out.slice(0, 500)}`);
          }
        }

        // ── Color palette fallback ──
        const palette = ['#6366F1', '#F43F5E', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];
        const resolvedColor = color ?? palette[cfg.projects.length % palette.length];

        // ── Build and persist ──
        const newProject: Project = { id, name: projectName, cwd, command, color: resolvedColor };
        if (url) newProject.url = url;
        else if (port) newProject.url = `http://localhost:${port}`;
        if (jiraProjectKeys?.length) newProject.jiraProjectKeys = jiraProjectKeys;
        if (links?.length) newProject.links = links;

        cfg.projects.push(newProject);
        writeConfig(cfg);
        return ok({ added: id, project: newProject, installLog });
      }

      case 'remove_project': {
        const { id } = args as { id: string };
        const cfg = readConfig();
        const idx = cfg.projects.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error(`Project '${id}' not found`);
        const [removed] = cfg.projects.splice(idx, 1);
        writeConfig(cfg);
        return ok({ removed: id, project: removed });
      }

      // ── Git ───────────────────────────────────────────────────────────────

      case 'git_current_branch': {
        const { projects } = readConfig();
        const results = projects.map((p) => {
          try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: p.cwd, encoding: 'utf-8', timeout: 5000 }).trim();
            const jiraKeyMatch = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
            return { id: p.id, name: p.name, cwd: p.cwd, branch, jiraKey: jiraKeyMatch?.[1] ?? null };
          } catch {
            return { id: p.id, name: p.name, cwd: p.cwd, branch: null, jiraKey: null, error: 'not a git repo or git not available' };
          }
        });
        return ok(results);
      }

      case 'git_status': {
        const { projectId } = args as { projectId?: string };
        const { projects } = readConfig();
        const targets = projectId ? projects.filter((p) => p.id === projectId) : projects;
        if (projectId && !targets.length) throw new Error(`Project '${projectId}' not found`);
        const results = targets.map((p) => {
          try {
            const raw = execSync('git status --porcelain=v1', { cwd: p.cwd, encoding: 'utf-8', timeout: 5000 });
            const lines = raw.split('\n').filter(Boolean);
            const staged = lines.filter((l) => !'? '.includes(l[0]!) && l[0] !== ' ').map((l) => l.slice(3));
            const unstaged = lines.filter((l) => !' ?'.includes(l[1]!)).map((l) => l.slice(3));
            const untracked = lines.filter((l) => l.startsWith('??')).map((l) => l.slice(3));
            return { id: p.id, name: p.name, staged, unstaged, untracked, clean: lines.length === 0 };
          } catch {
            return { id: p.id, name: p.name, error: 'not a git repo' };
          }
        });
        return ok(results);
      }

      case 'git_log': {
        const { projectId, count = 10 } = args as { projectId?: string; count?: number };
        const { projects } = readConfig();
        const targets = projectId ? projects.filter((p) => p.id === projectId) : projects;
        if (projectId && !targets.length) throw new Error(`Project '${projectId}' not found`);
        const n = Math.min(Math.max(1, count), 50);
        const results = targets.map((p) => {
          try {
            const raw = execSync(
              `git log -${n} --pretty=format:"%H|%an|%ad|%s" --date=short`,
              { cwd: p.cwd, encoding: 'utf-8', timeout: 5000 },
            );
            const commits = raw.split('\n').filter(Boolean).map((line) => {
              const [hash, author, date, ...msgParts] = line.split('|');
              return { hash: hash?.slice(0, 8), author, date, message: msgParts.join('|') };
            });
            return { id: p.id, name: p.name, commits };
          } catch {
            return { id: p.id, name: p.name, commits: [], error: 'not a git repo' };
          }
        });
        return ok(results);
      }

      // ── Jira write ────────────────────────────────────────────────────────

      case 'jira_create_issue': {
        const { projectKey, summary, issueType = 'Task', description, assigneeAccountId, priority, labels, parentKey } =
          args as { projectKey: string; summary: string; issueType?: string; description?: string; assigneeAccountId?: string; priority?: string; labels?: string[]; parentKey?: string };
        const { baseUrl, auth } = jiraCtx();
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType },
        };
        if (description) fields.description = textToAdf(description);
        if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
        if (priority) fields.priority = { name: priority };
        if (labels?.length) fields.labels = labels;
        if (parentKey) fields.parent = { key: parentKey };
        const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ fields }),
        });
        if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const created = await res.json() as { key: string; id: string };
        return ok({ key: created.key, id: created.id, url: `${baseUrl}/browse/${created.key}` });
      }

      // ── Tempo extras ──────────────────────────────────────────────────────

      case 'tempo_get_my_teams': {
        const token = tempoToken();
        const meData = await jiraFetch('/rest/api/3/myself');
        const myId = meData.accountId as string;

        const teamsRes = await fetch('https://api.tempo.io/4/teams?limit=100', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!teamsRes.ok) throw new Error(`Tempo ${teamsRes.status}: ${(await teamsRes.text()).slice(0, 200)}`);
        const teamsData = await teamsRes.json() as { results?: { id: number; name: string }[] };
        const allTeams = teamsData.results ?? [];

        const checks = await Promise.all(
          allTeams.map(async (team) => {
            try {
              const r = await fetch(`https://api.tempo.io/4/teams/${team.id}/members`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
              });
              if (!r.ok) return null;
              const d = await r.json() as { results?: { member?: { accountId?: string }; accountId?: string }[] };
              const isMember = (d.results ?? []).some(
                (m) => m.member?.accountId === myId || m.accountId === myId,
              );
              return isMember ? { id: team.id, name: team.name } : null;
            } catch { return null; }
          }),
        );
        const myTeams = checks.filter(Boolean);
        return ok({ teams: myTeams, total: myTeams.length });
      }

      case 'tempo_week_summary': {
        const { week = 'current', accountId: wkAccountId } = args as { week?: string; accountId?: string };
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
        const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday + (week === 'previous' ? -7 : 0));
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const token = tempoToken();
        const targetId = wkAccountId ?? ((await jiraFetch('/rest/api/3/myself')).accountId as string);
        const res = await fetch(
          `https://api.tempo.io/4/worklogs?authorAccountId=${targetId}&from=${fmt(monday)}&to=${fmt(friday)}&limit=500`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        );
        if (!res.ok) throw new Error(`Tempo ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json() as { results?: Record<string, unknown>[] };
        // Defensive client-side filter in case admin token ignores the param
        const filtered = (data.results ?? []).filter((w) => {
          const id = (w.author as Record<string, unknown>)?.accountId as string | undefined;
          return !id || id === targetId;
        });
        const byDay: Record<string, number> = {};
        const byProject: Record<string, number> = {};
        let totalSecs = 0;
        for (const wl of filtered) {
          const d = wl.startDate as string;
          const secs = (wl.timeSpentSeconds as number) ?? 0;
          byDay[d] = (byDay[d] ?? 0) + secs;
          const issueObj = wl.issue as Record<string, unknown>;
          const key = (issueObj?.key as string) ?? '';
          const proj = key.split('-')[0] ?? 'UNKNOWN';
          byProject[proj] = (byProject[proj] ?? 0) + secs;
          totalSecs += secs;
        }
        const fmtSecs = (s: number) => `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}m`;
        const byDayFormatted = Object.fromEntries(Object.entries(byDay).sort().map(([d, s]) => [d, fmtSecs(s)]));
        const byProjectFormatted = Object.fromEntries(Object.entries(byProject).map(([p, s]) => [p, fmtSecs(s)]));
        return ok({ accountId: targetId, week: `${fmt(monday)} – ${fmt(friday)}`, totalLogged: fmtSecs(totalSecs), byDay: byDayFormatted, byProject: byProjectFormatted });
      }

      case 'tempo_missing_days': {
        const today = new Date();
        const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        const { from = defaultFrom.toISOString().slice(0, 10), to = today.toISOString().slice(0, 10), accountId: mdAccountId } =
          args as { from?: string; to?: string; accountId?: string };
        const token = tempoToken();
        const targetId = mdAccountId ?? ((await jiraFetch('/rest/api/3/myself')).accountId as string);
        const res = await fetch(
          `https://api.tempo.io/4/worklogs?authorAccountId=${targetId}&from=${from}&to=${to}&limit=500`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        );
        if (!res.ok) throw new Error(`Tempo ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json() as { results?: Record<string, unknown>[] };
        // Defensive client-side filter in case admin token ignores the param
        const filtered = (data.results ?? []).filter((w) => {
          const id = (w.author as Record<string, unknown>)?.accountId as string | undefined;
          return !id || id === targetId;
        });
        const loggedDays = new Set(filtered.map((wl) => wl.startDate as string));
        // Enumerate weekdays in range
        const missing: string[] = [];
        const cur = new Date(from);
        const end = new Date(to);
        while (cur <= end) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) {
            const d = cur.toISOString().slice(0, 10);
            if (!loggedDays.has(d) && cur <= today) missing.push(d);
          }
          cur.setDate(cur.getDate() + 1);
        }
        return ok({ accountId: targetId, from, to, missingDays: missing, missingCount: missing.length, loggedDaysCount: loggedDays.size });
      }

      case 'tempo_team_hours': {
        const today = new Date();
        // Default: current week Monday to today
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const defaultFrom = new Date(today);
        defaultFrom.setDate(today.getDate() + diffToMonday);
        const {
          teamId,
          accountIds,
          from = defaultFrom.toISOString().slice(0, 10),
          to = today.toISOString().slice(0, 10),
        } = args as { teamId?: number; accountIds?: string[]; from?: string; to?: string };

        const token = tempoToken();
        const fmtSecs = (s: number) => `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}m`;

        // Helper: enumerate weekdays between two YYYY-MM-DD strings (up to today)
        const todayStr = today.toISOString().slice(0, 10);
        const weekdaysInRange: string[] = [];
        const wdCur = new Date(from);
        const wdEnd = new Date(to);
        while (wdCur <= wdEnd) {
          const dow = wdCur.getDay();
          const d = wdCur.toISOString().slice(0, 10);
          if (dow !== 0 && dow !== 6 && d <= todayStr) weekdaysInRange.push(d);
          wdCur.setDate(wdCur.getDate() + 1);
        }

        // Helper: summarise a list of raw Tempo worklog results into per-person stats
        const summariseByAuthor = (raw: Record<string, unknown>[]) => {
          const byAuthor: Record<string, { displayName: string; secs: number; days: Set<string> }> = {};
          for (const wl of raw) {
            const authorObj = wl.author as Record<string, unknown>;
            const id = authorObj?.accountId as string ?? 'unknown';
            const name = authorObj?.displayName as string ?? id;
            if (!byAuthor[id]) byAuthor[id] = { displayName: name, secs: 0, days: new Set() };
            const secs = (wl.timeSpentSeconds as number) ?? 0;
            byAuthor[id].secs += secs;
            byAuthor[id].days.add(wl.startDate as string);
          }
          return Object.entries(byAuthor).map(([id, info]) => ({
            accountId: id,
            displayName: info.displayName,
            totalLogged: fmtSecs(info.secs),
            missingDays: weekdaysInRange.filter((d) => !info.days.has(d)),
            missingCount: weekdaysInRange.filter((d) => !info.days.has(d)).length,
          }));
        };

        if (teamId != null) {
          // Preferred path: fetch all worklogs for a team at once
          const res = await fetch(
            `https://api.tempo.io/4/worklogs?teamId=${teamId}&from=${from}&to=${to}&limit=1000`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
          );
          if (!res.ok) throw new Error(`Tempo ${res.status}: ${(await res.text()).slice(0, 200)}`);
          const data = await res.json() as { results?: Record<string, unknown>[] };
          return ok({ from, to, teamId, members: summariseByAuthor(data.results ?? []) });
        }

        // Fallback: per-person queries using authorAccountId
        const targets: string[] = accountIds?.length
          ? accountIds
          : [((await jiraFetch('/rest/api/3/myself')).accountId as string)];

        const results = await Promise.all(
          targets.map(async (id) => {
            const res = await fetch(
              `https://api.tempo.io/4/worklogs?authorAccountId=${id}&from=${from}&to=${to}&limit=500`,
              { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
            );
            if (!res.ok) return { accountId: id, error: `Tempo ${res.status}` };
            const data = await res.json() as { results?: Record<string, unknown>[] };
            // Client-side filter: admin tokens may return more than just this user
            const mine = (data.results ?? []).filter((w) => {
              const aid = (w.author as Record<string, unknown>)?.accountId as string | undefined;
              return !aid || aid === id;
            });
            const loggedDays = new Set(mine.map((wl) => wl.startDate as string));
            let totalSecs = 0;
            const byDay: Record<string, number> = {};
            for (const wl of mine) {
              const secs = (wl.timeSpentSeconds as number) ?? 0;
              totalSecs += secs;
              byDay[wl.startDate as string] = (byDay[wl.startDate as string] ?? 0) + secs;
            }
            const missingDays = weekdaysInRange.filter((d) => !loggedDays.has(d));
            return {
              accountId: id,
              totalLogged: fmtSecs(totalSecs),
              byDay: Object.fromEntries(Object.entries(byDay).sort().map(([d, s]) => [d, fmtSecs(s)])),
              missingDays,
              missingCount: missingDays.length,
            };
          }),
        );

        return ok({ from, to, members: results });
      }

      // ── Azure DevOps ──────────────────────────────────────────────────────

      case 'ado_list_my_prs': {
        const { status = 'active' } = args as { status?: string };
        const { orgUrl } = adoCtx();
        const cfg = readConfig();
        const repos = cfg.projects.filter((p) => p.adoProject && p.adoRepoId);
        if (!repos.length) throw new Error('No projects have adoProject + adoRepoId configured');
        const allPRs: unknown[] = [];
        await Promise.all(repos.map(async (p) => {
          const url = `${orgUrl}/${encodeURIComponent(p.adoProject!)}/_apis/git/repositories/${encodeURIComponent(p.adoRepoId!)}/pullrequests?searchCriteria.status=${status}&searchCriteria.creatorId=me&api-version=7.1`;
          const data = await adoFetch(url);
          const prs = (data.value as Record<string, unknown>[] ?? []).map((pr) => ({
            id: pr.pullRequestId,
            title: pr.title,
            status: pr.status,
            sourceBranch: (pr.sourceRefName as string)?.replace('refs/heads/', ''),
            targetBranch: (pr.targetRefName as string)?.replace('refs/heads/', ''),
            createdBy: (pr.createdBy as Record<string, unknown>)?.displayName,
            creationDate: pr.creationDate,
            isDraft: pr.isDraft,
            reviewers: (pr.reviewers as Record<string, unknown>[] ?? []).map((r) => ({
              name: r.displayName, vote: r.vote,
            })),
            url: `${orgUrl}/${p.adoProject}/_git/${p.adoRepoId}/pullrequest/${pr.pullRequestId}`,
            project: p.id,
          }));
          allPRs.push(...prs);
        }));
        return ok({ total: allPRs.length, pullRequests: allPRs });
      }

      case 'ado_get_pr': {
        const { prId, adoProject: adoProjArg, repoId: repoIdArg } = args as { prId: number; adoProject?: string; repoId?: string };
        const { orgUrl } = adoCtx();
        const cfg = readConfig();
        const proj = cfg.projects.find((p) => p.adoProject && p.adoRepoId);
        const adoProj = adoProjArg ?? proj?.adoProject;
        const repoId = repoIdArg ?? proj?.adoRepoId;
        if (!adoProj || !repoId) throw new Error('adoProject and repoId required (or configure at least one project with adoProject + adoRepoId)');
        const base = `${orgUrl}/${encodeURIComponent(adoProj)}/_apis/git/repositories/${encodeURIComponent(repoId)}`;
        const [prData, threadsData] = await Promise.all([
          adoFetch(`${base}/pullrequests/${prId}?api-version=7.1`),
          adoFetch(`${base}/pullrequests/${prId}/threads?api-version=7.1`),
        ]);
        type ThreadComment = { content: string; commentType: string; author: Record<string, unknown> };
        type Thread = { id: number; status: string; comments: ThreadComment[] };
        const threads = (threadsData.value as Thread[] ?? []).filter((t) => t.comments?.length && t.comments[0]?.commentType !== 'system');
        const comments = threads.map((t) => ({
          id: t.id,
          status: t.status,
          firstComment: t.comments[0]?.content?.slice(0, 300),
          author: (t.comments[0]?.author as Record<string, unknown>)?.displayName,
          replies: t.comments.length - 1,
        }));
        return ok({
          id: prData.pullRequestId,
          title: prData.title,
          description: (prData.description as string)?.slice(0, 1000),
          status: prData.status,
          isDraft: prData.isDraft,
          sourceBranch: (prData.sourceRefName as string)?.replace('refs/heads/', ''),
          targetBranch: (prData.targetRefName as string)?.replace('refs/heads/', ''),
          createdBy: (prData.createdBy as Record<string, unknown>)?.displayName,
          mergeStatus: prData.mergeStatus,
          reviewers: (prData.reviewers as Record<string, unknown>[] ?? []).map((r) => ({ name: r.displayName, vote: r.vote })),
          comments,
          url: `${orgUrl}/${adoProj}/_git/${repoId}/pullrequest/${prId}`,
        });
      }

      case 'ado_create_pr': {
        const { projectId, title: titleArg, description = '', targetBranch = 'main', draft = false, workItemIds, autoComplete = false } =
          args as { projectId: string; title?: string; description?: string; targetBranch?: string; draft?: boolean; workItemIds?: number[]; autoComplete?: boolean };
        const cfg = readConfig();
        const proj = cfg.projects.find((p) => p.id === projectId);
        if (!proj) throw new Error(`Project '${projectId}' not found`);
        if (!proj.adoProject || !proj.adoRepoId)
          throw new Error(`Project '${projectId}' has no adoProject / adoRepoId configured`);
        // Get current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: proj.cwd, encoding: 'utf-8', timeout: 5000 }).trim();
        // Try to derive PR title from branch's Jira key
        let resolvedTitle = titleArg;
        if (!resolvedTitle) {
          const jiraKeyMatch = currentBranch.match(/([A-Z][A-Z0-9]+-\d+)/);
          if (jiraKeyMatch) {
            try {
              const issue = await jiraFetch(`/rest/api/3/issue/${jiraKeyMatch[1]}?fields=summary`);
              resolvedTitle = `${jiraKeyMatch[1]}: ${(issue.fields as Record<string, unknown>)?.summary as string}`;
            } catch {
              resolvedTitle = currentBranch.replace(/^(feature|fix|bugfix|chore|hotfix)\//, '').replace(/-/g, ' ');
            }
          } else {
            resolvedTitle = currentBranch.replace(/^(feature|fix|bugfix|chore|hotfix)\//, '').replace(/-/g, ' ');
          }
        }
        const { orgUrl } = adoCtx();
        const payload: Record<string, unknown> = {
          title: resolvedTitle,
          description,
          sourceRefName: `refs/heads/${currentBranch}`,
          targetRefName: `refs/heads/${targetBranch}`,
          isDraft: draft,
        };
        if (workItemIds?.length) {
          payload.workItemRefs = workItemIds.map((id) => ({ id: String(id) }));
        }
        const prData = await adoFetch(
          `${orgUrl}/${encodeURIComponent(proj.adoProject)}/_apis/git/repositories/${encodeURIComponent(proj.adoRepoId)}/pullrequests?api-version=7.1`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        if (autoComplete && prData.pullRequestId) {
          await adoFetch(
            `${orgUrl}/${encodeURIComponent(proj.adoProject)}/_apis/git/repositories/${encodeURIComponent(proj.adoRepoId)}/pullrequests/${prData.pullRequestId}?api-version=7.1`,
            { method: 'PATCH', body: JSON.stringify({ autoCompleteSetBy: prData.createdBy }) },
          ).catch(() => null);
        }
        const prUrl = `${orgUrl}/${proj.adoProject}/_git/${proj.adoRepoId}/pullrequest/${prData.pullRequestId}`;
        return ok({ id: prData.pullRequestId, title: resolvedTitle, sourceBranch: currentBranch, targetBranch, url: prUrl, isDraft: draft });
      }

      case 'ado_list_prs': {
        const { status = 'active', creatorName, reviewerName } = args as { status?: string; creatorName?: string; reviewerName?: string };
        const { orgUrl } = adoCtx();
        const cfg = readConfig();
        const repos = cfg.projects.filter((p) => p.adoProject && p.adoRepoId);
        if (!repos.length) throw new Error('No projects have adoProject + adoRepoId configured');
        const allPRs: unknown[] = [];
        await Promise.all(repos.map(async (p) => {
          const url = `${orgUrl}/${encodeURIComponent(p.adoProject!)}/_apis/git/repositories/${encodeURIComponent(p.adoRepoId!)}/pullrequests?searchCriteria.status=${status}&api-version=7.1`;
          const data = await adoFetch(url);
          const prs = (data.value as Record<string, unknown>[] ?? []).map((pr) => ({
            id: pr.pullRequestId,
            title: pr.title,
            status: pr.status,
            sourceBranch: (pr.sourceRefName as string)?.replace('refs/heads/', ''),
            targetBranch: (pr.targetRefName as string)?.replace('refs/heads/', ''),
            createdBy: (pr.createdBy as Record<string, unknown>)?.displayName,
            creationDate: pr.creationDate,
            isDraft: pr.isDraft,
            reviewers: (pr.reviewers as Record<string, unknown>[] ?? []).map((r) => ({
              name: r.displayName, vote: r.vote,
            })),
            url: `${orgUrl}/${p.adoProject}/_git/${p.adoRepoId}/pullrequest/${pr.pullRequestId}`,
            project: p.id,
          }));
          allPRs.push(...prs);
        }));

        type PR = { createdBy: unknown; reviewers: Array<{ name: unknown }> };
        let filtered = allPRs as PR[];

        if (creatorName) {
          const q = creatorName.toLowerCase();
          filtered = filtered.filter((pr) =>
            typeof pr.createdBy === 'string' && pr.createdBy.toLowerCase().includes(q),
          );
        }
        if (reviewerName) {
          const q = reviewerName.toLowerCase();
          filtered = filtered.filter((pr) =>
            pr.reviewers.some((r) => typeof r.name === 'string' && r.name.toLowerCase().includes(q)),
          );
        }
        return ok({ total: filtered.length, pullRequests: filtered });
      }

      case 'ado_add_pr_comment': {
        const { prId, content, adoProject: adoProjArg, repoId: repoIdArg } = args as { prId: number; content: string; adoProject?: string; repoId?: string };
        const { orgUrl } = adoCtx();
        const cfg = readConfig();
        const proj = cfg.projects.find((p) => p.adoProject && p.adoRepoId &&
          (!adoProjArg || p.adoProject === adoProjArg) && (!repoIdArg || p.adoRepoId === repoIdArg)
        ) ?? cfg.projects.find((p) => p.adoProject && p.adoRepoId);
        if (!proj?.adoProject || !proj?.adoRepoId) throw new Error('adoProject and repoId required (or configure at least one project with adoProject + adoRepoId)');
        const base = `${orgUrl}/${encodeURIComponent(proj.adoProject)}/_apis/git/repositories/${encodeURIComponent(proj.adoRepoId)}`;
        const thread = await adoFetch(`${base}/pullRequests/${prId}/threads?api-version=7.1`, {
          method: 'POST',
          body: JSON.stringify({
            comments: [{ parentCommentId: 0, content, commentType: 1 }],
            status: 1,
          }),
        });
        const comment = (thread.comments as Record<string, unknown>[])?.[0];
        return ok({ threadId: thread.id, commentId: comment?.id, content });
      }

      case 'ado_vote_pr': {
        const VOTE_MAP: Record<string, number> = { approve: 10, 'approve-with-suggestions': 5, reset: 0, wait: -5, reject: -10 };
        const { prId, vote, adoProject: adoProjArg, repoId: repoIdArg } = args as { prId: number; vote: string; adoProject?: string; repoId?: string };
        const voteValue = VOTE_MAP[vote];
        if (voteValue === undefined) throw new Error(`Invalid vote "${vote}". Use: approve, approve-with-suggestions, reject, wait, reset.`);
        const { orgUrl, auth } = adoCtx();
        const cfg = readConfig();
        const proj = cfg.projects.find((p) => p.adoProject && p.adoRepoId &&
          (!adoProjArg || p.adoProject === adoProjArg) && (!repoIdArg || p.adoRepoId === repoIdArg)
        ) ?? cfg.projects.find((p) => p.adoProject && p.adoRepoId);
        if (!proj?.adoProject || !proj?.adoRepoId) throw new Error('adoProject and repoId required');
        // Resolve current user identity
        const connRes = await fetch(`${orgUrl}/_apis/connectionData`, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        });
        if (!connRes.ok) throw new Error(`Could not fetch ADO identity: ${connRes.status}`);
        const connData = await connRes.json() as { authenticatedUser?: { id?: string } };
        const userId = connData.authenticatedUser?.id;
        if (!userId) throw new Error('Could not determine current ADO user identity');
        const base = `${orgUrl}/${encodeURIComponent(proj.adoProject)}/_apis/git/repositories/${encodeURIComponent(proj.adoRepoId)}`;
        await adoFetch(`${base}/pullRequests/${prId}/reviewers/${userId}?api-version=7.1`, {
          method: 'PUT',
          body: JSON.stringify({ vote: voteValue }),
        });
        return ok({ prId, vote, voteValue, userId });
      }

      case 'ado_link_pr_to_jira': {
        const { jiraKey, prUrl, prTitle = '' } = args as { jiraKey: string; prUrl: string; prTitle?: string };
        const commentText = prTitle
          ? `Pull Request opened: [${prTitle}](${prUrl})`
          : `Pull Request opened: ${prUrl}`;
        const { baseUrl, auth } = jiraCtx();
        const adfBody = {
          version: 1,
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [
              { type: 'text', text: '🔀 ', marks: [] },
              ...(prTitle
                ? [{ type: 'text', text: prTitle, marks: [{ type: 'link', attrs: { href: prUrl } }] }]
                : [{ type: 'text', text: commentText }]),
            ],
          }],
        };
        void commentText; // used only in plain fallback
        const res = await fetch(`${baseUrl}/rest/api/3/issue/${jiraKey}/comment`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ body: adfBody }),
        });
        if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const comment = await res.json() as { id: string };
        return ok({ jiraKey, commentId: comment.id, prUrl, message: 'PR link posted to Jira issue' });
      }

      // ── Jira users ───────────────────────────────────────────────────────

      case 'jira_lookup_user': {
        const { query, maxResults = 10 } = args as { query: string; maxResults?: number };
        const data = await jiraFetch(
          `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        );
        const users = (Array.isArray(data) ? data : []).map((u: Record<string, unknown>) => ({
          accountId: u.accountId,
          displayName: u.displayName,
          emailAddress: u.emailAddress,
          active: u.active,
        }));
        return ok({ users, total: users.length });
      }

      // ── Jira assign ───────────────────────────────────────────────────────

      case 'jira_assign_issue': {
        const { issueKey, assigneeAccountId } = args as { issueKey: string; assigneeAccountId: string };
        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, {
          method: 'PUT',
          body: JSON.stringify({ accountId: assigneeAccountId }),
        });
        return ok({ assigned: true, issueKey, assigneeAccountId });
      }

      case 'jira_assign_to_test': {
        const { issueKey, assigneeAccountId, testUrl, testInstructions } =
          args as { issueKey: string; assigneeAccountId: string; testUrl?: string; testInstructions?: string };

        // 1. Find a "ready for test" transition (case-insensitive)
        const transData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
        const transitions: Array<{ id: string; name: string }> = transData.transitions ?? [];
        const testTransition = transitions.find((t) =>
          /test/i.test(t.name),
        );
        if (!testTransition) {
          throw new Error(
            `No transition matching "test" found for ${issueKey}. Available: ${transitions.map((t) => t.name).join(', ')}`,
          );
        }

        // 2. Apply the transition
        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
          method: 'POST',
          body: JSON.stringify({ transition: { id: testTransition.id } }),
        });

        // 3. Assign the issue
        await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, {
          method: 'PUT',
          body: JSON.stringify({ accountId: assigneeAccountId }),
        });

        // 4. Post a test comment
        const commentParts: string[] = ['This issue is ready for testing.'];
        if (testUrl) commentParts.push(`Test URL: ${testUrl}`);
        if (testInstructions) commentParts.push(`\nInstructions:\n${testInstructions}`);
        const commentData = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
          method: 'POST',
          body: JSON.stringify({ body: textToAdf(commentParts.join('\n')) }),
        });

        return ok({
          issueKey,
          transitioned: testTransition.name,
          assigned: assigneeAccountId,
          commentId: commentData.id,
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: 'text' as const, text: `Error: ${String(err)}` }], isError: true };
  }
});

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
