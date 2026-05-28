# SignatureForge

SignatureForge is a small Outlook add-in that applies a signature at compose time. Outlook supplies the signed-in user's display name and email address, the add-in stores `Title` and `Phone` in roaming settings, and the signature template itself is committed as `default.html`.

[Live page](https://alyssaagard.github.io/signatureforge/)

## How it works

1. A user starts a new message, reply, or forward.
2. The event handler reads `Office.context.mailbox.userProfile.displayName` and `emailAddress`.
3. The add-in loads `Title` and `Phone` from `Office.context.roamingSettings`.
4. It fetches `default.html` from GitHub Pages, substitutes the fields, and injects the HTML with `setSignatureAsync`.

If anything fails, Outlook keeps working and the event completes silently.

## What is editable

- `default.html` is the signature template. Update it in git and redeploy Pages.
- `Title` and `Phone` are set inside Outlook with the `Signature settings` button in the compose ribbon.
- `displayName` and `email` come from Outlook and are not manually entered.

## Project layout

```text
signatureforge/
├── index.html             Settings page used by the add-in button
├── app.js                 Settings UI and roaming settings storage
├── styles.css             Settings page styling
├── manifest.xml           Outlook add-in manifest
├── commands.html          Runtime shell for the compose event
├── launchevent.js         Compose-time signature injector
├── default.html           Git-managed signature template
├── minimal.html           Alternate template
└── DEPLOYMENT.md          Setup guide
```

## Setup

1. Fork this repo and replace every `alyssaagard` placeholder with your GitHub Pages owner name.
2. Generate a new GUID for `manifest.xml`.
3. Enable GitHub Pages on the `main` branch with the repository root as the publish source.
4. Upload `manifest.xml` in the Microsoft 365 admin center.
5. Open Outlook and use the `Signature settings` button to set your title and phone number.

## Editing the signature

- Change `default.html` or `minimal.html` directly in git.
- The add-in fetches `default.html` at compose time, so template changes show up without changing the add-in code.

## Notes

- `Title` and `Phone` are stored in Outlook roaming settings. They are mailbox-scoped, but they are not secret storage.
- The settings pane is a task pane. It is available where Outlook supports add-in task panes, such as Outlook on the web and desktop.
- The compose event still runs on mobile clients that support event-based activation, even if the settings pane is not available there.
