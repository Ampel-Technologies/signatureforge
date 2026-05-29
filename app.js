const SETTINGS_KEYS = {
  title: "signatureforge.title",
  phone: "signatureforge.phone",
};

const FALLBACK_PROFILE = {
  displayName: "Avery Lin",
  emailAddress: "avery@example.org",
};

const TEMPLATE_URL = "./default.html";

const state = {
  officeReady: false,
  profile: FALLBACK_PROFILE,
  templateHtml: "",
  title: "",
  phone: "",
  saving: false,
  status: "",
  statusType: "neutral",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderTemplate(html, fields) {
  let out = html.replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => {
    return fields[key] != null ? String(fields[key]) : "";
  });
  out = out.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    return fields[key] != null ? escapeHtml(fields[key]) : "";
  });
  return out;
}

function getFirstName(displayName) {
  const name = String(displayName ?? "").trim();
  if (!name) return "";
  return name.split(/\s+/)[0];
}

function getProfile() {
  const profile = window.Office?.context?.mailbox?.userProfile;
  if (!profile) return FALLBACK_PROFILE;
  return {
    displayName: (profile.displayName || FALLBACK_PROFILE.displayName).trim(),
    emailAddress: (profile.emailAddress || FALLBACK_PROFILE.emailAddress).trim(),
  };
}

function getStoredSettings() {
  if (!window.Office?.context?.roamingSettings) {
    return { title: "", phone: "" };
  }
  const roaming = window.Office.context.roamingSettings;
  return {
    title: String(roaming.get(SETTINGS_KEYS.title) ?? ""),
    phone: String(roaming.get(SETTINGS_KEYS.phone) ?? ""),
  };
}

async function saveSettings() {
  if (!window.Office?.context?.roamingSettings) {
    throw new Error("This page must be opened inside Outlook to save settings.");
  }
  const roaming = window.Office.context.roamingSettings;
  roaming.set(SETTINGS_KEYS.title, state.title.trim());
  roaming.set(SETTINGS_KEYS.phone, state.phone.trim());

  await new Promise((resolve, reject) => {
    roaming.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve();
      } else {
        reject(result.error || new Error("Failed to save roaming settings."));
      }
    });
  });
}

function setStatus(message, type = "neutral") {
  state.status = message;
  state.statusType = type;
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

async function loadTemplate() {
  const resp = await fetch(`${TEMPLATE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Template fetch failed: ${resp.status}`);
  return resp.text();
}

function updatePreview() {
  const frame = document.getElementById("previewFrame");
  if (!frame || !state.templateHtml) return;
  const html = renderTemplate(state.templateHtml, {
    displayName: state.profile.displayName,
    firstName: getFirstName(state.profile.displayName),
    email: state.profile.emailAddress,
    title: state.title.trim(),
    phone: state.phone.trim(),
  });
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      body { padding: 18px; }
    </style>
  </head><body>${html}</body></html>`;
}

function render() {
  const root = document.getElementById("root");
  const saveDisabled = state.saving || !state.officeReady;
  root.innerHTML = `
    <div class="page">
      <section class="hero">
        <div class="eyebrow">SignatureForge</div>
        <h1>Signature settings</h1>
        <p class="lede">
          Outlook provides your name and email. Set the title and phone number once, then the compose event fills the signature automatically.
        </p>
      </section>

      <section class="grid">
        <article class="card form-card">
          <div class="card-head">
            <span>Mailbox data</span>
            <span class="meta">roaming settings</span>
          </div>

          <label class="field">
            <span>Display name</span>
            <input id="displayName" value="${escapeHtml(state.profile.displayName)}" readonly />
          </label>

          <label class="field">
            <span>Email</span>
            <input id="emailAddress" value="${escapeHtml(state.profile.emailAddress)}" readonly />
          </label>

          <label class="field">
            <span>Title</span>
            <input id="title" value="${escapeHtml(state.title)}" placeholder="Director of Operations" />
          </label>

          <label class="field">
            <span>Phone</span>
            <input id="phone" value="${escapeHtml(state.phone)}" placeholder="+31 6 1234 5678" />
          </label>

          <div class="actions">
            <button class="btn primary" id="saveBtn" ${saveDisabled ? "disabled" : ""}>Save settings</button>
          </div>

          <div class="status" id="status" data-type="${escapeHtml(state.statusType)}">${escapeHtml(state.status)}</div>
          <p class="hint">
            The signature template itself lives in <code>default.html</code> and is deployed by git.
          </p>
        </article>

        <article class="card preview-card">
          <div class="card-head">
            <span>Live preview</span>
            <span class="meta">default.html</span>
          </div>
          <iframe id="previewFrame" class="preview-frame" title="Signature preview"></iframe>
        </article>
      </section>
    </div>
  `;

  const titleInput = document.getElementById("title");
  const phoneInput = document.getElementById("phone");
  const saveBtn = document.getElementById("saveBtn");

  titleInput?.addEventListener("input", () => {
    state.title = titleInput.value;
    updatePreview();
  });
  phoneInput?.addEventListener("input", () => {
    state.phone = phoneInput.value;
    updatePreview();
  });
  saveBtn?.addEventListener("click", onSave);

  if (saveDisabled && !state.officeReady) {
    setStatus("Open this page inside Outlook to save title and phone.", "warn");
  }
  updatePreview();
}

async function onSave() {
  if (state.saving) return;
  state.title = document.getElementById("title")?.value ?? "";
  state.phone = document.getElementById("phone")?.value ?? "";

  state.saving = true;
  render();

  try {
    await saveSettings();
    setStatus("Saved to the mailbox.", "success");
  } catch (err) {
    setStatus(err.message || "Save failed.", "error");
  } finally {
    state.saving = false;
    render();
  }
}

async function init() {
  state.profile = getProfile();
  const settings = getStoredSettings();
  state.title = settings.title;
  state.phone = settings.phone;
  state.officeReady = !!window.Office?.context?.roamingSettings;

  try {
    state.templateHtml = await loadTemplate();
  } catch (err) {
    state.templateHtml = `
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;color:#1a1815;">
        <tr><td style="font-size:24px;font-weight:700;padding-bottom:4px;">{{displayName}}</td></tr>
        <tr><td style="font-size:14px;color:#5a5650;padding-bottom:10px;">{{email}}</td></tr>
        <tr><td style="font-size:13px;color:#5a5650;">{{title}}</td></tr>
        <tr><td style="font-size:13px;color:#5a5650;">{{phone}}</td></tr>
      </table>
    `;
    setStatus(`Preview fallback loaded: ${err.message}`, "warn");
  }

  render();
}

function boot() {
  if (window.Office?.onReady) {
    window.Office.onReady(() => {
      init().catch((err) => {
        setStatus(err.message || "Initialization failed.", "error");
        render();
      });
    });
  } else {
    init().catch((err) => {
      setStatus(err.message || "Initialization failed.", "error");
      render();
    });
  }
}

boot();
