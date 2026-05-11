# D&D 5e VTT — Chrome Extension

Manifest V3 browser extension that reads your D&D Beyond campaign,
party, and game log into the DM-agent web app.

## Load it in Chrome

```bash
cd extension
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. **Select the `extension/dist/` folder** ← NOT the parent `extension/` folder.
   The `manifest.json` only exists inside `dist/` after you run `npm run build`.

If you see "Manifest file is missing or unreadable," you picked the
wrong folder — go up one level and select `dist`.

## Use it

- Click the extension's toolbar icon → the side panel opens
- Visit `dndbeyond.com/my-campaigns`, `dndbeyond.com/campaigns/{id}`,
  or `dndbeyond.com/characters/{id}`
- The side panel shows the detected surface and snapshot counters

## Project layout

```
extension/
  src/
    manifest.ts         ← typed MV3 manifest (built into dist/manifest.json)
    background/         ← service worker
    content/            ← content scripts (URL-routed scrapers)
    side-panel/         ← React side panel UI
    lib/                ← shared helpers (URL surface detection)
    types/              ← shared TypeScript types (messages, snapshots)
  public/icons/         ← toolbar icons (16/48/128 px)
  vite.config.ts        ← @crxjs/vite-plugin build pipeline
```

## Dev workflow

`npm run dev` starts Vite with HMR. For extension reload, Chrome
needs the click-to-reload button on the `chrome://extensions` row
after most code changes; CRXJS handles content-script HMR
automatically once the service worker registers.
