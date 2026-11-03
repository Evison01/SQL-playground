# Deployment

## Hosted release

The initial owner-private Site is configured in `.openai/hosting.json`. Its URL is:

https://evison-sql-playground.tastypiano.chatgpt.site

The hosting service may require the owner's sign-in. The app itself has no account
system. Site access controls are independent of local browser database storage.
Do not change this identity to create duplicate hosted projects during updates.

## Build anywhere

```sh
npm run setup
npm test
npm run build
```

Serve the resulting `dist/` directory using any HTTPS static host. The application
uses no server routes or secrets. Serve `.wasm` as `application/wasm` and `.js` as
JavaScript. Keep hashed files from one build together, including the worker bundle
and WASM file. Do not use a `file://` URL.

Examples of static-host settings:

| Setting | Value |
| --- | --- |
| Install | `npm run setup` |
| Build | `npm run build` |
| Output | `dist` |
| Node | 22.12+ |

This release assumes it is served at the origin root. For a subpath, configure
Vite's `base` and make favicon paths relative before rebuilding.

## Publish updates through Sites

Use the Sites source workflow with the existing `project_id`, a current source
repository write credential, and a production archive produced from the exact pushed
commit. Keep credentials out of files and Git. Save/deploy that version, preserve its
existing audience, and confirm the deployment reaches `succeeded` before reporting
it live. The GitHub repository remains the user's reviewable project source; the
hosting source repository is synchronized separately.

Browser data does not travel with a deployment. Export backups before switching
origins, devices, or browsers, and import them afterward. Same-origin updates retain
IndexedDB records. Existing Phase 3 records without a dataset field remain compatible.
