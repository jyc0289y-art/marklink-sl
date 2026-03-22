import { defineConfig } from 'vite';

// GitHub Pages needs /officelink-sl/, Vercel needs /
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
  },
});
