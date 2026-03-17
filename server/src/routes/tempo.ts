import { Router, Request, Response } from 'express';
import { readConfig, writeConfig } from '../config.js';

const router = Router();

const TEMPO_BASE = 'https://api.tempo.io/4';

/**
 * Best-effort: fills in issueKey for any entries where it is missing.
 * - First checks the persistent issueKeyCache stored in config.
 * - For anything still unknown, fires a single Jira JQL search and persists the new mappings.
 */
async function resolveIssueKeys(
  results: Array<{ issueId?: number; issueKey?: string }>,
  jiraBaseUrl: string,
  jiraAuth: string,
): Promise<void> {
  // Load cache from config (re-read so we always have freshest copy)
  const cfg = readConfig();
  const cache: Record<string, string> = cfg.issueKeyCache ?? {};
  console.log(`[resolveIssueKeys] cache has ${Object.keys(cache).length} entries. Input has ${results.length} worklogs.`);

  // Phase 1: satisfy from cache
  for (const entry of results) {
    if (!entry.issueKey && entry.issueId != null) {
      const cached = cache[String(entry.issueId)];
      if (cached) entry.issueKey = cached;
    }
  }

  // Phase 2: fetch the rest from Jira in one request
  const missing = results.filter((r) => !r.issueKey && r.issueId != null);
  console.log(`[resolveIssueKeys] ${results.length - missing.length} resolved from cache, ${missing.length} need Jira lookup. IDs: ${missing.map((r) => r.issueId).join(', ')}`);
  if (missing.length === 0) return;

  const ids = [...new Set(missing.map((r) => String(r.issueId)))];
  const jql = `id in (${ids.join(',')})`;  // all values are trusted integers

  try {
    const jiraSearchUrl = `${jiraBaseUrl}/rest/api/3/search/jql`;
    console.log(`[resolveIssueKeys] calling Jira: POST ${jiraSearchUrl} jql=${jql}`);
    const r = await fetch(jiraSearchUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${jiraAuth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields: ['key'], maxResults: ids.length }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.warn(`[resolveIssueKeys] Jira search failed: HTTP ${r.status} — ${body.slice(0, 200)}`);
      return;
    }
    const data = await r.json() as { issues?: { id: string; key: string }[] };
    const fetched = data.issues ?? [];
    console.log(`[resolveIssueKeys] Jira returned ${fetched.length} issues:`, JSON.stringify(fetched.map((i) => ({ id: i.id, key: i.key }))));

    // Build string-keyed map and apply
    const keyMap = new Map(fetched.map((i) => [i.id, i.key]));
    const newEntries: Record<string, string> = {};
    for (const entry of results) {
      if (!entry.issueKey && entry.issueId != null) {
        const key = keyMap.get(String(entry.issueId));
        if (key) {
          entry.issueKey = key;
          newEntries[String(entry.issueId)] = key;
        }
      }
    }

    // Persist new mappings to config cache
    if (Object.keys(newEntries).length > 0) {
      const latest = readConfig();
      latest.issueKeyCache = { ...(latest.issueKeyCache ?? {}), ...newEntries };
      writeConfig(latest);
    }
  } catch (err) {
    console.warn(`[resolveIssueKeys] error: ${String(err)}`);
  }
}

function resolveTempoToken() {
  const config = readConfig();
  const token = config.tempo?.apiToken;
  if (!token) return { error: 'No TEMPO API token configured in General Settings' } as const;
  return { token };
}

// GET /api/tempo/worklogs?issueId=12345
// Returns all worklogs for the given numeric Jira issue ID from TEMPO.
router.get('/worklogs', async (req: Request, res: Response) => {
  try {
    const { issueId } = req.query as { issueId?: string };
    if (!issueId || !/^\d+$/.test(issueId)) {
      res.status(400).json({ error: 'issueId query param is required and must be a positive integer' });
      return;
    }
    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const params = new URLSearchParams();
    params.set('issueId', issueId);
    params.set('limit', '1000');

    const response = await fetch(`${TEMPO_BASE}/worklogs?${params}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// POST /api/tempo/worklogs
// Body: { issueId: number, authorAccountId: string, timeSpentSeconds: number, startDate: string, description?: string }
// Creates a new worklog entry in TEMPO.
router.post('/worklogs', async (req: Request, res: Response) => {
  try {
    const { issueId, authorAccountId, timeSpentSeconds, startDate, description } = req.body as {
      issueId?: number;
      authorAccountId?: string;
      timeSpentSeconds?: number;
      startDate?: string;
      description?: string;
    };

    if (!issueId || !authorAccountId || !timeSpentSeconds || !startDate) {
      res.status(400).json({ error: 'issueId, authorAccountId, timeSpentSeconds, and startDate are required' });
      return;
    }

    // Validate integer issueId to prevent injection
    const numericIssueId = Math.trunc(Number(issueId));
    if (!Number.isFinite(numericIssueId) || numericIssueId <= 0) {
      res.status(400).json({ error: 'issueId must be a positive integer' });
      return;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      res.status(400).json({ error: 'startDate must be in YYYY-MM-DD format' });
      return;
    }

    if (timeSpentSeconds < 60) {
      res.status(400).json({ error: 'timeSpentSeconds must be at least 60 (1 minute)' });
      return;
    }

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const response = await fetch(`${TEMPO_BASE}/worklogs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issueId: numericIssueId,
        authorAccountId,
        timeSpentSeconds,
        startDate,
        startTime: '09:00:00',
        description: description ?? '',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` });
      return;
    }

    const data = await response.json();
    res.status(201).json(data);
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// PUT /api/tempo/worklogs/:id
// Updates an existing TEMPO worklog (description, timeSpentSeconds, startDate, etc.).
router.put('/worklogs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'Worklog id must be a positive integer' });
      return;
    }

    const { issueId, authorAccountId, timeSpentSeconds, startDate, description } = req.body as {
      issueId?: number;
      authorAccountId?: string;
      timeSpentSeconds?: number;
      startDate?: string;
      description?: string;
    };

    if (!issueId || !authorAccountId || !timeSpentSeconds || !startDate) {
      res.status(400).json({ error: 'issueId, authorAccountId, timeSpentSeconds, and startDate are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      res.status(400).json({ error: 'startDate must be in YYYY-MM-DD format' });
      return;
    }

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const response = await fetch(`${TEMPO_BASE}/worklogs/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ issueId, authorAccountId, timeSpentSeconds, startDate, description: description ?? '' }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// DELETE /api/tempo/worklogs/:id
// Deletes a TEMPO worklog by its tempoWorklogId.
router.delete('/worklogs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Validate that the id is a positive integer string
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'Worklog id must be a positive integer' });
      return;
    }

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const response = await fetch(`${TEMPO_BASE}/worklogs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ctx.token}` },
    });

    // TEMPO returns 204 No Content on success
    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// GET /api/tempo/my-worklogs?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns all Tempo worklogs for the currently authenticated Jira user in the given date range.
router.get('/my-worklogs', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      res.status(400).json({ error: 'from must be in YYYY-MM-DD format' }); return;
    }
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'to must be in YYYY-MM-DD format' }); return;
    }

    const config = readConfig();
    const jiraCreds = config.jira;
    if (!jiraCreds?.email || !jiraCreds?.apiToken) {
      res.status(400).json({ error: 'No Jira credentials configured in General Settings' }); return;
    }
    const baseUrl = jiraCreds.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) {
      res.status(400).json({ error: 'No Jira base URL configured in General Settings' }); return;
    }
    const jiraAuth = Buffer.from(`${jiraCreds.email}:${jiraCreds.apiToken}`).toString('base64');

    // Resolve current Jira user to get their accountId
    const meResp = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${jiraAuth}`, Accept: 'application/json' },
    });
    if (!meResp.ok) {
      res.status(meResp.status).json({ error: 'Could not resolve current Jira user — check Jira credentials in General Settings' }); return;
    }
    const meData = await meResp.json() as { accountId: string };
    const myAccountId = meData.accountId;
    console.log(`[my-worklogs] resolved accountId: ${myAccountId}`);

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const params = new URLSearchParams();
    params.set('authorAccountId', myAccountId);
    params.set('limit', '1000');
    if (from) params.set('from', from);
    if (to)   params.set('to', to);

    const tempoUrl = `${TEMPO_BASE}/worklogs?${params}`;
    console.log(`[my-worklogs] fetching: ${tempoUrl}`);

    const response = await fetch(tempoUrl, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` }); return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as { results?: any[] };
    const raw = data.results ?? [];

    // Log how many results came back and how many are actually mine
    const otherAuthors = [...new Set(raw.map((w) => w.author?.accountId).filter((id) => id !== myAccountId))];
    console.log(`[my-worklogs] total results: ${raw.length}, mine: ${raw.filter((w) => w.author?.accountId === myAccountId).length}, other authors: ${JSON.stringify(otherAuthors)}`);

    // Defensive filter: Tempo sometimes ignores authorAccountId (admin tokens) — always restrict to current user
    const mine = raw.filter((w) => !w.author?.accountId || w.author.accountId === myAccountId);

    const results = mine.map((w) => ({
      tempoWorklogId:   w.tempoWorklogId,
      issueId:          w.issue?.id  ?? w.issueId,
      issueKey:         w.issue?.key ?? undefined,
      timeSpentSeconds: w.timeSpentSeconds,
      startDate:        w.startDate,
      description:      w.description,
      author:           w.author,
    }));

    // Log the raw issue field of the first entry so we can see Tempo's actual shape
    if (mine.length > 0) {
      console.log(`[my-worklogs] first raw worklog .issue field:`, JSON.stringify(mine[0].issue));
      console.log(`[my-worklogs] first raw worklog .issueId field:`, mine[0].issueId);
      console.log(`[my-worklogs] first normalised entry issueId=${results[0].issueId} (type=${typeof results[0].issueId}) issueKey=${results[0].issueKey}`);
    }

    await resolveIssueKeys(results, baseUrl, jiraAuth);

    // Log outcome after resolution
    const stillMissing = results.filter((r) => !r.issueKey);
    console.log(`[my-worklogs] after resolve: ${results.length - stillMissing.length}/${results.length} have keys. Still missing: ${stillMissing.map((r) => r.issueId).join(', ') || 'none'}`);

    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// GET /api/tempo/my-teams
// Returns Tempo teams the currently authenticated Jira user is a member of.
router.get('/my-teams', async (req: Request, res: Response) => {
  try {
    const config = readConfig();
    const jiraCreds = config.jira;
    if (!jiraCreds?.email || !jiraCreds?.apiToken) {
      res.status(400).json({ error: 'No Jira credentials configured' }); return;
    }
    const baseUrl = jiraCreds.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) { res.status(400).json({ error: 'No Jira base URL configured' }); return; }
    const jiraAuth = Buffer.from(`${jiraCreds.email}:${jiraCreds.apiToken}`).toString('base64');

    const meResp = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${jiraAuth}`, Accept: 'application/json' },
    });
    if (!meResp.ok) { res.status(meResp.status).json({ error: 'Could not resolve current Jira user' }); return; }
    const meData = await meResp.json() as { accountId: string };
    const accountId = meData.accountId;

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const teamsResp = await fetch(`${TEMPO_BASE}/teams?limit=100`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });
    if (!teamsResp.ok) {
      const text = await teamsResp.text();
      res.status(teamsResp.status).json({ error: `TEMPO API error: ${text.slice(0, 200)}` }); return;
    }
    const teamsData = await teamsResp.json() as { results?: { id: number; name: string }[] };
    const allTeams = teamsData.results ?? [];

    if (allTeams.length === 0) { res.json({ teams: [] }); return; }

    // Check membership for all teams in parallel
    const checks = await Promise.all(
      allTeams.map(async (team) => {
        try {
          const r = await fetch(`${TEMPO_BASE}/teams/${team.id}/members`, {
            headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
          });
          if (!r.ok) return null;
          const d = await r.json() as { results?: { member?: { accountId?: string }; accountId?: string }[] };
          const members = d.results ?? [];
          const isMember = members.some(
            (m) => m.member?.accountId === accountId || m.accountId === accountId,
          );
          return isMember ? { id: team.id, name: team.name } : null;
        } catch { return null; }
      }),
    );

    res.json({ teams: checks.filter(Boolean) });
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

// GET /api/tempo/team-worklogs?teamId=123&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns all Tempo worklogs for a given team in the given date range.
router.get('/team-worklogs', async (req: Request, res: Response) => {
  try {
    const { teamId, from, to } = req.query as { teamId?: string; from?: string; to?: string };

    if (!teamId || !/^\d+$/.test(teamId)) {
      res.status(400).json({ error: 'teamId must be a positive integer' }); return;
    }
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      res.status(400).json({ error: 'from must be in YYYY-MM-DD format' }); return;
    }
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'to must be in YYYY-MM-DD format' }); return;
    }

    const ctx = resolveTempoToken();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const params = new URLSearchParams();
    params.set('teamId', teamId);
    params.set('limit', '1000');
    if (from) params.set('from', from);
    if (to)   params.set('to', to);

    const response = await fetch(`${TEMPO_BASE}/worklogs?${params}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `TEMPO API error ${response.status}: ${text.slice(0, 300)}` }); return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as { results?: any[] };
    const results = (data.results ?? []).map((w) => ({
      tempoWorklogId:   w.tempoWorklogId,
      issueId:          w.issue?.id  ?? w.issueId,
      issueKey:         w.issue?.key ?? undefined,
      timeSpentSeconds: w.timeSpentSeconds,
      startDate:        w.startDate,
      description:      w.description,
      author:           w.author,
    }));

    // Resolve missing issue keys from Jira in a single batch query
    const config2 = readConfig();
    const creds2 = config2.jira;
    if (creds2?.email && creds2?.apiToken && creds2?.baseUrl) {
      const base2 = creds2.baseUrl.replace(/\/+$/, '');
      const auth2 = Buffer.from(`${creds2.email}:${creds2.apiToken}`).toString('base64');
      await resolveIssueKeys(results, base2, auth2);
    }

    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: `TEMPO proxy error: ${String(err)}` });
  }
});

export default router;
