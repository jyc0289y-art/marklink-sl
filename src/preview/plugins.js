// OfficeLink SL — markdown-it Plugin Registration (async plugins)
// Synchronous plugins (task-lists, footnote, deflist, abbr, emoji) are registered in renderer.js.
// Only async/heavy plugins (KaTeX) are registered here.

/**
 * Register KaTeX plugin for math rendering
 * Uses @mdit/plugin-katex
 */
export async function registerKaTeX(md) {
  try {
    const { katex: katexPlugin } = await import('@mdit/plugin-katex');
    md.use(katexPlugin);
    // Import KaTeX CSS
    if (!document.querySelector('link[href*="katex"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      // Use katex-swap variant which includes font-display: swap to prevent FOIT
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex-swap.min.css';
      document.head.appendChild(link);
    }
  } catch (e) {
    console.warn('KaTeX plugin not available:', e.message);
  }
}

/**
 * Register all async plugins.
 * Task lists, footnotes, definition lists, abbreviations, and emoji are already registered synchronously in renderer.js.
 */
export async function registerAllPlugins(md) {
  await registerKaTeX(md);
}
