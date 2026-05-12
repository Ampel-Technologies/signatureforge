# SignatureForge

> An open-source Outlook add-in that pushes per-user email signatures to every device, on every client, with zero user interaction. Centrally managed from a small admin UI. Version controlled in your own GitHub repo.

[**Live demo / landing page →**](https://alyssaagard.github.io/signatureforge/)
[**Open the admin →**](https://alyssaagard.github.io/signatureforge/admin/)

![SignatureForge mark](addin/icons/icon-128.png)

---

## What this is

A small, deliberately scoped Outlook add-in that solves one problem: pushing a consistent, per-user email signature to every staff member's mailbox without anyone ever touching their Outlook settings. It runs on Outlook for the web, the new Outlook for Windows, classic Outlook for Windows, Outlook for Mac, Outlook for iOS, and Outlook for Android. It is admin-deployed via Microsoft 365, so when you add a new staff member to a security group, their signature is live the next time they open a compose window.

The closest commercial equivalents are Exclaimer and CodeTwo. They are excellent products. They also charge between $1 and $4 per user per month, which adds up fast for small organizations and nonprofits where every line item gets defended quarterly. SignatureForge gives you the core promise of those tools (per-user signatures, every device, zero user-touch onboarding) for the cost of a free GitHub Pages site.

It is not a drop-in replacement for the paid tools at scale. See the comparison section below.

## Architecture

```
                  ┌──────────────────────────────────┐
                  │  GitHub repo (you own it)        │
                  │                                  │
                  │  /addin       manifest + JS      │
                  │  /admin       admin UI           │
                  │  /config      users, templates   │
                  └──────────────┬───────────────────┘
                                 │ served free at
                                 ▼
                  ┌──────────────────────────────────┐
                  │  GitHub Pages                    │
                  │  https://USER.github.io/sigforge │
                  └────────┬─────────────────┬───────┘
                           │                 │
                  manifest │                 │ users.json,
                  ingested │                 │ templates,
                  by M365  │                 │ fetched at
                  admin    ▼                 │ compose time
                  ┌────────────────┐         │
                  │  M365 admin    │         │
                  │  pushes add-in │         │
                  │  to user group │         │
                  └────────┬───────┘         │
                           ▼                 │
                  ┌──────────────────────────┴───────┐
                  │  Outlook (any device)            │
                  │   1. user starts new email       │
                  │   2. add-in fires                │
                  │   3. fetch + render + inject     │
                  └──────────────────────────────────┘
```

Three moving parts, all standards based:

1. **The add-in itself** (`addin/`). An event-based Office Add-in registered against `OnNewMessageCompose`. When the event fires, it disables Outlook's own signature handling, fetches the latest config from your GitHub Pages site, looks up the current user, renders their assigned template, and calls `setSignatureAsync` to inject the result.
2. **The config files** (`config/`). Plain JSON for the user roster, plain HTML for the templates. No proprietary format.
3. **The admin UI** (`admin/`). A small framework-free SPA that reads and writes the config files via the GitHub Contents API. Authentication is a fine-grained Personal Access Token stored locally in your browser; no backend, no database, no server to keep alive.

## Project layout

```
signatureforge/
├── index.html                    Landing page (also the portfolio piece)
├── manifest.xml                  Outlook add-in manifest (ingested by M365)
├── addin/
│   ├── commands.html             Runtime shell loaded by Outlook
│   ├── launchevent.js            The event handler (the heart of the add-in)
│   └── icons/                    16/32/64/80/128 px icons referenced by manifest
├── admin/
│   ├── index.html                Admin SPA shell
│   ├── styles.css                All the styling, hand-written, no framework
│   ├── app.js                    Routing, state, view rendering
│   └── github.js                 GitHub Contents API client
├── config/
│   ├── users.json                User roster, edited via admin UI
│   ├── users.schema.json         JSON schema for validation
│   └── templates/
│       ├── default.html          Full-detail signature
│       └── minimal.html          Pared-down alternative
├── docs/
│   └── DEPLOYMENT.md             Step-by-step deployment guide
├── LICENSE
└── README.md
```

## Quickstart

### 1. Fork or clone this repo

```bash
gh repo create signatureforge --public --clone --template=alyssaagard/signatureforge
cd signatureforge
```

Or just download the source and push it to a new repo of your own.

### 2. Replace the placeholder hostname

The manifest and the add-in runtime both reference your GitHub Pages URL. Find and replace `alyssaagard` everywhere it appears:

```bash
grep -rl 'alyssaagard' . | xargs sed -i '' 's/alyssaagard/your-actual-handle/g'
```

(On Linux drop the `''` after `-i`.)

You should also generate a fresh GUID for the manifest's `<Id>` element so your add-in does not collide with anyone else's. `uuidgen` (macOS/Linux) or `[guid]::NewGuid()` (PowerShell) works.

### 3. Enable GitHub Pages

In the repo settings, turn on Pages with the `main` branch and root path. Wait one to two minutes for the first deployment. Visit `https://your-handle.github.io/signatureforge/`, confirm the landing page renders.

### 4. Mint a Personal Access Token

The admin UI writes back to your repo via the GitHub API. You authenticate with a fine-grained Personal Access Token, scoped to only this single repo, with `Contents: Read and write` permission. Detailed walkthrough in the admin UI itself.

### 5. Add yourself in the admin UI

Open `https://your-handle.github.io/signatureforge/admin/`, paste the token, add yourself as the first user. Save commits the change to `config/users.json`.

### 6. Upload the manifest in Microsoft 365

In the Microsoft 365 admin center, go to **Settings → Integrated apps → Upload custom apps**. Choose **Provide link to manifest file** and paste your manifest URL: `https://your-handle.github.io/signatureforge/manifest.xml`. Assign to a security group containing your test user. Wait up to 24 hours for propagation (it is usually faster).

### 7. Test it

In Outlook, start a new message. Your signature should appear automatically. If it does not, see the troubleshooting section.

Full deployment guide with screenshots: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## How signatures actually get applied

The choreography matters because Outlook's behavior varies by surface and device. Here is what happens, in order:

1. User starts a new message, reply, or forward in Outlook (any platform).
2. `OnNewMessageCompose` fires. Microsoft's runtime loads `addin/commands.html`, which loads `addin/launchevent.js`.
3. The handler calls `disableClientSignatureAsync` first. This is critical: it prevents Outlook's own per-mailbox signature from running and producing duplicates. We become the single source of truth.
4. The handler fetches `config/users.json` from your GitHub Pages site, with a cache-busting timestamp so changes propagate within seconds.
5. It looks up the current user by their primary SMTP address (`Office.context.mailbox.userProfile.emailAddress`).
6. If found, it fetches the assigned template HTML.
7. It substitutes `{{token}}` placeholders with the user's `fields` values. Triple-brace `{{{token}}}` allows raw HTML if you have advanced needs (custom social media block, for instance).
8. It calls `body.setSignatureAsync(html, { coercionType: Html })` to inject the signature.
9. It calls `event.completed()` to signal the runtime is done.

If anything fails (no user entry, network error, malformed template), the handler completes silently. The user is never blocked from sending mail.

## Templating

Templates are plain HTML with `{{token}}` placeholders. Default tokens:

| Token | Example |
|-------|---------|
| `{{displayName}}` | Avery Lin |
| `{{pronouns}}` | (they/them) |
| `{{title}}` | Director of Programs |
| `{{organization}}` | Sample Organization |
| `{{email}}` | avery@example.org |
| `{{phone}}` | (555) 010-2030 |
| `{{website}}` | https://example.org |
| `{{address}}` | Brooklyn, NY |

You can add arbitrary fields per user; any `{{newToken}}` will be substituted from `fields.newToken` if present, or rendered as empty otherwise. There is no schema enforcement on field names, by design.

**Email-client compatibility constraints** (these apply to all signature systems, not just this one):

- Use inline styles only. Many clients strip `<style>` blocks.
- Use `<table>` for layout, not flexbox or grid. Outlook for Windows ignores most modern CSS.
- Web-safe font cascade, not Google Fonts. The recipient's client renders the signature; your fonts will not be loaded.
- Logos must be hosted at a public HTTPS URL. Embedded `data:` images get stripped by some servers.

Use `{{{token}}}` (triple braces) when you need to inject pre-formatted HTML rather than escaped text.

## Comparison to paid tools

| | SignatureForge | Exclaimer / CodeTwo |
|---|---|---|
| Cost per user | $0 | $1–$4/mo |
| Per-user signatures, every device | Yes | Yes |
| Drag-and-drop visual designer | No, write HTML | Yes |
| Marketing banners, campaign rotation | No | Yes |
| Pull fields from Entra ID / AD | Roadmap (Graph integration) | Yes |
| You own and can modify the code | Yes, MIT | No |
| Audit trail | Git history | Proprietary log |
| Onboarding effort | One-time setup, ~30 min | One-time setup, similar |
| Bus factor | You | Vendor |

If you have several hundred users and your CMO wants to A/B test campaign banners in employee signatures, pay for Exclaimer. If you have a small staff and want signatures that just work, this is enough.

## Security

- The admin UI never has a backend. The PAT is stored only in your browser's localStorage.
- Use a **fine-grained** PAT (not a classic one), scoped to only this single repo, with only `Contents: Read and write` permission. The walkthrough in the admin UI shows exactly what to set.
- The user roster (`config/users.json`) is publicly readable because the add-in fetches it from GitHub Pages at compose time. Treat it as such: it should contain only information staff are willing to put on outgoing email anyway, which is what signatures are. Do not put anything sensitive in `fields`.
- If you need a private repo, use a paid GitHub plan (which lets Pages serve from private repos) or migrate to Cloudflare Pages with the same source.

## Limitations and known issues

- **Microsoft 365 admin deployment is required.** Event-based add-ins do not auto-launch when installed by individual users from the Office Store. This is a Microsoft constraint, not ours.
- **Mobile reliability is ~95%.** Microsoft's own documentation and issue tracker note that on a small subset of mobile devices, the event occasionally fails to fire until the Outlook app is restarted. There is no client-side workaround.
- **No pull from Entra ID yet.** Each user's fields are stored in `users.json` and edited via the admin UI. Path to pulling from Entra ID via Microsoft Graph at runtime is on the roadmap; for fewer than ~25 users, manual entry is honestly faster.
- **First-message-only on long threads.** Like all signature systems, when a user replies to a thread, the signature is appended to the new message they typed, not magically inserted into all previous messages in the chain.

## Roadmap

- Microsoft Graph integration (pull title, phone, etc. from each user's Entra ID profile, no manual entry).
- Logo upload via the admin UI (currently you paste a public URL into the template HTML).
- Per-template field schema validation in the admin UI.
- Optional dark-mode signature variant.
- Light analytics: which users have received the latest config, last successful injection per mailbox.

PRs welcome.

## Development

This is a static site. There is no build step.

```bash
# Clone and serve locally
git clone https://github.com/alyssaagard/signatureforge.git
cd signatureforge
python3 -m http.server 8000
# Open http://localhost:8000
```

The admin UI requires HTTPS for the GitHub PAT exchange to work in some browsers; the simplest local-test route is just to push a branch and let Pages serve it.

## License

MIT. See [`LICENSE`](LICENSE).

## Acknowledgments

Built on Microsoft's Office Add-ins platform. Type pairing: Fraunces (Undercase Type) and IBM Plex Sans/Mono (IBM). Color palette adapted from a piece of letterpress paper.
