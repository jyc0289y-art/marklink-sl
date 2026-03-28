import { defineConfig } from 'vite';

// GitHub Pages needs /officelink-sl/, Vercel needs /
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 500,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // === Vendor splitting: separate heavy libs for better caching ===

          // Mermaid ecosystem — split core from diagram plugins + cytoscape
          if (id.includes('node_modules/cytoscape')) return 'vendor-cytoscape';
          if (id.includes('node_modules/mermaid')) return 'vendor-mermaid';

          // KaTeX math rendering
          if (id.includes('node_modules/katex') || id.includes('node_modules/@mdit/plugin-katex')) return 'vendor-katex';

          // CodeMirror — split core view/state from language modes
          if (id.includes('node_modules/@codemirror/lang-') || id.includes('node_modules/@codemirror/language-data')) return 'vendor-codemirror-langs';
          if (id.includes('node_modules/codemirror') || id.includes('node_modules/@codemirror')) return 'vendor-codemirror-core';

          // Highlight.js (already tree-shaken via lib/core + individual languages)
          if (id.includes('node_modules/highlight.js')) return 'vendor-hljs';

          // PDF.js
          if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs';

          // Document format libs
          if (id.includes('node_modules/mammoth')) return 'vendor-mammoth';
          if (id.includes('node_modules/jszip')) return 'vendor-jszip';
          if (id.includes('node_modules/docx')) return 'vendor-docx';
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';

          // PDF export (html2pdf + jspdf + html2canvas)
          if (id.includes('node_modules/html2pdf') || id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-pdf-export';

          // Markdown-it parser + plugins
          if (id.includes('node_modules/markdown-it')) return 'vendor-markdown';

          // === Editor module splitting ===
          if (id.includes('/photo/')) return 'editor-photo';
          if (id.includes('/calculator/')) return 'editor-calc';
          if (id.includes('/pdf/')) return 'editor-pdf';
          if (id.includes('/slide/')) return 'editor-slide';
          if (id.includes('/sheet/')) return 'editor-sheet';
          if (id.includes('/document/')) return 'editor-doc';
          if (id.includes('/draw/')) return 'editor-draw';
          if (id.includes('/cad/')) return 'editor-cad';
          if (id.includes('/plugins/')) return 'editor-plugins';
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
