// OfficeLink SL — Export Progress Indicator

/**
 * Show an export progress overlay.
 * Returns a controller object with `update(percent, message)` and `close()`.
 * @param {string} [label='Exporting...'] - Initial label
 * @returns {{ update: (percent: number, msg?: string) => void, close: () => void }}
 */
export const showExportProgress = (label = 'Exporting...') => {
  // Remove any existing overlay
  document.querySelector('.export-progress-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'export-progress-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 3000;
    background: rgba(0,0,0,0.45); display: flex;
    align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: exportProgressFadeIn 0.15s ease;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--bg-primary, #fff); border-radius: 16px;
    padding: 32px 40px; min-width: 300px; text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    border: 1px solid var(--border-color, #e5e5ea);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  card.innerHTML = `
    <div class="export-progress-spinner" style="
      width: 40px; height: 40px; margin: 0 auto 16px;
      border: 3px solid var(--border-color, #e5e5ea);
      border-top-color: var(--brand-color, #0071e3);
      border-radius: 50%;
      animation: exportSpin 0.8s linear infinite;
    "></div>
    <div class="export-progress-label" style="
      font-size: 15px; font-weight: 600;
      color: var(--text-primary, #1d1d1f);
      margin-bottom: 12px;
    ">${_esc(label)}</div>
    <div class="export-progress-bar-wrap" style="
      width: 100%; height: 6px; border-radius: 3px;
      background: var(--bg-secondary, #f4f4f8);
      overflow: hidden; margin-bottom: 8px;
    ">
      <div class="export-progress-bar-fill" style="
        width: 0%; height: 100%; border-radius: 3px;
        background: var(--brand-color, #0071e3);
        transition: width 0.25s ease;
      "></div>
    </div>
    <div class="export-progress-percent" style="
      font-size: 13px; color: var(--text-secondary, #6e6e73);
    ">0%</div>
  `;

  // Inject keyframes if not already present
  if (!document.getElementById('export-progress-styles')) {
    const style = document.createElement('style');
    style.id = 'export-progress-styles';
    style.textContent = `
      @keyframes exportSpin { to { transform: rotate(360deg); } }
      @keyframes exportProgressFadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const fillEl = card.querySelector('.export-progress-bar-fill');
  const percentEl = card.querySelector('.export-progress-percent');
  const labelEl = card.querySelector('.export-progress-label');

  const update = (percent, msg) => {
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    fillEl.style.width = `${clamped}%`;
    percentEl.textContent = `${clamped}%`;
    if (msg) labelEl.textContent = msg;
  };

  const close = () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease';
    setTimeout(() => overlay.remove(), 220);
  };

  return { update, close };
};

const _esc = (s) => {
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
};
