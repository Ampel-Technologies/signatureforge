# Deployment guide

This is the shortest path from a fresh fork to a working SignatureForge deployment.

## Prerequisites

- A GitHub repository that can serve GitHub Pages.
- Microsoft 365 admin access to deploy Outlook add-ins.
- A mailbox you can use for testing.

## 1. Prepare the repo

1. Fork or clone the repo into your own GitHub account.
2. Replace every `alyssaagard` placeholder with your GitHub Pages owner name.
3. Generate a new GUID for `manifest.xml` and replace the existing `<Id>` value.
4. Commit the changes.

## 2. Enable GitHub Pages

1. In GitHub, open **Settings → Pages**.
2. Select the `main` branch and the repository root as the publish source.
3. Wait for the Pages URL to go live.
4. Confirm these URLs work in a browser:
   - `https://your-handle.github.io/signatureforge/`
   - `https://your-handle.github.io/signatureforge/default.html`
   - `https://your-handle.github.io/signatureforge/manifest.xml`

## 3. Deploy the add-in

1. In the Microsoft 365 admin center, open **Settings → Integrated apps**.
2. Upload `manifest.xml` as an Outlook add-in.
3. Assign it to the test user or a small security group.

## 4. Set the user fields

1. Open Outlook on the web or desktop.
2. Start a new message.
3. Use the `Signature settings` button on the compose ribbon.
4. Enter `Title` and `Phone`.
5. Save and close the pane.

## 5. Test

1. Start a new message again.
2. Confirm the signature appears automatically.
3. Verify `displayName` and `email` come from Outlook.
4. Verify `Title` and `Phone` are the values you saved.
5. Edit `default.html` in git, push it, and confirm the signature updates after Pages refreshes.

## Troubleshooting

- If the manifest fails validation, confirm the Pages URLs are public and the GUID is well formed.
- If the signature does not appear, check the browser console or Outlook add-in runtime logs for `SignatureForge` errors.
- If `Title` or `Phone` do not persist, reopen the settings pane and confirm the Outlook client supports roaming settings for the mailbox.
