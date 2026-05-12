/**
 * GitHub API client for SignatureForge admin.
 *
 * Reads and writes files in a single repo using a fine-grained Personal
 * Access Token. Stored in localStorage between sessions. We use the
 * Contents API which gives us atomic per-file commits without needing
 * to manage trees and refs.
 *
 * https://docs.github.com/en/rest/repos/contents
 */

const STORAGE_KEY = "sf.gh.config";
const API = "https://api.github.com";

export const GH = {
  // ------------------- session -------------------
  loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  },

  saveSession(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  },

  clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  },

  // ------------------- core fetch -------------------
  async _fetch(path, opts = {}) {
    const cfg = this.loadSession();
    if (!cfg) throw new Error("Not authenticated.");
    const headers = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    };
    const url = path.startsWith("http") ? path : `${API}${path}`;
    const resp = await fetch(url, { ...opts, headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
    }
    if (resp.status === 204) return null;
    const ct = resp.headers.get("content-type") || "";
    return ct.includes("application/json") ? resp.json() : resp.text();
  },

  // ------------------- verify session -------------------
  async verify() {
    const cfg = this.loadSession();
    if (!cfg) throw new Error("No session.");
    // Check token validity by fetching user info, then repo info.
    const user = await this._fetch("/user");
    const repo = await this._fetch(`/repos/${cfg.owner}/${cfg.repo}`);
    return { user, repo };
  },

  // ------------------- file ops -------------------

  // Encode each path segment but preserve / as a separator. The Contents
  // API expects the full repo path with slashes intact.
  _encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  },

  /**
   * Read a file as text. Returns { text, sha } where sha is required
   * to update or delete the file later.
   */
  async readFile(path) {
    const cfg = this.loadSession();
    const data = await this._fetch(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${this._encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
    );
    // Decode base64 (GitHub returns base64 with newlines).
    const text = data.encoding === "base64"
      ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))))
      : data.content;
    return { text, sha: data.sha };
  },

  /**
   * Write a file. If `sha` is provided, updates; otherwise creates.
   * Returns the new sha.
   */
  async writeFile(path, content, message, sha = null) {
    const cfg = this.loadSession();
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: cfg.branch,
    };
    if (sha) body.sha = sha;
    const data = await this._fetch(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${this._encodePath(path)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
    return data.content.sha;
  },

  /**
   * List directory contents. Returns array of { name, path, type, sha }.
   */
  async listDir(path) {
    const cfg = this.loadSession();
    const data = await this._fetch(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${this._encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
    );
    return Array.isArray(data) ? data : [];
  },

  /**
   * Delete a file by path. Requires the current sha.
   */
  async deleteFile(path, sha, message) {
    const cfg = this.loadSession();
    return this._fetch(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${this._encodePath(path)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ message, sha, branch: cfg.branch }),
      }
    );
  },
};
