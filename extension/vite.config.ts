import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // CRXJS recommends a stable port for the HMR websocket
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
