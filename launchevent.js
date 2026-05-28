/**
 * SignatureForge - Outlook event handler
 *
 * Fires on OnNewMessageCompose (new mail, replies, forwards) on:
 *   - Outlook on the web
 *   - new Outlook on Windows
 *   - classic Outlook on Windows (build 16.0.x or later)
 *   - Outlook on Mac
 *   - Outlook on iOS and Android
 *
 * Pipeline:
 *   1. Disable the user's client-side signature so we are the single source of truth.
 *   2. Fetch users.json from the GitHub Pages site.
 *   3. Find the entry matching the current mailbox owner's email.
 *   4. Fetch the assigned template HTML.
 *   5. Substitute {{tokens}} from the user's `fields` object.
 *   6. Call setSignatureAsync to inject it.
 *
 * If anything fails (no entry, network error, malformed template), we
 * complete the event silently so we never block the user from sending mail.
 */

// === CONFIGURATION ==========================================================
// The base URL where the config files are hosted.
// IMPORTANT: replace Ampel-Technologies with your actual GitHub handle
// before deployment, OR leave it and Office will fail to load the add-in,
// which is a useful sanity check.
const CONFIG_BASE_URL = "https://Ampel-Technologies.github.io/signatureforge";

// Cache TTL in milliseconds. Compose-time fetches use cache-busting so
// edits propagate within seconds, but we keep an in-memory cache per
// runtime session to avoid hammering GitHub on rapid successive composes.
const CACHE_TTL_MS = 60 * 1000;

// === RUNTIME ================================================================

let _cache = { users: null, templates: {}, fetchedAt: 0 };

Office.onReady();

/**
 * Main event handler. Registered against the manifest's
 * onNewMessageComposeHandler action.
 */
async function onNewMessageComposeHandler(event) {
  try {
    const item = Office.context.mailbox.item;
    const userEmail = (Office.context.mailbox.userProfile.emailAddress || "")
      .toLowerCase()
      .trim();

    if (!userEmail) {
      return event.completed();
    }

    // Step 1: silence Outlook's own signature handling so it cannot
    // collide with ours and produce duplicates. We swallow errors here
    // because not every platform implements this API and it is non-fatal.
    await disableClientSignatureSafe();

    // Step 2: load the user roster
    const users = await loadUsers();
    const user = users.find(
      (u) => (u.email || "").toLowerCase().trim() === userEmail
    );

    if (!user) {
      // Not an enrolled user. We do nothing rather than apply a wrong
      // signature. This is intentional: silent no-op.
      return event.completed();
    }

    // Step 3: load and render the template
    const templateName = user.template || "default";
    const templateHtml = await loadTemplate(templateName);
    const rendered = renderTemplate(templateHtml, user.fields || {});

    // Step 4: inject
    item.body.setSignatureAsync(
      rendered,
      { coercionType: Office.CoercionType.Html },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          // Logged for debugging via the Outlook add-in runtime logs.
          console.error("SignatureForge setSignature failed:", result.error);
        }
        event.completed();
      }
    );
  } catch (err) {
    console.error("SignatureForge handler error:", err);
    event.completed();
  }
}

// === HELPERS ================================================================

function disableClientSignatureSafe() {
  return new Promise((resolve) => {
    try {
      const item = Office.context.mailbox.item;
      if (!item.disableClientSignatureAsync) {
        return resolve();
      }
      item.disableClientSignatureAsync(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

async function loadUsers() {
  if (_cache.users && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.users;
  }
  const url = `${CONFIG_BASE_URL}/config/users.json?t=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`users.json fetch failed: ${resp.status}`);
  const json = await resp.json();
  const users = Array.isArray(json) ? json : json.users || [];
  _cache.users = users;
  _cache.fetchedAt = Date.now();
  return users;
}

async function loadTemplate(name) {
  if (_cache.templates[name] && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.templates[name];
  }
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, "");
  const url = `${CONFIG_BASE_URL}/config/templates/${safe}.html?t=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`template ${safe} fetch failed: ${resp.status}`);
  const html = await resp.text();
  _cache.templates[name] = html;
  return html;
}

/**
 * Replace {{key}} tokens in the template with values from fields.
 * Unknown tokens are replaced with the empty string so signatures
 * never show stray {{placeholder}} text.
 *
 * Supports HTML-escaping by default; use {{{key}}} (triple braces)
 * to inject raw HTML (for example, a custom block of links).
 */
function renderTemplate(html, fields) {
  // Triple-brace raw HTML injection
  html = html.replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => {
    return fields[key] != null ? String(fields[key]) : "";
  });
  // Standard escaped substitution
  html = html.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    return fields[key] != null ? escapeHtml(String(fields[key])) : "";
  });
  return html;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Map the manifest action name to the JS function. Required for the
// event handler to actually fire.
Office.actions.associate("onNewMessageComposeHandler", onNewMessageComposeHandler);
