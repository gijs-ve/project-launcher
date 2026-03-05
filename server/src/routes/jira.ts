import { Router, Request, Response } from 'express';
import { readConfig } from '../config.js';

const router = Router();

// GET /api/jira/issues?projectId=my-project
// Proxies to the Jira REST API using credentials + per-project settings stored in config.
// Returns { issues: JiraIssue[] } or { error: string }.
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as { projectId?: string };

    if (!projectId) {
      res.status(400).json({ error: 'projectId query param is required' });
      return;
    }

    const config = readConfig();

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: `Project '${projectId}' not found` });
      return;
    }

    const { jiraBaseUrl, jiraProjectKeys } = project;
    if (!jiraBaseUrl || !jiraProjectKeys?.length) {
      res.status(400).json({ error: 'Project has no Jira config (jiraBaseUrl / jiraProjectKeys)' });
      return;
    }

    const creds = config.jira;
    if (!creds?.email || !creds?.apiToken) {
      res.status(400).json({ error: 'No Jira credentials configured in General Settings' });
      return;
    }

    const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');

    // Fetch active sprint issues via the Jira REST API v3
    const keyList = jiraProjectKeys.map((k) => `"${k}"`).join(', ');
    const jql = `project in (${keyList}) AND sprint in openSprints() ORDER BY updated DESC`;
    const fields = 'summary,status,assignee,priority,issuetype';
    const jiraUrl = `${jiraBaseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=20&fields=${fields}`;

    const response = await fetch(jiraUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `Jira API error ${response.status}: ${text.slice(0, 200)}` });
      return;
    }

    const data = await response.json() as { issues: unknown[] };
    res.json({ issues: data.issues ?? [] });
  } catch (err) {
    res.status(502).json({ error: `Jira proxy error: ${String(err)}` });
  }
});

export default router;
