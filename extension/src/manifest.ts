import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "D&D 5e VTT — DM Agent",
  description:
    "Reads your D&D Beyond campaign, party, and game log into the D&D 5e VTT DM-agent workspace.",
  version: "0.1.0",
  permissions: ["storage", "sidePanel", "activeTab"],
  host_permissions: [
    "https://www.dndbeyond.com/*",
    "https://api.anthropic.com/*",
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_title: "DM Agent",
  },
  side_panel: {
    default_path: "src/side-panel/index.html",
  },
  content_scripts: [
    {
      matches: ["https://www.dndbeyond.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  icons: {
    "16": "public/icons/icon-16.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png",
  },
});
