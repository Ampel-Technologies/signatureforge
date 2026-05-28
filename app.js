/**
 * SignatureForge Admin - main app
 *
 * A small framework-free SPA. State lives in module-level vars, views are
 * pure render functions returning HTML strings, mutations re-render. We
 * trade some elegance for zero dependencies; the entire surface fits in
 * one file and is easy to fork.
 *
 * Architecture:
 *   route() ----> state.view ----> render() ----> innerHTML on #root
 *
 * Persistence is via the GitHub Contents API (admin/github.js).
 */

import { GH } from "./github.js";

// =============================================================
// State
// =============================================================

const state = {
  view: "auth",                // "auth" | "users" | "templates" | "settings"
  authed: false,
  authedUser: null,            // GitHub user info from /user
  authedRepo: null,            // repo info
  users: [],                   // parsed users.json contents
  usersSha: null,              // current SHA for users.json
  templates: [],               // [{name, sha, text}]
  modal: null,                 // {type, payload}
  selectedTemplate: null,      // template name being edited
  templateBuffer: "",          // unsaved template text
  loading: false,
};

// =============================================================
// Utilities
// =============================================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function html(strings, ...values) {
  // Tagged template literal that just concatenates. Used purely for
  // editor highlighting; values are NOT auto-escaped, so callers must
  // sanitize untrusted input with esc() below.
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function toast(message, type = "info") {
  const root = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Render template HTML with sample data to feed live preview.
function renderTemplatePreview(templateHtml, fields) {
  let out = templateHtml.replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, k) => fields[k] ?? "");
  out = out.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => esc(fields[k] ?? ""));
  return out;
}

const SAMPLE_FIELDS = {
  displayName: "Avery Lin",
  pronouns: "(they/them)",
  title: "Director of Programs",
  organization: "Sample Organization",
  email: "avery@example.org",
  phone: "(555) 010-2030",
  website: "https://example.org",
  address: "Brooklyn, NY",
};

// =============================================================
// Boot
// =============================================================

async function boot() {
  const session = GH.loadSession();
  if (!session) {
    state.view = "auth";
    return render();
  }
  try {
    const { user, repo } = await GH.verify();
    state.authed = true;
    state.authedUser = user;
    state.authedRepo = repo;
    state.view = "users";
    await loadAll();
  } catch (e) {
    console.warn("Session verify failed:", e);
    GH.clearSession();
    state.view = "auth";
  }
  render();
}

async function loadAll() {
  state.loading = true;
  render();
  try {
    // users.json
    const u = await GH.readFile("config/users.json");
    const parsed = JSON.parse(u.text);
    state.users = parsed.users || [];
    state.usersSha = u.sha;

    // templates/
    const dir = await GH.listDir("config/templates");
    const tplFiles = dir.filter((f) => f.type === "file" && f.name.endsWith(".html"));
    state.templates = await Promise.all(tplFiles.map(async (f) => {
      const t = await GH.readFile(f.path);
      return {
        name: f.name.replace(/\.html$/, ""),
        path: f.path,
        sha: t.sha,
        text: t.text,
      };
    }));
  } catch (e) {
    toast("Failed to load config: " + e.message, "error");
  } finally {
    state.loading = false;
    render();
  }
}

// =============================================================
// Auth view
// =============================================================

function viewAuth() {
  return html`
    <div class="auth-page">
      <div class="auth-card">
        <h1>SignatureForge</h1>
        <p>Connect your GitHub repo to manage signatures. Your token is stored locally in this browser only.</p>

        <form id="authForm">
          <div class="field-grid">
            <div class="field">
              <label>GitHub username</label>
              <input name="owner" required placeholder="your-handle" autocomplete="username" />
            </div>
            <div class="field">
              <label>Repository</label>
              <input name="repo" required placeholder="signatureforge" />
            </div>
          </div>
          <div class="field">
            <label>Branch</label>
            <input name="branch" required value="main" />
          </div>
          <div class="field">
            <label>Personal Access Token</label>
            <input name="token" required type="password" placeholder="github_pat_..." autocomplete="off" />
            <div class="hint">Fine-grained PAT, scoped to this single repo, with <code>Contents: Read &amp; write</code>.</div>
          </div>
          <button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:8px;">
            Connect
          </button>
        </form>

        <details>
          <summary>How to create the token</summary>
          <ol>
            <li>Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.</li>
            <li>Click <strong>Generate new token</strong>. Name it <span class="mono">SignatureForge Admin</span>.</li>
            <li>Set expiration. Under <strong>Repository access</strong> choose <em>Only select repositories</em> and pick this one.</li>
            <li>Under <strong>Repository permissions</strong>, set <span class="mono">Contents: Read and write</span>. Leave everything else.</li>
            <li>Generate, copy the <span class="mono">github_pat_...</span> string, paste above.</li>
          </ol>
        </details>
      </div>
    </div>
  `;
}

function bindAuth() {
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const cfg = Object.fromEntries(fd.entries());
    GH.saveSession(cfg);
    try {
      const { user, repo } = await GH.verify();
      state.authed = true;
      state.authedUser = user;
      state.authedRepo = repo;
      state.view = "users";
      await loadAll();
      toast(`Connected to ${repo.full_name}`, "success");
    } catch (err) {
      GH.clearSession();
      toast("Connection failed: " + err.message, "error");
    }
  });
}

// =============================================================
// App shell
// =============================================================

function viewShell(content) {
  const repo = state.authedRepo;
  return html`
    <div class="app">
      <div class="topbar">
        <div class="brand">
          <span>SignatureForge</span>
          <span class="dot"></span>
          <span class="meta">admin</span>
        </div>
        <div class="topbar-right">
          ${repo ? `<span class="repo-pill"><span class="ok">●</span> ${esc(repo.full_name)}</span>` : ""}
          <button class="btn ghost sm" id="signoutBtn">Sign out</button>
        </div>
      </div>
      <div class="shell">
        <aside class="sidebar">
          <div class="nav-section">Manage</div>
          <button class="nav-item ${state.view === "users" ? "active" : ""}" data-view="users">
            <span>Users</span>
            <span class="badge">${state.users.length}</span>
          </button>
          <button class="nav-item ${state.view === "templates" ? "active" : ""}" data-view="templates">
            <span>Templates</span>
            <span class="badge">${state.templates.length}</span>
          </button>
          <div class="nav-section">Help</div>
          <button class="nav-item" data-view="settings">
            <span>Deployment</span>
          </button>
        </aside>
        <main class="main">
          ${content}
        </main>
      </div>
    </div>
    ${state.modal ? viewModal(state.modal) : ""}
  `;
}

function bindShell() {
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      state.selectedTemplate = null;
      render();
    });
  });
  const so = $("#signoutBtn");
  if (so) so.addEventListener("click", () => {
    if (confirm("Sign out and clear your local token?")) {
      GH.clearSession();
      state.authed = false;
      state.view = "auth";
      render();
    }
  });
}

// =============================================================
// Users view
// =============================================================

function viewUsers() {
  if (state.loading && state.users.length === 0) {
    return html`<div class="empty-state"><div class="icon">…</div>Loading.</div>`;
  }
  return html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Users</h1>
        <div class="page-subtitle">Each user is mapped to one template. Their next email picks up changes within seconds.</div>
      </div>
      <button class="btn primary" id="addUserBtn">+ Add user</button>
    </div>

    ${state.users.length === 0 ? html`
      <div class="empty-state">
        <div class="icon">∅</div>
        <div>No users yet. Add the first one to enroll them in centrally managed signatures.</div>
      </div>
    ` : html`
      <div class="list">
        <div class="list-row header">
          <div>Name</div><div>Email</div><div>Template</div><div></div>
        </div>
        ${state.users.map((u, i) => html`
          <div class="list-row">
            <div class="name">${esc(u.fields?.displayName || "(no name)")}</div>
            <div class="email">${esc(u.email)}</div>
            <div><span class="template-tag">${esc(u.template || "default")}</span></div>
            <div class="actions">
              <button class="btn sm" data-edit-user="${i}">Edit</button>
              <button class="btn sm danger" data-del-user="${i}">Delete</button>
            </div>
          </div>
        `).join("")}
      </div>
    `}
  `;
}

function bindUsers() {
  const add = $("#addUserBtn");
  if (add) add.addEventListener("click", () => openUserModal(null));
  $$("[data-edit-user]").forEach((b) => {
    b.addEventListener("click", () => openUserModal(parseInt(b.dataset.editUser, 10)));
  });
  $$("[data-del-user]").forEach((b) => {
    b.addEventListener("click", () => deleteUser(parseInt(b.dataset.delUser, 10)));
  });
}

function openUserModal(index) {
  const isNew = index === null;
  const user = isNew
    ? { email: "", template: state.templates[0]?.name || "default", fields: {
        displayName: "", pronouns: "", title: "", organization: "",
        email: "", phone: "", website: "", address: "",
      }}
    : JSON.parse(JSON.stringify(state.users[index]));
  state.modal = { type: "user", index, user, isNew };
  render();
}

async function deleteUser(index) {
  const u = state.users[index];
  if (!confirm(`Delete ${u.email}?`)) return;
  state.users.splice(index, 1);
  await persistUsers(`Remove ${u.email}`);
}

async function persistUsers(commitMessage) {
  state.loading = true;
  render();
  try {
    const payload = {
      version: 1,
      updated: new Date().toISOString().slice(0, 10),
      users: state.users,
    };
    const newSha = await GH.writeFile(
      "config/users.json",
      JSON.stringify(payload, null, 2) + "\n",
      commitMessage,
      state.usersSha
    );
    state.usersSha = newSha;
    toast(commitMessage, "success");
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  } finally {
    state.loading = false;
    state.modal = null;
    render();
  }
}

// =============================================================
// User modal
// =============================================================

function viewModal(modal) {
  if (modal.type === "user") return viewUserModal(modal);
  return "";
}

function viewUserModal({ user, isNew }) {
  const tplOptions = state.templates.length
    ? state.templates.map(t => `<option value="${esc(t.name)}" ${user.template === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")
    : `<option value="default">default</option>`;
  return html`
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>${isNew ? "Add user" : "Edit user"}</h2>
          <button class="btn ghost sm" id="modalClose">✕</button>
        </div>
        <div class="modal-body">
          <form id="userForm">
            <div class="field">
              <label>Mailbox email (login)</label>
              <input name="email" required value="${esc(user.email)}" placeholder="user@example.org" />
              <div class="hint">Must match the mailbox primary SMTP address exactly.</div>
            </div>
            <div class="field">
              <label>Template</label>
              <select name="template">${tplOptions}</select>
            </div>
            <div class="hairline"></div>
            <div class="field-grid">
              <div class="field">
                <label>Display name</label>
                <input name="displayName" value="${esc(user.fields.displayName || "")}" />
              </div>
              <div class="field">
                <label>Pronouns</label>
                <input name="pronouns" value="${esc(user.fields.pronouns || "")}" placeholder="(she/her)" />
              </div>
              <div class="field">
                <label>Title</label>
                <input name="title" value="${esc(user.fields.title || "")}" />
              </div>
              <div class="field">
                <label>Organization</label>
                <input name="organization" value="${esc(user.fields.organization || "")}" />
              </div>
              <div class="field">
                <label>Display email</label>
                <input name="fieldEmail" value="${esc(user.fields.email || "")}" />
              </div>
              <div class="field">
                <label>Phone</label>
                <input name="phone" value="${esc(user.fields.phone || "")}" />
              </div>
              <div class="field">
                <label>Website</label>
                <input name="website" value="${esc(user.fields.website || "")}" />
              </div>
              <div class="field">
                <label>Address</label>
                <input name="address" value="${esc(user.fields.address || "")}" />
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="modalCancel">Cancel</button>
          <button class="btn primary" id="modalSave">Save</button>
        </div>
      </div>
    </div>
  `;
}

function bindModal() {
  if (!state.modal) return;
  const close = () => { state.modal = null; render(); };
  $("#modalClose")?.addEventListener("click", close);
  $("#modalCancel")?.addEventListener("click", close);
  $("#modalBackdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") close();
  });
  $("#modalSave")?.addEventListener("click", async () => {
    const form = $("#userForm");
    const fd = new FormData(form);
    const v = Object.fromEntries(fd.entries());
    const updated = {
      email: v.email.trim(),
      template: v.template,
      fields: {
        displayName: v.displayName.trim(),
        pronouns: v.pronouns.trim(),
        title: v.title.trim(),
        organization: v.organization.trim(),
        email: v.fieldEmail.trim() || v.email.trim(),
        phone: v.phone.trim(),
        website: v.website.trim(),
        address: v.address.trim(),
      },
    };
    if (!updated.email) {
      toast("Email is required.", "error");
      return;
    }
    if (state.modal.isNew) {
      state.users.push(updated);
      await persistUsers(`Add ${updated.email}`);
    } else {
      state.users[state.modal.index] = updated;
      await persistUsers(`Update ${updated.email}`);
    }
  });
}

// =============================================================
// Templates view
// =============================================================

function viewTemplates() {
  if (state.selectedTemplate) return viewTemplateEditor();

  return html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Templates</h1>
        <div class="page-subtitle">HTML signature templates with <span class="kbd">{{token}}</span> placeholders. Triple braces inject raw HTML.</div>
      </div>
      <button class="btn primary" id="addTemplateBtn">+ New template</button>
    </div>

    ${state.templates.length === 0 ? html`
      <div class="empty-state"><div class="icon">∅</div>No templates found.</div>
    ` : html`
      <div class="list">
        <div class="list-row header" style="grid-template-columns:1fr 100px;">
          <div>Name</div><div></div>
        </div>
        ${state.templates.map(t => html`
          <div class="list-row" style="grid-template-columns:1fr 100px;">
            <div class="name mono">${esc(t.name)}.html</div>
            <div class="actions">
              <button class="btn sm" data-edit-tpl="${esc(t.name)}">Open</button>
            </div>
          </div>
        `).join("")}
      </div>
    `}
  `;
}

function bindTemplates() {
  $$("[data-edit-tpl]").forEach(b => {
    b.addEventListener("click", () => {
      const name = b.dataset.editTpl;
      const t = state.templates.find(x => x.name === name);
      state.selectedTemplate = name;
      state.templateBuffer = t.text;
      render();
    });
  });
  $("#addTemplateBtn")?.addEventListener("click", () => {
    const name = prompt("New template name (lowercase, no spaces):", "");
    if (!name) return;
    const safe = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!safe || state.templates.find(t => t.name === safe)) {
      toast("Invalid or duplicate name.", "error");
      return;
    }
    state.templates.push({
      name: safe,
      path: `config/templates/${safe}.html`,
      sha: null,
      text: "<div>{{displayName}}</div>\n",
    });
    state.selectedTemplate = safe;
    state.templateBuffer = state.templates.find(t => t.name === safe).text;
    render();
  });
}

function viewTemplateEditor() {
  const t = state.templates.find(x => x.name === state.selectedTemplate);
  if (!t) return "";
  const previewHtml = renderTemplatePreview(state.templateBuffer, SAMPLE_FIELDS);

  return html`
    <div class="page-header">
      <div>
        <h1 class="page-title" style="font-size:28px;">
          <span class="muted" style="font-size:14px;font-family:var(--mono);font-style:normal;">templates /</span>
          ${esc(t.name)}.html
        </h1>
        <div class="page-subtitle">Preview uses sample data. Tokens: ${Object.keys(SAMPLE_FIELDS).map(k => `<span class="kbd">${k}</span>`).join(" ")}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn ghost" id="closeTplBtn">← Back</button>
        ${t.sha ? `<button class="btn danger" id="deleteTplBtn">Delete</button>` : ""}
        <button class="btn primary" id="saveTplBtn">Save</button>
      </div>
    </div>

    <div class="editor-grid">
      <div class="panel">
        <div class="panel-header">
          <span>HTML source</span>
          <span class="muted">.html</span>
        </div>
        <div class="panel-body tight">
          <textarea class="code-area" id="tplEditor" spellcheck="false">${esc(state.templateBuffer)}</textarea>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <span>Live preview</span>
          <span class="muted">sample data</span>
        </div>
        <div class="panel-body">
          <iframe id="tplPreview" class="preview-frame" sandbox=""></iframe>
        </div>
      </div>
    </div>
  `;
}

function bindTemplateEditor() {
  const editor = $("#tplEditor");
  const preview = $("#tplPreview");
  if (!editor || !preview) return;

  const updatePreview = () => {
    const html = renderTemplatePreview(editor.value, SAMPLE_FIELDS);
    preview.srcdoc = `<!DOCTYPE html><html><body style="margin:24px;font-family:system-ui;">${html}</body></html>`;
  };
  updatePreview();
  editor.addEventListener("input", () => {
    state.templateBuffer = editor.value;
    updatePreview();
  });

  $("#closeTplBtn").addEventListener("click", () => {
    state.selectedTemplate = null;
    render();
  });

  $("#saveTplBtn").addEventListener("click", async () => {
    const name = state.selectedTemplate;
    const tpl = state.templates.find(x => x.name === name);
    state.loading = true; render();
    try {
      const newSha = await GH.writeFile(
        `config/templates/${name}.html`,
        state.templateBuffer,
        tpl.sha ? `Update template ${name}` : `Create template ${name}`,
        tpl.sha
      );
      tpl.sha = newSha;
      tpl.text = state.templateBuffer;
      toast(`Saved ${name}.html`, "success");
    } catch (e) {
      toast("Save failed: " + e.message, "error");
    } finally {
      state.loading = false;
      render();
    }
  });

  const del = $("#deleteTplBtn");
  if (del) del.addEventListener("click", async () => {
    const name = state.selectedTemplate;
    const tpl = state.templates.find(x => x.name === name);
    if (!confirm(`Delete template ${name}.html? Users referencing it will break.`)) return;
    try {
      await GH.deleteFile(`config/templates/${name}.html`, tpl.sha, `Delete template ${name}`);
      state.templates = state.templates.filter(x => x.name !== name);
      state.selectedTemplate = null;
      toast(`Deleted ${name}.html`, "success");
      render();
    } catch (e) {
      toast("Delete failed: " + e.message, "error");
    }
  });
}

// =============================================================
// Settings / deployment view
// =============================================================

function viewSettings() {
  const repo = state.authedRepo;
  const pagesUrl = repo
    ? `https://${repo.owner.login}.github.io/${repo.name}/`
    : "https://YOUR-USERNAME.github.io/YOUR-REPO/";
  return html`
    <div class="page-header">
      <div>
        <h1 class="page-title">Deployment</h1>
        <div class="page-subtitle">Where your add-in lives and how it loads.</div>
      </div>
    </div>

    <div class="panel" style="padding:var(--gap-md);">
      <h3 style="margin-top:0;font-family:var(--display);font-style:italic;font-weight:300;font-size:22px;">Public URLs</h3>
      <div class="field">
        <label>GitHub Pages base</label>
        <input readonly value="${esc(pagesUrl)}" />
      </div>
      <div class="field">
        <label>Manifest (upload this to Microsoft 365 admin center)</label>
        <input readonly value="${esc(pagesUrl)}manifest.xml" />
      </div>
      <div class="field">
        <label>Users config (read by the add-in at compose time)</label>
        <input readonly value="${esc(pagesUrl)}config/users.json" />
      </div>
      <div class="hint">After every save the cached config refreshes within ~60 seconds. Use a hard refresh in Outlook on the web to bypass the cache while testing.</div>
    </div>

    <div class="hairline"></div>

    <div class="panel" style="padding:var(--gap-md);">
      <h3 style="margin-top:0;font-family:var(--display);font-style:italic;font-weight:300;font-size:22px;">Deployment checklist</h3>
      <ol style="line-height:1.9;">
        <li>Replace <span class="kbd">Ampel-Technologies</span> in <span class="mono">manifest.xml</span> and <span class="mono">addin/launchevent.js</span>.</li>
        <li>In your repo settings, enable GitHub Pages on the <span class="mono">main</span> branch, root path.</li>
        <li>Wait for Pages to deploy (one to two minutes the first time).</li>
        <li>In Microsoft 365 admin center → Settings → Integrated apps → Upload custom app → upload the manifest.xml URL above.</li>
        <li>Assign to the security group of staff who should receive managed signatures. Allow up to 24 hours to propagate.</li>
        <li>Have a user open Outlook (any platform) and start a new email. Their signature should appear automatically.</li>
      </ol>
    </div>
  `;
}

// =============================================================
// Render
// =============================================================

function render() {
  const root = $("#root");
  if (state.view === "auth" || !state.authed) {
    root.innerHTML = viewAuth();
    bindAuth();
    return;
  }
  let inner;
  if (state.view === "users") inner = viewUsers();
  else if (state.view === "templates") inner = viewTemplates();
  else if (state.view === "settings") inner = viewSettings();
  else inner = viewUsers();

  root.innerHTML = viewShell(inner);
  bindShell();
  if (state.view === "users") bindUsers();
  if (state.view === "templates") {
    if (state.selectedTemplate) bindTemplateEditor();
    else bindTemplates();
  }
  if (state.modal) bindModal();
}

// =============================================================

boot();
