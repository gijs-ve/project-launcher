"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_js_1 = require("../config.js");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Helper: resolve common auth/baseUrl from config for a given projectId
// ---------------------------------------------------------------------------
function resolveJiraContext(projectId) {
    const config = (0, config_js_1.readConfig)();
    const creds = config.jira;
    if (!creds?.email || !creds?.apiToken)
        return { error: 'No Jira credentials configured in General Settings' };
    // baseUrl lives on config.jira; fall back to per-project field for old configs
    const baseUrl = (creds.baseUrl ?? (projectId
        ? config.projects.find((p) => p.id === projectId)?.jiraBaseUrl
        : config.projects.find((p) => p.jiraBaseUrl)?.jiraBaseUrl))?.replace(/\/+$/, '');
    if (!baseUrl)
        return { error: 'No Jira base URL configured. Add it in General Settings → Jira.' };
    const project = projectId ? config.projects.find((p) => p.id === projectId) : null;
    const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
    return { baseUrl, auth, project, config };
}
// GET /api/jira/statuses?projectId=my-project
// Returns all statuses for the project's Jira keys, ordered roughly by workflow position.
router.get('/statuses', async (req, res) => {
    try {
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const jiraProjectKeys = ctx.project?.jiraProjectKeys ?? [];
        if (!jiraProjectKeys.length) {
            res.status(400).json({ error: 'No Jira project keys configured' });
            return;
        }
        // Fetch statuses for all configured project keys and merge them
        const allStatuses = new Map();
        await Promise.all(jiraProjectKeys.map(async (key) => {
            const r = await fetch(`${ctx.baseUrl}/rest/api/3/project/${encodeURIComponent(key)}/statuses`, { headers: { Authorization: `Basic ${ctx.auth}`, Accept: 'application/json' } });
            if (!r.ok)
                return; // skip failures silently per-project
            const data = await r.json();
            for (const issueType of data) {
                for (const s of issueType.statuses ?? []) {
                    allStatuses.set(s.name, s);
                }
            }
        }));
        // Sort: To Do → In Progress → In Review → Done category order
        const categoryOrder = { 'new': 0, 'indeterminate': 1, 'done': 2 };
        const sorted = [...allStatuses.values()].sort((a, b) => (categoryOrder[a.statusCategory.key] ?? 1) - (categoryOrder[b.statusCategory.key] ?? 1));
        res.json({ statuses: sorted });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/user/:accountId?projectId=my-project
// Looks up a Jira user by accountId and returns { accountId, displayName, emailAddress }.
router.get('/user/:accountId', async (req, res) => {
    try {
        const accountId = String(req.params.accountId);
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`, { headers: { Authorization: `Basic ${ctx.auth}`, Accept: 'application/json' } });
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        const data = await response.json();
        res.json({ accountId: data.accountId, displayName: data.displayName, emailAddress: data.emailAddress });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/me?projectId=my-project
// Returns the currently authenticated Jira user (accountId, displayName, emailAddress).
router.get('/me', async (req, res) => {
    try {
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/myself`, {
            headers: { Authorization: `Basic ${ctx.auth}`, Accept: 'application/json' },
        });
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        const data = await response.json();
        res.json({ accountId: data.accountId, displayName: data.displayName, emailAddress: data.emailAddress });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/issue/:issueKey?projectId=my-project
// Fetches full issue detail (description, comments, labels, etc.).
router.get('/issue/:issueKey', async (req, res) => {
    try {
        const issueKey = String(req.params.issueKey);
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const fields = [
            'summary', 'status', 'assignee', 'priority', 'issuetype',
            'description', 'labels', 'created', 'updated', 'reporter', 'comment', 'attachment',
        ].join(',');
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`, {
            headers: { Authorization: `Basic ${ctx.auth}`, Accept: 'application/json' },
        });
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        const data = await response.json();
        res.json({ issue: data });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/issues?projectId=my-project
// Proxies to the Jira REST API using credentials + per-project settings stored in config.
// Returns { issues: JiraIssue[] } or { error: string }.
router.get('/issues', async (req, res) => {
    try {
        const { projectId } = req.query;
        if (!projectId) {
            res.status(400).json({ error: 'projectId query param is required' });
            return;
        }
        const config = (0, config_js_1.readConfig)();
        const project = config.projects.find((p) => p.id === projectId);
        if (!project) {
            res.status(404).json({ error: `Project '${projectId}' not found` });
            return;
        }
        const { jiraProjectKeys } = project;
        // Base URL: prefer global config.jira.baseUrl, fall back to per-project field
        const jiraBaseUrl = (config.jira?.baseUrl ?? project.jiraBaseUrl)?.replace(/\/+$/, '');
        if (!jiraBaseUrl || !jiraProjectKeys?.length) {
            res.status(400).json({ error: 'Project has no Jira project keys, and no base URL is configured in General Settings.' });
            return;
        }
        const creds = config.jira;
        if (!creds?.email || !creds?.apiToken) {
            res.status(400).json({ error: 'No Jira credentials configured in General Settings' });
            return;
        }
        const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
        // Fetch active-sprint issues via Jira REST API v3.
        // We first try `sprint in openSprints()` (Scrum boards); if that returns a
        // 400 (the project has no sprints / is Kanban / next-gen), we fall back to
        // fetching the most-recently-updated open issues instead.
        const keyList = jiraProjectKeys.map((k) => `"${k}"`).join(', ');
        const fields = ['summary', 'status', 'assignee', 'priority', 'issuetype'];
        const sprintBody = { jql: `project in (${keyList}) AND sprint in openSprints() ORDER BY updated DESC`, fields, maxResults: 20 };
        const fallbackBody = { jql: `project in (${keyList}) AND statusCategory != Done ORDER BY updated DESC`, fields, maxResults: 20 };
        const postSearch = (body) => fetch(`${jiraBaseUrl}/rest/api/3/search/jql`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let response = await postSearch(sprintBody);
        // 400 = openSprints() not supported (Kanban / next-gen board)
        // 410 = sprint JQL function removed for this project type
        // Any other non-ok status from the sprint query → fall back to open-issues query
        if (!response.ok) {
            response = await postSearch(fallbackBody);
        }
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        const data = await response.json();
        res.json({ issues: data.issues ?? [] });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/transitions/:issueKey?projectId=my-project
// Returns the available status transitions for the given issue.
router.get('/transitions/:issueKey', async (req, res) => {
    try {
        const issueKey = String(req.params.issueKey);
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, { headers: { Authorization: `Basic ${ctx.auth}`, Accept: 'application/json' } });
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        const data = await response.json();
        res.json({ transitions: data.transitions ?? [] });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// POST /api/jira/transition/:issueKey?projectId=my-project
// Body: { transitionId: string }
// Applies the given transition to the issue.
router.post('/transition/:issueKey', async (req, res) => {
    try {
        const issueKey = String(req.params.issueKey);
        const { projectId } = req.query;
        const { transitionId } = req.body;
        if (!transitionId) {
            res.status(400).json({ error: 'transitionId is required in request body' });
            return;
        }
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${ctx.auth}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transition: { id: transitionId } }),
        });
        // Jira returns 204 No Content on success
        if (!response.ok && response.status !== 204) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        res.json({ ok: true });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// GET /api/jira/attachment/:attachmentId?projectId=my-project
// Proxies a Jira attachment (image or file) through the server so the client
// doesn't need to embed credentials in the browser request.
router.get('/attachment/:attachmentId', async (req, res) => {
    try {
        const attachmentId = String(req.params.attachmentId);
        const { projectId } = req.query;
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        // attachmentId here is the numeric Jira attachment ID (not the Media UUID).
        // /rest/api/3/attachment/content/:id returns the binary file directly.
        const contentUrl = `${ctx.baseUrl}/rest/api/3/attachment/content/${encodeURIComponent(attachmentId)}`;
        const contentResp = await fetch(contentUrl, {
            headers: { Authorization: `Basic ${ctx.auth}` },
            // Follow redirects (Jira sometimes issues a 303 to the actual CDN URL)
            redirect: 'follow',
        });
        if (!contentResp.ok) {
            const text = await contentResp.text();
            res.status(contentResp.status).json({ error: `Jira attachment error ${contentResp.status}: ${text.slice(0, 200)}` });
            return;
        }
        const contentType = contentResp.headers.get('content-type') ?? 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        const buf = await contentResp.arrayBuffer();
        res.end(Buffer.from(buf));
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
// PUT /api/jira/assign/:issueKey?projectId=my-project
// Body: { accountId: string | null }  — null = unassign
router.put('/assign/:issueKey', async (req, res) => {
    try {
        const issueKey = String(req.params.issueKey);
        const { projectId } = req.query;
        const { accountId } = req.body;
        // accountId may be explicitly null (unassign) or a string
        if (accountId === undefined) {
            res.status(400).json({ error: 'accountId is required in request body (use null to unassign)' });
            return;
        }
        const ctx = resolveJiraContext(projectId);
        if ('error' in ctx) {
            res.status(400).json({ error: ctx.error });
            return;
        }
        const response = await fetch(`${ctx.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, {
            method: 'PUT',
            headers: {
                Authorization: `Basic ${ctx.auth}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ accountId: accountId ?? null }),
        });
        // Jira returns 204 on success
        if (!response.ok && response.status !== 204) {
            const text = await response.text();
            res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
            return;
        }
        res.json({ ok: true });
    }
    catch (err) {
        res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
    }
});
exports.default = router;
