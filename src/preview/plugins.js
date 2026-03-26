// OfficeLink SL — markdown-it Plugin Registration
// Plugins are registered here and applied in renderer.js

/**
 * Register KaTeX plugin for math rendering
 * Uses @mdit/plugin-katex or markdown-it-katex
 */
export async function registerKaTeX(md) {
  try {
    const { katex: katexPlugin } = await import('@mdit/plugin-katex');
    md.use(katexPlugin);
    // Import KaTeX CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Use katex-swap variant which includes font-display: swap to prevent FOIT
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex-swap.min.css';
    document.head.appendChild(link);
  } catch (e) {
    console.warn('KaTeX plugin not available:', e.message);
  }
}

/**
 * Register task list plugin for GFM checklists
 */
export async function registerTaskLists(md) {
  try {
    const taskListPlugin = await import('markdown-it-task-lists');
    md.use(taskListPlugin.default || taskListPlugin);
  } catch (e) {
    console.warn('Task list plugin not available:', e.message);
  }
}

/**
 * Register all plugins
 */
export async function registerAllPlugins(md) {
  await Promise.all([
    registerKaTeX(md),
    registerTaskLists(md),
  ]);
}
