import { defineConfig } from 'vite';

// GitHub Pages needs /officelink-sl/, Vercel needs /
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1000,
    minify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // === Vendor splitting: separate heavy libs for better caching ===
          if (id.includes('node_modules/mermaid')) return 'vendor-mermaid';
          if (id.includes('node_modules/cytoscape')) return 'vendor-cytoscape';
          if (id.includes('node_modules/katex') || id.includes('node_modules/@mdit/plugin-katex')) return 'vendor-katex';
          if (id.includes('node_modules/codemirror') || id.includes('node_modules/@codemirror')) return 'vendor-codemirror';
          if (id.includes('node_modules/highlight.js')) return 'vendor-hljs';
          if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('node_modules/mammoth')) return 'vendor-mammoth';
          if (id.includes('node_modules/jszip')) return 'vendor-jszip';
          if (id.includes('node_modules/docx')) return 'vendor-docx';
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/html2pdf') || id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-pdf';
          if (id.includes('node_modules/markdown-it')) return 'vendor-markdown';
          // === Editor splitting ===
          if (id.includes('/photo/')) return 'editor-photo';
          if (id.includes('/calculator/')) return 'editor-calc';
          if (id.includes('/pdf/')) return 'editor-pdf';
          if (id.includes('/slide/')) return 'editor-slide';
          if (id.includes('/sheet/')) return 'editor-sheet';
          if (id.includes('/document/')) return 'editor-doc';
          if (id.includes('/draw/')) return 'editor-draw';
          if (id.includes('/cad/')) return 'editor-cad';
          if (id.includes('/ai/')) return 'editor-ai';
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
