import { Router, Request, Response } from 'express';
import { readConfig } from '../config.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: build ADO auth context from config
// ---------------------------------------------------------------------------
function resolveAdoContext() {
  const config = readConfig();
  if (!config.ado?.orgUrl || !config.ado?.personalAccessToken) {
    return { error: 'No Azure DevOps config found. Add "ado": { "orgUrl": "...", "personalAccessToken": "..." } to your config.' } as const;
  }
  const orgUrl = config.ado.orgUrl.replace(/\/+$/, '');
  const auth = Buffer.from(`:${config.ado.personalAccessToken}`).toString('base64');
  const repos = config.projects.filter((p) => p.adoProject && p.adoRepoId);
  return { orgUrl, auth, repos, config };
}

async function adoFetch(orgUrl: string, auth: string, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(`ADO ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return {};
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// GET /api/ado/prs
//
// Lists pull requests across all configured ADO repositories.
//
// Query params:
//   status       - "active" (default) | "completed" | "abandoned" | "all"
//   creatorName  - partial, case-insensitive match on the PR author's display name
//   reviewerName - partial, case-insensitive match on a reviewer's display name
// ---------------------------------------------------------------------------
router.get('/prs', async (req: Request, res: Response) => {
  try {
    const ctx = resolveAdoContext();
    if ('error' in ctx) { res.status(400).json({ error: ctx.error }); return; }

    const { orgUrl, auth, repos } = ctx;
    if (!repos.length) { res.status(400).json({ error: 'No projects have adoProject + adoRepoId configured.' }); return; }

    const { status = 'active', creatorName, reviewerName } = req.query as {
      status?: string;
      creatorName?: string;
      reviewerName?: string;
    };

    const allPRs: unknown[] = [];

    await Promise.all(repos.map(async (p) => {
      const url = `${orgUrl}/${encodeURIComponent(p.adoProject!)}/_apis/git/repositories/${encodeURIComponent(p.adoRepoId!)}/pullrequests?searchCriteria.status=${status}&api-version=7.1`;
      const data = await adoFetch(orgUrl, auth, url);
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
          name: r.displayName,
          vote: r.vote,
        })),
        url: `${orgUrl}/${p.adoProject}/_git/${p.adoRepoId}/pullrequest/${pr.pullRequestId}`,
        project: p.id,
      }));
      allPRs.push(...prs);
    }));

    // Client-side filtering by name (partial, case-insensitive)
    let filtered = allPRs as Array<{
      createdBy: unknown;
      reviewers: Array<{ name: unknown }>;
    }>;

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

    res.json({ total: filtered.length, pullRequests: filtered });
  } catch (err) {
    res.status(502).json({ error: `ADO proxy error: ${String(err)}` });
  }
});

// ---------------------------------------------------------------------------
// Helpers: resolve adoProject + repoId for a PR from query or first configured repo
// ---------------------------------------------------------------------------
type RepoCtx = { orgUrl: string; auth: string; adoProject: string; repoId: string } | { error: string };

function resolveRepo(ctx: ReturnType<typeof resolveAdoContext>, adoProject?: string, repoId?: string): RepoCtx {
  if ('error' in ctx) return { error: ctx.error ?? 'ADO not configured.' };
  const proj = ctx.repos.find((p) => (!adoProject || p.adoProject === adoProject) && (!repoId || p.adoRepoId === repoId))
    ?? ctx.repos[0];
  if (!proj) return { error: 'No matching ADO repo configured.' };
  return { orgUrl: ctx.orgUrl, auth: ctx.auth, adoProject: proj.adoProject!, repoId: proj.adoRepoId! };
}

// ---------------------------------------------------------------------------
// Helper: look up the current user's ADO identity ID (needed for voting)
// ---------------------------------------------------------------------------
async function getCurrentUserId(orgUrl: string, auth: string): Promise<string> {
  const res = await fetch(`${orgUrl}/_apis/connectionData`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not fetch ADO identity: ${res.status}`);
  const data = await res.json() as { authenticatedUser?: { id?: string } };
  const id = data.authenticatedUser?.id;
  if (!id) throw new Error('Could not determine current ADO user identity');
  return id;
}

// ---------------------------------------------------------------------------
// POST /api/ado/prs/:prId/comments
//
// Add a top-level review comment (new thread) to an ADO pull request.
//
// Body: { content: string, adoProject?: string, repoId?: string }
// ---------------------------------------------------------------------------
router.post('/prs/:prId/comments', async (req: Request, res: Response) => {
  try {
    const prId = Number(req.params.prId);
    const { content, adoProject, repoId } = req.body as { content: string; adoProject?: string; repoId?: string };
    if (!content?.trim()) { res.status(400).json({ error: '"content" is required.' }); return; }

    const ctx = resolveAdoContext();
    const r = resolveRepo(ctx, adoProject, repoId);
    if ('error' in r) { res.status(400).json({ error: r.error }); return; }

    const url = `${r.orgUrl}/${encodeURIComponent(r.adoProject)}/_apis/git/repositories/${encodeURIComponent(r.repoId)}/pullRequests/${prId}/threads?api-version=7.1`;
    const thread = await adoFetch(r.orgUrl, r.auth, url, {
      method: 'POST',
      body: JSON.stringify({
        comments: [{ parentCommentId: 0, content, commentType: 1 }],
        status: 1,
      }),
    });
    const comment = (thread.comments as Record<string, unknown>[])?.[0];
    res.json({ threadId: thread.id, commentId: comment?.id, content });
  } catch (err) {
    res.status(502).json({ error: `ADO proxy error: ${String(err)}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ado/prs/:prId/vote
//
// Cast a vote on an ADO pull request as the authenticated user.
//
// Body: { vote: "approve" | "approve-with-suggestions" | "reject" | "wait" | "reset", adoProject?: string, repoId?: string }
// ---------------------------------------------------------------------------
const VOTE_MAP: Record<string, number> = {
  approve: 10,
  'approve-with-suggestions': 5,
  reset: 0,
  wait: -5,
  reject: -10,
};

router.post('/prs/:prId/vote', async (req: Request, res: Response) => {
  try {
    const prId = Number(req.params.prId);
    const { vote, adoProject, repoId } = req.body as { vote: string; adoProject?: string; repoId?: string };
    const voteValue = VOTE_MAP[vote];
    if (voteValue === undefined) {
      res.status(400).json({ error: `Invalid vote "${vote}". Use: approve, approve-with-suggestions, reject, wait, reset.` });
      return;
    }

    const ctx = resolveAdoContext();
    const r = resolveRepo(ctx, adoProject, repoId);
    if ('error' in r) { res.status(400).json({ error: r.error }); return; }

    const userId = await getCurrentUserId(r.orgUrl, r.auth);
    const url = `${r.orgUrl}/${encodeURIComponent(r.adoProject)}/_apis/git/repositories/${encodeURIComponent(r.repoId)}/pullRequests/${prId}/reviewers/${userId}?api-version=7.1`;
    await adoFetch(r.orgUrl, r.auth, url, {
      method: 'PUT',
      body: JSON.stringify({ vote: voteValue }),
    });
    res.json({ prId, vote, voteValue, userId });
  } catch (err) {
    res.status(502).json({ error: `ADO proxy error: ${String(err)}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ado/prs/:prId/threads/:threadId/reply
//
// Reply to an existing comment thread on an ADO pull request.
//
// Body: { content: string, adoProject?: string, repoId?: string }
// ---------------------------------------------------------------------------
router.post('/prs/:prId/threads/:threadId/reply', async (req: Request, res: Response) => {
  try {
    const prId = Number(req.params.prId);
    const threadId = Number(req.params.threadId);
    const { content, adoProject, repoId } = req.body as { content: string; adoProject?: string; repoId?: string };
    if (!content?.trim()) { res.status(400).json({ error: '"content" is required.' }); return; }

    const ctx = resolveAdoContext();
    const r = resolveRepo(ctx, adoProject, repoId);
    if ('error' in r) { res.status(400).json({ error: r.error }); return; }

    const url = `${r.orgUrl}/${encodeURIComponent(r.adoProject)}/_apis/git/repositories/${encodeURIComponent(r.repoId)}/pullRequests/${prId}/threads/${threadId}/comments?api-version=7.1`;
    const comment = await adoFetch(r.orgUrl, r.auth, url, {
      method: 'POST',
      body: JSON.stringify({ content, commentType: 1 }),
    });
    res.json({ threadId, commentId: comment.id, content });
  } catch (err) {
    res.status(502).json({ error: `ADO proxy error: ${String(err)}` });
  }
});

export default router;
