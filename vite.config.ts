import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `extension/` is a separate sub-project with its OWN node_modules, which
    // contains a second copy of react + react-dom. Without dedupe, Vite's
    // dependency scan can resolve React from there as well as from the root,
    // and two React instances means a null dispatcher — every hook throws
    // "Cannot read properties of null (reading 'useState')".
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Keep the sub-project out of the dep scan entirely.
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
  },
})
