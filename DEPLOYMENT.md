# Deployment guide

This walks you from a fresh GitHub account to a working SignatureForge deployment in your Microsoft 365 tenant. Plan on roughly an hour the first time. After that, adding a new user is a 30-second task.

## Prerequisites

- A GitHub account (free is fine for a public repo).
- A Microsoft 365 tenant where you are a Global Administrator or have Add-in deployment rights.
- A test mailbox you can send mail from on at least one Outlook surface (web is easiest to test).

## Phase 1 — Get the code into your own repo

1. Fork this repo, or download the source and create a new repo of your own. Name it `signatureforge` (the manifest URLs assume this name; if you use a different name, you must update the URLs accordingly).
2. Clone your repo locally.
3. Replace the placeholder hostname in every file:
   ```bash
   # macOS
   grep -rl 'alyssaagard' . | xargs sed -i '' 's/alyssaagard/your-actual-handle/g'

   # Linux
   grep -rl 'alyssaagard' . | xargs sed -i 's/alyssaagard/your-actual-handle/g'
   ```
4. Generate a fresh GUID for `manifest.xml` so your add-in does not collide with anyone else's:
   ```bash
   uuidgen   # macOS / Linux
   ```
   Open `manifest.xml`, replace the value inside `<Id>...</Id>` with the new GUID.
5. Commit and push.

## Phase 2 — Enable GitHub Pages

1. In your repo, go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder. Save.
4. Wait one to two minutes. GitHub will report the deploy URL.
5. Visit `https://your-handle.github.io/signatureforge/` and confirm the landing page loads.
6. Visit `https://your-handle.github.io/signatureforge/admin/` and confirm the admin login screen appears.

If you get a 404, GitHub Pages has not finished provisioning yet. Wait another minute.

## Phase 3 — Configure your first user

1. In GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → **Generate new token**.
2. Name it `SignatureForge Admin`. Set an expiration (90 days is reasonable).
3. **Repository access**: select **Only select repositories**, choose your `signatureforge` repo.
4. **Repository permissions**: set **Contents** to **Read and write**. Leave everything else.
5. Click **Generate token**. Copy the `github_pat_...` string.
6. Open the admin UI at `https://your-handle.github.io/signatureforge/admin/`.
7. Enter your GitHub username, repo name (`signatureforge`), branch (`main`), and paste the token.
8. Click **Connect**. You should land on the Users view.
9. Click **+ Add user** and fill in the first user's details. Save.
10. Confirm the change appears in `config/users.json` in your repo (refresh the GitHub web view).

## Phase 4 — Upload the manifest to Microsoft 365

1. Sign in to the Microsoft 365 admin center as a Global Administrator.
2. Navigate to **Settings → Integrated apps**.
3. Click **Upload custom apps**.
4. Choose **Office add-in** as the app type, and **Provide link to manifest file** as the source.
5. Paste your manifest URL: `https://your-handle.github.io/signatureforge/manifest.xml`.
6. Click **Validate**. If validation fails, see the troubleshooting section.
7. After validation, choose who gets the add-in. For testing, deploy to a single user (yourself). For production, create or select a security group containing all staff who should receive managed signatures.
8. Confirm and deploy.
9. Microsoft warns that propagation can take up to 24 hours. In practice it is often much faster, especially for small tenants.

## Phase 5 — Test

1. Open Outlook on the web (`outlook.office.com`) signed in as your test user.
2. Click **New message**.
3. Within 1 to 5 seconds, your signature should appear automatically in the compose pane.
4. Send a test message to yourself. Confirm the signature is preserved on the receiving end.
5. Test reply behavior: reply to the test message and verify the signature appears under your reply text, not at the very bottom of the original.
6. Repeat on Outlook desktop and Outlook mobile to confirm cross-platform behavior.

## Troubleshooting

### Manifest validation fails on upload

- Make sure GitHub Pages is fully deployed and the manifest URL is publicly fetchable. Try opening the URL in an incognito browser window; you should see XML.
- Make sure all `alyssaagard` placeholders have been replaced.
- Check that the GUID in `<Id>` is well-formed (8-4-4-4-12 hex format).
- Microsoft's hosted manifest validator will give a more detailed error. Run your manifest through it: search for "Office Add-in Validator" on Microsoft Learn.

### The add-in is deployed but the signature is not appearing

- Confirm the user is in the security group the add-in was deployed to.
- Confirm the user's mailbox primary SMTP address exactly matches the `email` field in `config/users.json`. The match is case-insensitive and trimmed, but punctuation matters.
- Wait 24 hours after deployment before assuming there is a real problem. Microsoft's propagation delay is the most common false positive.
- In Outlook on the web, open the browser console and look for `SignatureForge` log lines. Errors there will explain the failure.
- Confirm `config/users.json` is publicly readable: open it in an incognito window.

### Signature appears, but at the bottom of the entire reply chain

- This means the add-in is failing on a reply event but Outlook's native client signature is still active and dropping a fallback signature at the end of the message. Confirm `disableClientSignatureAsync` is being called (check console logs).
- On Outlook for iOS/Android, the signature is added by the add-in but is not always visible in the reply view until the user expands the compose window to full screen. This is a Microsoft-side rendering quirk; the signature is actually present and will be sent correctly.

### Duplicate signatures

- Almost always caused by an Exchange Online mail flow rule (transport rule) running in parallel with the add-in. If you previously set up a server-side disclaimer rule for signatures, disable it after switching to SignatureForge.
- The other common cause is a user who manually copy-pasted a signature into their Outlook account-level signature settings. The add-in calls `disableClientSignatureAsync` to prevent this, but on classic Outlook for Windows in some configurations the disable does not stick. Have the user clear their account-level signature in Outlook settings.

### "Connection failed" in the admin UI

- The PAT was likely entered incorrectly or has expired. Generate a new one and re-authenticate.
- Confirm the PAT has `Contents: Read and write` permission on the correct repo.
- Open the browser console for a more specific error (HTTP 401 means token; 404 means wrong repo or branch).

## Updating signatures later

You should never need to redeploy the add-in itself unless you change the code. Day-to-day signature changes (new hire, title change, phone number update, template tweak) are made entirely in the admin UI and propagate automatically:

1. Open `https://your-handle.github.io/signatureforge/admin/`.
2. Make the change. Save.
3. Within roughly 60 seconds, the new config is live for everyone.

## Rotating the admin PAT

PATs expire. When yours does, the admin UI will refuse to connect until you generate a new one. Repeat Phase 3 step 1, paste the new token, you are back in business.
