/**
 * apps/desktop/main/ipc/github.ts
 *
 * GitHub REST API integration via personal access token.
 * Token stored in OS keychain via keystore (provider: 'github').
 *
 * PART 1 — Types & constants
 * PART 2 — Rate-limit tracker
 * PART 3 — ETag response cache
 * PART 4 — Retry with exponential backoff
 * PART 5 — Core fetch helpers (pagination, Link header)
 * PART 6 — IPC handlers: User, Repos, PRs, Issues, Actions
 * PART 7 — IPC handlers: Search (repos, code, issues)
 * PART 8 — IPC handlers: PR Reviews
 * PART 9 — IPC handlers: Workflow dispatch
 * PART 10 — IPC handlers: Gists CRUD
 * PART 11 — Public registrar
 */

import { ipcMain } from 'electron';
import { getKey } from './keystore';

// ============================================================
// PART 1 — Types & constants
// ============================================================

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;
const RATE_LIMIT_WARN_THRESHOLD = 0.80;

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;         // Unix epoch seconds
  resource: string;
  warning: boolean;      // true when usage >= 80%
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    lastPage: number | null;
    nextCursor: string | null;
  };
  rateLimit: RateLimitInfo | null;
}

interface CacheEntry {
  etag: string;
  data: unknown;
  cachedAt: number;
}

// ============================================================
// PART 2 — Rate-limit tracker
// ============================================================

let lastRateLimit: RateLimitInfo | null = null;

function parseRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const resource = headers.get('x-ratelimit-resource');

  if (limit == null || remaining == null || reset == null) return null;

  const limitNum = parseInt(limit, 10);
  const remainingNum = parseInt(remaining, 10);
  const used = limitNum - remainingNum;
  const warning = limitNum > 0 && (used / limitNum) >= RATE_LIMIT_WARN_THRESHOLD;

  const info: RateLimitInfo = {
    limit: limitNum,
    remaining: remainingNum,
    reset: parseInt(reset, 10),
    resource: resource ?? 'core',
    warning,
  };

  lastRateLimit = info;

  if (warning) {
    const resetDate = new Date(info.reset * 1000).toISOString();
    console.warn(
      `[github] Rate limit warning: ${remainingNum}/${limitNum} remaining. ` +
      `Resets at ${resetDate} (resource: ${info.resource})`
    );
  }

  return info;
}

// ============================================================
// PART 3 — ETag response cache
// ============================================================

const etagCache = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes hard TTL

function getCacheKey(path: string, method: string): string {
  return `${method}:${path}`;
}

function pruneCache(): void {
  if (etagCache.size <= CACHE_MAX_ENTRIES) return;

  const entries = Array.from(etagCache.entries())
    .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

  const toRemove = entries.slice(0, entries.length - CACHE_MAX_ENTRIES);
  for (const [key] of toRemove) {
    etagCache.delete(key);
  }
}

function isStableEndpoint(path: string, method: string): boolean {
  if (method !== 'GET') return false;
  // Cache GET requests for repos, users, gists (not search — too dynamic)
  const stablePatterns = [
    /^\/repos\/[^/]+\/[^/]+$/,
    /^\/user$/,
    /^\/users\/[^/]+$/,
    /^\/gists\/[^/]+$/,
  ];
  return stablePatterns.some((p) => p.test(path));
}

// ============================================================
// PART 4 — Retry with exponential backoff
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // 429 Too Many Requests or 503 Service Unavailable → retry
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const retryAfter = res.headers.get('retry-after');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BACKOFF_BASE_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;

        console.warn(
          `[github] ${res.status} on attempt ${attempt + 1}. ` +
          `Retrying in ${Math.round(delayMs + jitter)}ms...`
        );
        await sleep(delayMs + jitter);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;

      // Network errors — retry with backoff
      if (attempt < retries) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        console.warn(
          `[github] Network error on attempt ${attempt + 1}: ${lastError.message}. ` +
          `Retrying in ${Math.round(delayMs + jitter)}ms...`
        );
        await sleep(delayMs + jitter);
        continue;
      }
    }
  }

  throw lastError ?? new Error('GitHub request failed after retries');
}

// ============================================================
// PART 5 — Core fetch helpers (pagination, Link header)
// ============================================================

function parseLinkHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const links: Record<string, string> = {};

  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (match) {
      links[match[2]] = match[1];
    }
  }
  return links;
}

function extractPageFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const page = u.searchParams.get('page');
    return page ? parseInt(page, 10) : null;
  } catch (err) {
    /* intentional: invalid URL — return null as fallback */
    console.warn('[github]', 'extractPageFromUrl parse failed:', err);
    return null;
  }
}

function extractCursorFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('after') ?? u.searchParams.get('cursor') ?? null;
  } catch (err) {
    /* intentional: invalid URL — return null as fallback */
    console.warn('[github]', 'extractCursorFromUrl parse failed:', err);
    return null;
  }
}

async function ghFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getKey('github');
  if (!token) throw new Error('No GitHub token configured. Add one in Settings.');

  const method = (options.method ?? 'GET').toUpperCase();
  const cacheKey = getCacheKey(path, method);
  const cached = etagCache.get(cacheKey);
  const extraHeaders: Record<string, string> = {};

  // Attach If-None-Match for cacheable endpoints
  if (cached && isStableEndpoint(path, method)) {
    const age = Date.now() - cached.cachedAt;
    if (age < CACHE_TTL_MS) {
      extraHeaders['If-None-Match'] = cached.etag;
    } else {
      etagCache.delete(cacheKey);
    }
  }

  const res = await fetchWithRetry(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...extraHeaders,
      ...(options.headers as Record<string, string> ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Track rate limits on every response
  parseRateLimit(res.headers);

  // 304 Not Modified — return cached data
  if (res.status === 304 && cached) {
    cached.cachedAt = Date.now(); // refresh TTL
    return new Response(JSON.stringify(cached.data), {
      status: 200,
      headers: res.headers,
    });
  }

  // Store ETag for cacheable responses
  const etag = res.headers.get('etag');
  if (etag && isStableEndpoint(path, method) && res.ok) {
    try {
      const cloned = res.clone();
      const data = await cloned.json();
      etagCache.set(cacheKey, { etag, data, cachedAt: Date.now() });
      pruneCache();
    } catch (err) {
      /* intentional: non-JSON or clone failed — skip caching */
      console.warn('[github]', 'ETag cache store skipped:', err);
    }
  }

  return res;
}

async function ghJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await ghFetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function ghPaginated<T>(
  path: string,
  options: RequestInit = {}
): Promise<PaginatedResponse<T>> {
  const res = await ghFetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as T[];
  const links = parseLinkHeader(res.headers.get('link'));
  const rateLimit = parseRateLimit(res.headers);

  return {
    data,
    pagination: {
      hasNext: !!links.next,
      hasPrev: !!links.prev,
      nextPage: links.next ? extractPageFromUrl(links.next) : null,
      lastPage: links.last ? extractPageFromUrl(links.last) : null,
      nextCursor: links.next ? extractCursorFromUrl(links.next) : null,
    },
    rateLimit,
  };
}

// ============================================================
// PART 6 — IPC handlers: User, Repos, PRs, Issues, Actions
// ============================================================

function wrapHandler<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  return fn().catch((err: Error) => ({ error: err.message }));
}

function registerCoreHandlers(): void {
  // -- User --
  ipcMain.handle('github:user', () =>
    wrapHandler(() => ghJson<{ login: string; name: string; avatar_url: string }>('/user'))
  );

  // -- Rate limit --
  ipcMain.handle('github:rate-limit', () =>
    wrapHandler(async () => {
      const data = await ghJson<{ resources: Record<string, unknown> }>('/rate_limit');
      return { ...data, lastTracked: lastRateLimit };
    })
  );

  // -- Repos --
  ipcMain.handle('github:list-repos', (_event, opts?: {
    per_page?: number; sort?: string; page?: number;
  }) =>
    wrapHandler(() => {
      const perPage = opts?.per_page ?? 30;
      const sort = opts?.sort ?? 'updated';
      const page = opts?.page ?? 1;
      return ghPaginated<unknown>(
        `/user/repos?per_page=${perPage}&sort=${sort}&page=${page}`
      );
    })
  );

  ipcMain.handle('github:get-repo', (_event, owner: string, repo: string) =>
    wrapHandler(() => ghJson(`/repos/${owner}/${repo}`))
  );

  // -- Pull Requests --
  ipcMain.handle('github:list-prs', (_event, owner: string, repo: string, opts?: {
    state?: string; page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const state = opts?.state ?? 'open';
      const page = opts?.page ?? 1;
      const perPage = opts?.per_page ?? 30;
      return ghPaginated(
        `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}&page=${page}`
      );
    })
  );

  ipcMain.handle('github:create-pr', (_event, owner: string, repo: string, data: {
    title: string; head: string; base: string; body?: string; draft?: boolean;
  }) =>
    wrapHandler(() => ghJson(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }))
  );

  // -- Issues --
  ipcMain.handle('github:list-issues', (_event, owner: string, repo: string, opts?: {
    state?: string; page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const state = opts?.state ?? 'open';
      const page = opts?.page ?? 1;
      const perPage = opts?.per_page ?? 30;
      return ghPaginated(
        `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`
      );
    })
  );

  ipcMain.handle('github:create-issue', (_event, owner: string, repo: string, data: {
    title: string; body?: string; labels?: string[];
  }) =>
    wrapHandler(() => ghJson(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }))
  );

  // -- Actions --
  ipcMain.handle('github:list-runs', (_event, owner: string, repo: string, opts?: {
    page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const perPage = opts?.per_page ?? 10;
      const page = opts?.page ?? 1;
      return ghJson(
        `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}&page=${page}`
      );
    })
  );

  // -- Clone URL --
  ipcMain.handle('github:clone-url', (_event, owner: string, repo: string) =>
    wrapHandler(async () => {
      const token = await getKey('github');
      if (!token) throw new Error('No GitHub token');
      return { url: `https://${token}@github.com/${owner}/${repo}.git` };
    })
  );
}

// ============================================================
// PART 7 — IPC handlers: Search (repos, code, issues)
// ============================================================

function registerSearchHandlers(): void {
  ipcMain.handle('github:search-repos', (_event, opts: {
    q: string; sort?: string; order?: string; page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const q = encodeURIComponent(opts.q);
      const sort = opts.sort ? `&sort=${opts.sort}` : '';
      const order = opts.order ? `&order=${opts.order}` : '';
      const page = opts.page ?? 1;
      const perPage = opts.per_page ?? 30;
      return ghJson(
        `/search/repositories?q=${q}${sort}${order}&page=${page}&per_page=${perPage}`
      );
    })
  );

  ipcMain.handle('github:search-code', (_event, opts: {
    q: string; sort?: string; order?: string; page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const q = encodeURIComponent(opts.q);
      const sort = opts.sort ? `&sort=${opts.sort}` : '';
      const order = opts.order ? `&order=${opts.order}` : '';
      const page = opts.page ?? 1;
      const perPage = opts.per_page ?? 30;
      return ghJson(
        `/search/code?q=${q}${sort}${order}&page=${page}&per_page=${perPage}`
      );
    })
  );

  ipcMain.handle('github:search-issues', (_event, opts: {
    q: string; sort?: string; order?: string; page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const q = encodeURIComponent(opts.q);
      const sort = opts.sort ? `&sort=${opts.sort}` : '';
      const order = opts.order ? `&order=${opts.order}` : '';
      const page = opts.page ?? 1;
      const perPage = opts.per_page ?? 30;
      return ghJson(
        `/search/issues?q=${q}${sort}${order}&page=${page}&per_page=${perPage}`
      );
    })
  );
}

// ============================================================
// PART 8 — IPC handlers: PR Reviews
// ============================================================

function registerReviewHandlers(): void {
  ipcMain.handle('github:list-reviews', (_event, owner: string, repo: string, prNumber: number) =>
    wrapHandler(() =>
      ghJson(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`)
    )
  );

  ipcMain.handle('github:submit-review', (_event, owner: string, repo: string, prNumber: number, data: {
    body?: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: Array<{ path: string; position?: number; body: string }>;
  }) =>
    wrapHandler(() =>
      ghJson(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  );
}

// ============================================================
// PART 9 — IPC handlers: Workflow dispatch
// ============================================================

function registerWorkflowHandlers(): void {
  ipcMain.handle('github:dispatch-workflow', (_event, owner: string, repo: string, data: {
    workflow_id: string | number;
    ref: string;
    inputs?: Record<string, string>;
  }) =>
    wrapHandler(async () => {
      const { workflow_id, ref, inputs } = data;
      const res = await ghFetch(
        `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref, inputs: inputs ?? {} }),
        }
      );

      // 204 No Content = success
      if (res.status === 204) return { ok: true };

      const text = await res.text().catch(() => '');
      throw new Error(`Workflow dispatch failed ${res.status}: ${text.slice(0, 300)}`);
    })
  );

  ipcMain.handle('github:list-workflows', (_event, owner: string, repo: string) =>
    wrapHandler(() =>
      ghJson(`/repos/${owner}/${repo}/actions/workflows`)
    )
  );
}

// ============================================================
// PART 10 — IPC handlers: Gists CRUD
// ============================================================

function registerGistHandlers(): void {
  ipcMain.handle('github:list-gists', (_event, opts?: {
    page?: number; per_page?: number;
  }) =>
    wrapHandler(() => {
      const page = opts?.page ?? 1;
      const perPage = opts?.per_page ?? 30;
      return ghPaginated(`/gists?page=${page}&per_page=${perPage}`);
    })
  );

  ipcMain.handle('github:get-gist', (_event, gistId: string) =>
    wrapHandler(() => ghJson(`/gists/${gistId}`))
  );

  ipcMain.handle('github:create-gist', (_event, data: {
    description?: string;
    public?: boolean;
    files: Record<string, { content: string }>;
  }) =>
    wrapHandler(() =>
      ghJson('/gists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  );

  ipcMain.handle('github:update-gist', (_event, gistId: string, data: {
    description?: string;
    files: Record<string, { content?: string; filename?: string } | null>;
  }) =>
    wrapHandler(() =>
      ghJson(`/gists/${gistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  );

  ipcMain.handle('github:delete-gist', (_event, gistId: string) =>
    wrapHandler(async () => {
      const res = await ghFetch(`/gists/${gistId}`, { method: 'DELETE' });
      if (res.status === 204) return { ok: true };
      const text = await res.text().catch(() => '');
      throw new Error(`Delete gist failed ${res.status}: ${text.slice(0, 300)}`);
    })
  );
}

// ============================================================
// PART 11 — Public registrar
// ============================================================

let registered = false;

export function registerGithubIpc(): void {
  if (registered) return;
  registered = true;

  registerCoreHandlers();
  registerSearchHandlers();
  registerReviewHandlers();
  registerWorkflowHandlers();
  registerGistHandlers();
}
