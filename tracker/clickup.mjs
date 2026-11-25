// Minimal ClickUp REST API v2 client for the adlc-3d tracker.
// The token is read by the caller from the environment and never logged: every error message
// passes through redact() before it leaves this module.

const DEFAULT_BASE = "https://api.clickup.com/api/v2";
const MAX_RATE_WAIT_MS = 60_000;
const RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;

export class TrackerError extends Error {
  // kind: "auth" (token missing or refused), "unavailable" (network, 5xx, rate limit),
  // or "request" (ClickUp rejected the request itself)
  constructor(kind, message, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

// Only a local mock server may replace the real API, so a stray variable cannot send the token elsewhere.
export function resolveBaseUrl(override) {
  if (!override) return DEFAULT_BASE;
  let url;
  try {
    url = new URL(override);
  } catch {
    throw new TrackerError("request", "CLICKUP_API_URL is not a valid URL");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new TrackerError("request", "CLICKUP_API_URL may only point at localhost (it exists for tests)");
  return override.replace(/\/$/, "");
}

export function createClient({ token, baseUrl, fetchImpl = globalThis.fetch, sleep = defaultSleep }) {
  if (!token) throw new TrackerError("auth", "CLICKUP_API_TOKEN is not set in this shell");
  if (typeof fetchImpl !== "function") throw new TrackerError("request", "this Node.js has no fetch; use Node 18 or later");
  const base = resolveBaseUrl(baseUrl);
  // Against a local mock server (tests only) waits are shortened, so retry tests run quickly.
  const wait = baseUrl ? (ms) => sleep(Math.ceil(ms / 100)) : sleep;
  const redact = (text) => String(text).split(token).join("[token]");

  async function request(method, path, body) {
    // A POST that fails on the network or with a 5xx may still have been applied, so it is not
    // retried here. The caller queues it, and the replay finds a created card by its name.
    const retryable = method !== "POST";
    let lastError = null;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          method,
          headers: { Authorization: token, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = new TrackerError("unavailable", `cannot reach ClickUp (${redact(error.message)})`);
        if (!retryable) break;
        await wait(1000 * (attempt + 1));
        continue;
      }
      if (response.status === 429) {
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const resetIn = Number.isFinite(reset) && reset > 0 ? reset * 1000 - Date.now() : 5000;
        lastError = new TrackerError("unavailable", "ClickUp rate limit reached", 429);
        await wait(Math.min(Math.max(resetIn, 1000), MAX_RATE_WAIT_MS));
        continue;
      }
      if (response.status >= 500) {
        lastError = new TrackerError("unavailable", `ClickUp returned ${response.status}`, response.status);
        if (!retryable) break;
        await wait(1000 * (attempt + 1));
        continue;
      }
      const text = await response.text();
      // ClickUp answers 401 with ITEM_013 for a task that was deleted; that is not a token problem.
      if (response.status === 404 || (response.status === 401 && /ITEM_0\d\d/.test(text)))
        throw new TrackerError("request", `ClickUp has no ${path} (deleted or moved)`, 404);
      if (response.status === 401 || response.status === 403)
        throw new TrackerError("auth", `ClickUp refused the token or the List (${response.status})`, response.status);
      if (!response.ok)
        throw new TrackerError("request", `ClickUp rejected ${method} ${path}: ${response.status} ${redact(text).slice(0, 300)}`, response.status);
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new TrackerError("request", `ClickUp sent a response that is not JSON for ${method} ${path}`);
      }
    }
    throw lastError;
  }

  return {
    getList: (listId) => request("GET", `/list/${encodeURIComponent(listId)}`),
    getTask: (taskId) => request("GET", `/task/${encodeURIComponent(taskId)}?include_markdown_description=true`),
    createTask: (listId, body) => request("POST", `/list/${encodeURIComponent(listId)}/task`, body),
    updateTask: (taskId, body) => request("PUT", `/task/${encodeURIComponent(taskId)}`, body),
    // notifyAll alerts the task's watchers; used for approval requests, so approvers see them.
    addComment: (taskId, text, { notifyAll = false } = {}) =>
      request("POST", `/task/${encodeURIComponent(taskId)}/comment`, { comment_text: text, notify_all: notifyAll }),
    getUser: () => request("GET", "/user"),
    getTeams: () => request("GET", "/team"),
    getCustomItems: (teamId) => request("GET", `/team/${encodeURIComponent(teamId)}/custom_item`),
    addTag: (taskId, tag) => request("POST", `/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(tag)}`),
    removeTag: (taskId, tag) => request("DELETE", `/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(tag)}`),
    listReplies: async (commentId) => {
      const data = await request("GET", `/comment/${encodeURIComponent(commentId)}/reply`);
      return Array.isArray(data.comments) ? data.comments : [];
    },
    // Comments come newest first, 25 at a time; older pages are asked for by the oldest comment seen.
    async listComments(taskId) {
      const comments = [];
      let cursor = "";
      for (let page = 0; page < 40; page += 1) {
        const data = await request("GET", `/task/${encodeURIComponent(taskId)}/comment${cursor}`);
        const batch = Array.isArray(data.comments) ? data.comments : [];
        comments.push(...batch);
        if (batch.length < 25) break;
        const oldest = batch[batch.length - 1];
        cursor = `?start=${encodeURIComponent(oldest.date)}&start_id=${encodeURIComponent(oldest.id)}`;
      }
      return comments;
    },
    async listTasks(listId) {
      const tasks = [];
      for (let page = 0; page < 100; page += 1) {
        const data = await request(
          "GET",
          `/list/${encodeURIComponent(listId)}/task?include_closed=true&subtasks=true&archived=false&page=${page}`
        );
        const batch = Array.isArray(data.tasks) ? data.tasks : [];
        tasks.push(...batch);
        if (data.last_page === true || batch.length === 0) break;
      }
      return tasks;
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
