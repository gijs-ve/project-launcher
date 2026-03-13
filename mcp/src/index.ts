import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH =
  process.env.LAUNCH_CONFIG_PATH ??
  path.resolve(__dirname, '..', '..', 'launch.config.gizzyb');

const LAUNCH_SERVER = process.env.LAUNCH_SERVER_URL ?? 'http://localhost:4000';

interface JiraCredentials { email: string; apiToken: string; baseUrl?: string }
interface Project { id: string; name: string; cwd: string; command: string; color: string; jiraProjectKeys?: string[] }
interface Config { projects: Project[]; jira?: JiraCredentials; tempo?: { apiToken: string }; teamsWebhookUrl?: string }

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Config;
  } catch {
    return { projects: [] };
  }
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
function textToAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
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
  { name: 'launch-mcp', version: '1.0.0' },
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
      description: 'List all projects configured in the Launch app.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_project_statuses',
      description: 'Get the running status (stopped/starting/running/errored) of all projects from the Launch server.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'start_project',
      description: 'Start a project managed by the Launch app.',
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
      description: 'Stop a running project managed by the Launch app.',
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
          projectId: { type: 'string', description: 'Launch project ID used to look up Jira project keys.' },
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
      description: 'Add a comment to a Jira issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          body: { type: 'string', description: 'Plain-text comment body.' },
        },
        required: ['issueKey', 'body'],
      },
    },
    {
      name: 'jira_edit_comment',
      description: 'Edit an existing comment on a Jira issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'Jira issue key, e.g. "PROJ-123".' },
          commentId: { type: 'string', description: 'ID of the comment to edit (visible on the comment object from jira_get_issue).' },
          body: { type: 'string', description: 'New plain-text content for the comment.' },
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
      description: 'Fetch Tempo worklogs for a given Jira issue (by numeric issue ID).',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: { type: 'string', description: 'Numeric Jira issue ID.' },
        },
        required: ['issueId'],
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
          color: { type: 'string', description: 'Optional hex accent color, e.g. "0078D4" (blue). Defaults to Launch brand pink.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'tempo_log_time',
      description: 'Log time against a Jira issue via Tempo.',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: { type: 'number', description: 'Numeric Jira issue ID.' },
          timeSpentSeconds: { type: 'number', description: 'Duration in seconds.' },
          startDate: { type: 'string', description: 'Date of the worklog in YYYY-MM-DD format.' },
          startTime: { type: 'string', description: 'Start time in HH:MM:SS format (optional).' },
          description: { type: 'string', description: 'Optional worklog description.' },
        },
        required: ['issueId', 'timeSpentSeconds', 'startDate'],
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
        if (!res.ok) throw new Error(`Launch server ${res.status}`);
        return ok(await res.json());
      }

      case 'start_project': {
        const { projectId } = args as { projectId: string };
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/${encodeURIComponent(projectId)}/start`, { method: 'POST' });
        if (!res.ok) throw new Error(`Launch server ${res.status}`);
        return ok({ started: projectId });
      }

      case 'stop_project': {
        const { projectId } = args as { projectId: string };
        const res = await fetch(`${LAUNCH_SERVER}/api/projects/${encodeURIComponent(projectId)}/stop`, { method: 'POST' });
        if (!res.ok) throw new Error(`Launch server ${res.status}`);
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
        const { issueKey, body } = args as { issueKey: string; body: string };
        const data = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
          method: 'POST',
          body: JSON.stringify({ body: textToAdf(body) }),
        });
        return ok({ commentId: data.id, created: data.created });
      }

      case 'jira_edit_comment': {
        const { issueKey, commentId, body } = args as { issueKey: string; commentId: string; body: string };
        const data = await jiraFetch(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
          {
            method: 'PUT',
            body: JSON.stringify({ body: textToAdf(body) }),
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
        const { text, title, color = 'EC4899' } = args as { text: string; title?: string; color?: string };
        const cfg = readConfig();
        const webhookUrl = cfg.teamsWebhookUrl;
        if (!webhookUrl) throw new Error('No teamsWebhookUrl configured in launch.config.gizzyb');
        const card: Record<string, unknown> = {
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          summary: title ?? text.slice(0, 80),
          themeColor: color,
          text,
        };
        if (title) card.title = title;
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card),
        });
        if (!res.ok) throw new Error(`Teams webhook error ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok({ sent: true });
      }

      case 'tempo_get_worklogs': {
        const { issueId } = args as { issueId: string };
        if (!/^\d+$/.test(issueId)) throw new Error('issueId must be a positive integer');
        const token = tempoToken();
        const res = await fetch(`https://api.tempo.io/4/worklogs?issueId=${issueId}&limit=200`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Tempo API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return ok(await res.json());
      }

      case 'tempo_log_time': {
        const { issueId, timeSpentSeconds, startDate, startTime, description } =
          args as { issueId: number; timeSpentSeconds: number; startDate: string; startTime?: string; description?: string };
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
