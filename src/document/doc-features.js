// OfficeLink SL — Document Editor: Remaining Features
// (Auto-correct, word count, stats, TOC, footnotes, endnotes, equation editor,
//  style gallery, mail merge, image insert, document outline, bookmarks,
//  image resize, paragraph spacing, document compare, date/time picker,
//  focus mode, reading mode, multi-column picker, paragraph drag reorder,
//  smart table ops, templates, citations, spell check, auto-save,
//  version diff, smart styles, outline navigator, writing stats, page break indicators)

import {
  editorEl, dirty, setDirty, t, escapeHtml,
  insertHTMLAtCursor,
  outlineVisible, setOutlineVisible,
  autoSaveInterval, setAutoSaveInterval,
  AUTO_SAVE_KEY, AUTO_SAVE_TS_KEY, AUTO_SAVE_INTERVAL_MS,
  WRITING_STREAK_KEY, SESSION_START_KEY,
  sessionStartTime, setSessionStartTime,
  sessionWordCountStart, setSessionWordCountStart,
  wordGoal, setWordGoal,
  autoCorrectEnabled, setAutoCorrectEnabled, AUTO_CORRECT_MAP, AUTO_CORRECT_KEY,
  _addHandler, _visibilityHandler, setVisibilityHandler,
  footnoteCounter, setFootnoteCounter,
  endnoteCounter, setEndnoteCounter,
  bookmarks, setBookmarks,
  activeResizeImg, setActiveResizeImg,
  focusModeActive, focusModeOverlay, setFocusModeActive, setFocusModeOverlay,
  readingModeActive, readingModeOverlay, setReadingModeActive, setReadingModeOverlay,
  dragReorderEnabled, dragSrcEl, setDragReorderEnabled, setDragSrcEl,
  outlineNavVisible, setOutlineNavVisible,
  spellCheckEnabled, spellCheckMarks, setSpellCheckEnabled, setSpellCheckMarks,
  pageBreakObserver, pageBreakDebounceTimer,
  setPageBreakObserver, setPageBreakDebounceTimer,
} from './doc-state.js';

// ─── Auto-Correct ──────────────────────────────────────────

export function toggleAutoCorrect() {
  setAutoCorrectEnabled(!autoCorrectEnabled);
  localStorage.setItem(AUTO_CORRECT_KEY, String(autoCorrectEnabled));
  const btn = document.getElementById('doc-autocorrect');
  if (btn) {
    btn.style.opacity = autoCorrectEnabled ? '1' : '0.6';
    btn.style.background = autoCorrectEnabled ? 'var(--accent-color)' : '';
    btn.style.color = autoCorrectEnabled ? '#fff' : '';
  }
}

// ─── Word Count ────────────────────────────────────────────

export function updateWordCount() {
  const statusEl = document.getElementById('doc-status-bar');
  if (!statusEl || !editorEl) return;
  const text = editorEl.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const paras = editorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').length || 1;
  const readingTime = Math.max(1, Math.ceil(words / 200));
  const pages = Math.max(1, Math.ceil(words / 250));

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const syllables = text.split(/\s+/).reduce((acc, word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return acc + 1;
    let count = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)?.length || 1;
    return acc + count;
  }, 0);
  const fkGrade = words > 30 ? Math.round((0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59) * 10) / 10 : 0;
  const readLevel = fkGrade <= 0 ? '' : fkGrade <= 5 ? '(Easy)' : fkGrade <= 8 ? '(Medium)' : fkGrade <= 12 ? '(Advanced)' : '(Expert)';

  let goalStr = '';
  if (wordGoal > 0) {
    const pct = Math.min(100, Math.round((words / wordGoal) * 100));
    goalStr = `  |  Goal: ${pct}% (${words}/${wordGoal})`;
  }

  statusEl.innerHTML = `<span id="doc-stats-clickable" style="cursor:pointer" title="Click for detailed statistics">Words: ${words.toLocaleString()}  |  Chars: ${chars.toLocaleString()} (${charsNoSpace.toLocaleString()})  |  \u00B6${paras}  |  ~${readingTime} min read  |  ~${pages} pg${fkGrade > 0 ? `  |  Grade ${fkGrade} ${readLevel}` : ''}${goalStr}</span>  <button id="doc-word-goal-btn" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--text-tertiary);text-decoration:underline">${wordGoal > 0 ? 'Edit Goal' : 'Set Goal'}</button>`;

  document.getElementById('doc-stats-clickable')?.addEventListener('click', () => {
    showDocStatsDialog(words, chars, charsNoSpace, paras, readingTime, pages, sentences, fkGrade, readLevel, syllables);
  });

  // Update progress bar if goal is set
  let bar = document.getElementById('doc-goal-progress');
  if (wordGoal > 0) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'doc-goal-progress';
      bar.style.cssText = 'height:3px;background:var(--border-color);position:relative';
      statusEl.parentElement?.insertBefore(bar, statusEl);
    }
    const pct = Math.min(100, (words / wordGoal) * 100);
    bar.innerHTML = `<div style="height:100%;width:${pct}%;background:${pct >= 100 ? '#34a853' : '#4285f4'};transition:width 0.3s;border-radius:2px"></div>`;
  } else if (bar) {
    bar.remove();
  }

  document.getElementById('doc-word-goal-btn')?.addEventListener('click', () => {
    const val = prompt('Set word count goal (0 to clear):', wordGoal || '');
    if (val !== null) {
      setWordGoal(parseInt(val, 10) || 0);
      updateWordCount();
    }
  });
}

function showDocStatsDialog(words, chars, charsNoSpace, paras, readingTime, pages, sentences, fkGrade, readLevel, syllables) {
  document.querySelector('.doc-stats-dialog')?.remove();

  const sel = window.getSelection();
  let selWords = 0, selChars = 0;
  if (sel && !sel.isCollapsed) {
    const selText = sel.toString();
    selWords = selText.trim() ? selText.trim().split(/\s+/).length : 0;
    selChars = selText.length;
  }

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
  const images = editorEl.querySelectorAll('img').length;
  const links = editorEl.querySelectorAll('a').length;
  const tables = editorEl.querySelectorAll('table').length;
  const lists = editorEl.querySelectorAll('ul, ol').length;

  const avgWordLen = words > 0 ? (charsNoSpace / words).toFixed(1) : 0;
  const avgSentLen = sentences > 0 ? (words / sentences).toFixed(1) : 0;
  const speakingTime = Math.max(1, Math.ceil(words / 130));

  const dlg = document.createElement('div');
  dlg.className = 'ai-setup-modal doc-stats-dialog';
  dlg.innerHTML = `
    <div class="ai-setup-content" style="width:400px">
      <div class="ai-setup-header">
        <h3>Document Statistics</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Words</td><td style="padding:6px 8px;font-weight:600;text-align:right">${words.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Characters (with spaces)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${chars.toLocaleString()}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Characters (no spaces)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${charsNoSpace.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Sentences</td><td style="padding:6px 8px;font-weight:600;text-align:right">${sentences}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Paragraphs</td><td style="padding:6px 8px;font-weight:600;text-align:right">${paras}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Pages (est.)</td><td style="padding:6px 8px;font-weight:600;text-align:right">${pages}</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Syllables</td><td style="padding:6px 8px;font-weight:600;text-align:right">${syllables.toLocaleString()}</td></tr>
            <tr style="background:var(--sidebar-bg)"><td style="padding:6px 8px;color:var(--text-secondary)">Avg word length</td><td style="padding:6px 8px;font-weight:600;text-align:right">${avgWordLen} chars</td></tr>
            <tr><td style="padding:6px 8px;color:var(--text-secondary)">Avg sentence length</td><td style="padding:6px 8px;font-weight:600;text-align:right">${avgSentLen} words</td></tr>
          </tbody>
        </table>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Time Estimates</div>
          <div style="display:flex;gap:12px;font-size:13px">
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${readingTime}</div>
              <div style="font-size:10px;color:var(--text-secondary)">min reading</div>
            </div>
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${speakingTime}</div>
              <div style="font-size:10px;color:var(--text-secondary)">min speaking</div>
            </div>
            <div style="flex:1;padding:8px;background:var(--sidebar-bg);border-radius:6px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${fkGrade || '-'}</div>
              <div style="font-size:10px;color:var(--text-secondary)">FK Grade ${readLevel}</div>
            </div>
          </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Elements</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Headings: ${headings}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Images: ${images}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Links: ${links}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Tables: ${tables}</span>
            <span style="padding:3px 8px;background:var(--sidebar-bg);border-radius:4px">Lists: ${lists}</span>
          </div>
        </div>
        ${selWords > 0 ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color,#0071e3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Selection</div>
          <div style="font-size:13px;color:var(--text-secondary)">${selWords} words, ${selChars} characters selected</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(dlg);
  dlg.querySelector('.ai-setup-close')?.addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
}

// ─── Table of Contents ──────────────────────────────────────

export function insertTableOfContents() {
  if (!editorEl) return;

  editorEl.querySelector('.doc-toc')?.remove();

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length === 0) {
    alert('No headings found. Add headings (H1-H6) first.');
    return;
  }

  const counters = [0, 0, 0, 0, 0, 0];

  const toc = document.createElement('div');
  toc.className = 'doc-toc';
  toc.contentEditable = 'false';

  let tocHtml = `<div class="doc-toc-title" style="font-size:18px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--accent-color, #0071e3)">Table of Contents</div>
  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">${headings.length} sections</div>
  <nav class="doc-toc-list">`;

  headings.forEach((h, i) => {
    const level = parseInt(h.tagName[1]);
    const id = `toc-heading-${i}`;
    h.id = id;

    counters[level - 1]++;
    for (let j = level; j < 6; j++) counters[j] = 0;

    const numParts = [];
    for (let j = 0; j < level; j++) {
      if (counters[j] > 0) numParts.push(counters[j]);
    }
    const numStr = numParts.join('.');

    const indent = (level - 1) * 20;
    const fontSize = Math.max(11, 15 - level);
    const fontWeight = level <= 2 ? '600' : '400';
    const color = level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)';

    tocHtml += `<a href="#${id}" class="doc-toc-item" style="padding-left:${indent}px;font-size:${fontSize}px;font-weight:${fontWeight};color:${color};display:flex;align-items:baseline;gap:6px;text-decoration:none;padding:4px 8px;border-radius:4px;transition:background 0.15s" onclick="event.preventDefault();document.getElementById('${id}').scrollIntoView({behavior:'smooth'})" onmouseenter="this.style.background='var(--hover-bg, #f0f0f0)'" onmouseleave="this.style.background='transparent'">
      <span style="color:var(--accent-color, #0071e3);font-size:${fontSize - 1}px;min-width:${level * 16}px">${numStr}</span>
      <span style="flex:1">${h.textContent}</span>
      <span style="border-bottom:1px dotted var(--border-color);flex:1;min-width:20px;margin:0 4px"></span>
    </a>`;
  });
  tocHtml += '</nav>';
  toc.innerHTML = tocHtml;

  editorEl.insertBefore(toc, editorEl.firstChild);
  setDirty(true);
}

// ─── Footnotes ──────────────────────────────────────────────

export function insertFootnote() {
  if (!editorEl) return;

  setFootnoteCounter(footnoteCounter + 1);
  const id = `fn-${footnoteCounter}`;

  const refHtml = `<sup class="doc-fn-ref" data-fn="${id}" style="color:var(--brand-color);cursor:pointer;font-weight:700">[${footnoteCounter}]</sup>`;
  insertHTMLAtCursor(refHtml);

  let fnSection = editorEl.querySelector('.doc-footnotes');
  if (!fnSection) {
    fnSection = document.createElement('div');
    fnSection.className = 'doc-footnotes';
    fnSection.contentEditable = 'false';
    fnSection.innerHTML = '<hr style="margin-top:32px"><div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">Footnotes</div>';
    editorEl.appendChild(fnSection);
  }

  const fnItem = document.createElement('div');
  fnItem.className = 'doc-fn-item';
  fnItem.contentEditable = 'true';
  fnItem.id = id;
  fnItem.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:2px 0;margin-left:16px;text-indent:-16px';
  fnItem.innerHTML = `<sup style="color:var(--brand-color);font-weight:700">[${footnoteCounter}]</sup> <span>Enter footnote text...</span>`;
  fnSection.appendChild(fnItem);

  fnItem.focus();
  setDirty(true);
}

// ─── Endnotes ───────────────────────────────────────────────

export function insertEndnote() {
  if (!editorEl) return;

  setEndnoteCounter(endnoteCounter + 1);
  const id = `en-${endnoteCounter}`;

  const romanNum = toRoman(endnoteCounter);
  const refHtml = `<sup class="doc-en-ref" data-en="${id}" style="color:#9333ea;cursor:pointer;font-weight:700">[${romanNum}]</sup>`;
  insertHTMLAtCursor(refHtml);

  let enSection = editorEl.querySelector('.doc-endnotes');
  if (!enSection) {
    enSection = document.createElement('div');
    enSection.className = 'doc-endnotes';
    enSection.contentEditable = 'false';
    enSection.innerHTML = '<hr style="margin-top:48px;border-top:2px double var(--border-color)"><div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Endnotes</div>';
    editorEl.appendChild(enSection);
  }
  const fnSection = editorEl.querySelector('.doc-footnotes');
  if (fnSection && fnSection.nextSibling !== enSection) {
    editorEl.appendChild(enSection);
  }

  const enItem = document.createElement('div');
  enItem.className = 'doc-en-item';
  enItem.contentEditable = 'true';
  enItem.id = id;
  enItem.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:3px 0;margin-left:20px;text-indent:-20px';
  enItem.innerHTML = `<sup style="color:#9333ea;font-weight:700">[${romanNum}]</sup> <span>Enter endnote text...</span>`;
  enSection.appendChild(enItem);

  enItem.focus();
  setDirty(true);
}

function toRoman(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r.toLowerCase();
}

// ─── Equation Editor ────────────────────────────────────────

export function showEquationEditor() {
  const existing = document.querySelector('.doc-eq-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.className = 'doc-eq-dialog';
  dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2000';

  const presets = [
    { label: 'Fraction', tex: '\\frac{a}{b}' },
    { label: 'Square Root', tex: '\\sqrt{x}' },
    { label: 'Power', tex: 'x^{n}' },
    { label: 'Subscript', tex: 'x_{i}' },
    { label: 'Sum', tex: '\\sum_{i=1}^{n} x_i' },
    { label: 'Product', tex: '\\prod_{i=1}^{n} x_i' },
    { label: 'Integral', tex: '\\int_{a}^{b} f(x) dx' },
    { label: 'Limit', tex: '\\lim_{x \\to \\infty} f(x)' },
    { label: 'Matrix', tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
    { label: 'Quadratic', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { label: 'E=mc\u00B2', tex: 'E = mc^{2}' },
    { label: 'Pythagorean', tex: 'a^{2} + b^{2} = c^{2}' },
    { label: 'Euler', tex: 'e^{i\\pi} + 1 = 0' },
    { label: 'Derivative', tex: '\\frac{dy}{dx}' },
    { label: 'Partial', tex: '\\frac{\\partial f}{\\partial x}' },
    { label: 'Infinity', tex: '\\infty' },
  ];

  dialog.innerHTML = `
    <div style="background:var(--bg-primary);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:20px 24px;width:500px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary)">Equation Editor</h3>
        <button class="eq-close" style="border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-primary)">&times;</button>
      </div>
      <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 12px">Enter LaTeX-like notation or click a preset:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${presets.map(p => `<button class="eq-preset" data-tex="${p.tex}" style="padding:4px 8px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary);font-family:'SF Mono',monospace" title="${p.tex}">${p.label}</button>`).join('')}
      </div>
      <textarea id="eq-input" style="width:100%;height:60px;padding:8px;border:1px solid var(--border-color);border-radius:8px;font-family:'SF Mono','Fira Code',monospace;font-size:14px;background:var(--bg-primary);color:var(--text-primary);resize:vertical" placeholder="e.g. E = mc^{2}"></textarea>
      <div style="margin-top:8px;padding:16px;background:var(--hover-bg);border-radius:8px;min-height:40px;text-align:center;font-size:20px" id="eq-preview"></div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="eq-close" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;color:var(--text-primary);font-size:13px">Cancel</button>
        <button id="eq-insert" style="padding:8px 16px;border:none;border-radius:6px;background:var(--brand-color);cursor:pointer;color:#fff;font-weight:600;font-size:13px">Insert</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('#eq-input');
  const preview = dialog.querySelector('#eq-preview');

  function texToHTML(tex) {
    return tex
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle"><span style="border-bottom:1px solid currentColor;padding:0 4px">$1</span><span style="padding:0 4px">$2</span></span>')
      .replace(/\\sqrt\{([^}]+)\}/g, '\u221A<span style="border-top:1px solid currentColor;padding:0 2px">$1</span>')
      .replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">\u2211</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\prod_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">\u220F</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '<span style="font-size:1.4em">\u222B</span><sub>$1</sub><sup>$2</sup>')
      .replace(/\\lim_\{([^}]+)\}/g, 'lim<sub>$1</sub>')
      .replace(/\\begin\{pmatrix\}(.+?)\\end\{pmatrix\}/g, (_, content) => {
        const rows = content.split('\\\\').map(r => r.trim().split('&').map(c => `<td style="padding:2px 8px">${c.trim()}</td>`).join('')).map(r => `<tr>${r}</tr>`).join('');
        return `<span style="display:inline-flex;align-items:center">(<table style="display:inline-table;border-collapse:collapse">${rows}</table>)</span>`;
      })
      .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
      .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
      .replace(/\^(\w)/g, '<sup>$1</sup>')
      .replace(/_(\w)/g, '<sub>$1</sub>')
      .replace(/\\pm/g, '\u00B1')
      .replace(/\\times/g, '\u00D7')
      .replace(/\\div/g, '\u00F7')
      .replace(/\\infty/g, '\u221E')
      .replace(/\\pi/g, '\u03C0')
      .replace(/\\alpha/g, '\u03B1').replace(/\\beta/g, '\u03B2').replace(/\\gamma/g, '\u03B3').replace(/\\delta/g, '\u03B4')
      .replace(/\\theta/g, '\u03B8').replace(/\\lambda/g, '\u03BB').replace(/\\mu/g, '\u03BC').replace(/\\sigma/g, '\u03C3')
      .replace(/\\phi/g, '\u03C6').replace(/\\omega/g, '\u03C9').replace(/\\epsilon/g, '\u03B5')
      .replace(/\\partial/g, '\u2202')
      .replace(/\\to/g, '\u2192')
      .replace(/\\leq/g, '\u2264').replace(/\\geq/g, '\u2265').replace(/\\neq/g, '\u2260')
      .replace(/\\cdot/g, '\u00B7')
      .replace(/\\ldots/g, '\u2026')
      .replace(/\\forall/g, '\u2200').replace(/\\exists/g, '\u2203')
      .replace(/\\in/g, '\u2208').replace(/\\subset/g, '\u2282').replace(/\\cup/g, '\u222A').replace(/\\cap/g, '\u2229')
      .replace(/\\nabla/g, '\u2207')
      .replace(/\\Delta/g, '\u0394').replace(/\\Sigma/g, '\u03A3').replace(/\\Omega/g, '\u03A9')
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
  }

  input.addEventListener('input', () => {
    preview.innerHTML = texToHTML(input.value) || '<span style="color:var(--text-tertiary)">Preview</span>';
  });

  dialog.querySelectorAll('.eq-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.tex;
      preview.innerHTML = texToHTML(btn.dataset.tex);
    });
  });

  dialog.querySelectorAll('.eq-close').forEach(btn => {
    btn.addEventListener('click', () => dialog.remove());
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#eq-insert').addEventListener('click', () => {
    const tex = input.value.trim();
    if (!tex) return;

    editorEl?.focus();
    const html = `<span class="doc-equation" contenteditable="false" style="display:inline-block;padding:4px 8px;margin:2px 4px;background:var(--hover-bg);border:1px solid var(--border-color);border-radius:6px;font-family:'Times New Roman',serif;font-size:1.1em;cursor:default;user-select:all" title="${tex}">${texToHTML(tex)}</span>`;
    document.execCommand('insertHTML', false, html);
    setDirty(true);
    dialog.remove();
  });
}

// ─── Quick Style Gallery ────────────────────────────────────

export function showStyleGallery() {
  const existing = document.querySelector('.doc-style-gallery');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('doc-styles');
  const rect = btn.getBoundingClientRect();

  const styles = [
    { name: 'Title', css: 'font-size:28px;font-weight:800;color:var(--text-primary);margin:0 0 8px;line-height:1.2', tag: 'h1' },
    { name: 'Subtitle', css: 'font-size:18px;font-weight:400;color:var(--text-secondary);margin:0 0 16px;line-height:1.4', tag: 'p' },
    { name: 'Heading 1', css: 'font-size:24px;font-weight:700;color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:4px;margin:24px 0 8px', tag: 'h1' },
    { name: 'Heading 2', css: 'font-size:20px;font-weight:600;color:#333;margin:20px 0 6px', tag: 'h2' },
    { name: 'Quote', css: 'font-size:16px;font-style:italic;color:#555;border-left:4px solid #1a73e8;padding:8px 16px;margin:12px 0;background:rgba(26,115,232,0.05)', tag: 'blockquote' },
    { name: 'Code Block', css: 'font-family:monospace;font-size:13px;background:#f5f5f5;padding:12px 16px;border-radius:6px;border:1px solid #e0e0e0;white-space:pre-wrap;margin:12px 0', tag: 'pre' },
    { name: 'Lead Paragraph', css: 'font-size:18px;font-weight:300;color:#444;line-height:1.7;margin:12px 0', tag: 'p' },
    { name: 'Highlight Box', css: 'background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Info Box', css: 'background:#e3f2fd;border:1px solid #2196f3;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Success Box', css: 'background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Danger Box', css: 'background:#ffebee;border:1px solid #f44336;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:14px', tag: 'div' },
    { name: 'Caption', css: 'font-size:12px;color:#888;text-align:center;font-style:italic;margin:4px 0 16px', tag: 'p' },
  ];

  const gallery = document.createElement('div');
  gallery.className = 'doc-style-gallery';
  gallery.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;width:320px;max-height:400px;overflow:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;z-index:2000`;

  styles.forEach(s => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px;cursor:pointer;border-radius:4px;margin-bottom:2px;transition:background 0.15s';
    item.innerHTML = `<div style="${s.css};pointer-events:none;font-size:${Math.min(parseInt(s.css.match(/font-size:(\d+)/)?.[1] || 14), 16)}px;line-height:1.3;max-height:28px;overflow:hidden">${s.name}</div>`;
    item.onmouseenter = () => item.style.background = 'var(--hover-bg)';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = () => {
      editorEl.focus();
      const html = `<${s.tag} style="${s.css}">${s.name === 'Code Block' ? 'code here...' : 'Type here...'}</${s.tag}>`;
      document.execCommand('insertHTML', false, html);
      setDirty(true);
      gallery.remove();
    };
    gallery.appendChild(item);
  });

  document.body.appendChild(gallery);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!gallery.contains(e.target) && e.target !== btn) {
        gallery.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

// ─── Mail Merge ─────────────────────────────────────────────

export function showMailMergeDialog() {
  if (!editorEl) return;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `<div class="modal-content" style="width:600px;max-height:85vh;overflow:auto">
    <h3 style="margin:0 0 4px">Mail Merge</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px">
      Use <code>{{field_name}}</code> placeholders in your document. Upload CSV data to generate merged documents.
    </p>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 1: Data Source (CSV)</label>
      <input type="file" id="mm-file" accept=".csv,.tsv,.txt" style="font-size:12px">
      <div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Or paste data below:</div>
      <textarea id="mm-data" rows="4" placeholder="name,email,company&#10;John,john@example.com,Acme Inc&#10;Jane,jane@example.com,Corp Ltd" style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:4px;font-family:monospace;font-size:11px;background:var(--bg-primary);color:var(--text-primary);margin-top:4px;resize:vertical"></textarea>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 2: Available Fields</label>
      <div id="mm-fields" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;padding:8px;border:1px solid var(--border-color);border-radius:4px;background:var(--hover-bg)">
        <span style="font-size:11px;color:var(--text-secondary)">Load data to see fields</span>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Step 3: Preview</label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
        <button id="mm-prev-rec" class="toolbar-btn" style="padding:2px 8px">\u25C0</button>
        <span id="mm-rec-num" style="font-size:12px">Record 1</span>
        <button id="mm-next-rec" class="toolbar-btn" style="padding:2px 8px">\u25B6</button>
      </div>
      <div id="mm-preview" style="border:1px solid var(--border-color);border-radius:4px;padding:12px;min-height:100px;font-size:13px;max-height:200px;overflow:auto;background:var(--bg-primary)"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="toolbar-btn" id="mm-cancel" style="padding:6px 16px">Cancel</button>
      <button class="toolbar-btn" id="mm-generate" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px">Generate All Documents</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  let records = [];
  let headers = [];
  let previewIdx = 0;

  function parseCSVData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return;
    headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    records = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const rec = {};
      headers.forEach((h, j) => { rec[h] = vals[j] || ''; });
      records.push(rec);
    }
    updateFields();
    updatePreview();
  }

  function updateFields() {
    const fieldsEl = dlg.querySelector('#mm-fields');
    fieldsEl.innerHTML = headers.map(h =>
      `<button class="mm-field-btn" data-field="${h}" style="padding:2px 8px;font-size:11px;border:1px solid var(--accent-color);border-radius:4px;background:transparent;color:var(--accent-color);cursor:pointer" title="Click to insert {{${h}}} at cursor">{{${h}}}</button>`
    ).join('');
    fieldsEl.querySelectorAll('.mm-field-btn').forEach(btn => {
      btn.onclick = () => {
        editorEl.focus();
        document.execCommand('insertText', false, `{{${btn.dataset.field}}}`);
      };
    });
  }

  function mergeTemplate(template, record) {
    let result = template;
    for (const [key, val] of Object.entries(record)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), val);
    }
    return result;
  }

  function updatePreview() {
    if (records.length === 0) return;
    previewIdx = Math.max(0, Math.min(previewIdx, records.length - 1));
    dlg.querySelector('#mm-rec-num').textContent = `Record ${previewIdx + 1} of ${records.length}`;
    const merged = mergeTemplate(editorEl.innerHTML, records[previewIdx]);
    dlg.querySelector('#mm-preview').innerHTML = merged;
  }

  dlg.querySelector('#mm-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      dlg.querySelector('#mm-data').value = ev.target.result;
      parseCSVData(ev.target.result);
    };
    reader.readAsText(file);
  };

  dlg.querySelector('#mm-data').onblur = () => {
    const text = dlg.querySelector('#mm-data').value;
    if (text.trim()) parseCSVData(text);
  };

  dlg.querySelector('#mm-prev-rec').onclick = () => { previewIdx--; updatePreview(); };
  dlg.querySelector('#mm-next-rec').onclick = () => { previewIdx++; updatePreview(); };
  dlg.querySelector('#mm-cancel').onclick = () => dlg.remove();

  dlg.querySelector('#mm-generate').onclick = () => {
    if (records.length === 0) { alert('No data loaded.'); return; }
    const win = window.open('', '_blank');
    let html = `<!DOCTYPE html><html><head><title>Mail Merge Results</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 20px; }
      .merge-doc { border: 1px solid #ccc; padding: 24px 32px; margin-bottom: 24px; page-break-after: always; max-width: 700px; margin-left: auto; margin-right: auto; }
      .merge-doc:last-child { page-break-after: auto; }
      .merge-header { font-size: 11px; color: #999; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px dashed #ccc; }
      @media print { .merge-header { display: none; } }
    </style></head><body>
    <h2 style="text-align:center;margin-bottom:24px">Mail Merge \u2014 ${records.length} Documents</h2>`;

    records.forEach((rec, i) => {
      const merged = mergeTemplate(editorEl.innerHTML, rec);
      html += `<div class="merge-doc">
        <div class="merge-header">Document ${i + 1} \u2014 ${Object.values(rec)[0] || ''}</div>
        ${merged}
      </div>`;
    });

    html += '<script>setTimeout(()=>window.print(),500)<\/script></body></html>';
    win.document.write(html);
    win.document.close();
    dlg.remove();
  };
}

// ─── Image Insert Dialog ────────────────────────────────────

export function showImageInsertDialog() {
  document.querySelector('.doc-img-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-img-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:420px">
      <div class="ai-setup-header">
        <h3>Insert Image</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Browse from your device</label>
          <div id="img-drop-zone" style="border:2px dashed var(--border-color);border-radius:8px;padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s">
            <span style="font-size:32px;display:block;margin-bottom:8px">\u{1F5BC}</span>
            <span style="font-size:13px;color:var(--text-secondary)">Click to browse or drag & drop an image here</span>
            <input type="file" id="img-file-input" accept="image/*" style="display:none">
          </div>
          <div id="img-preview" style="display:none;margin-top:12px;text-align:center">
            <img id="img-preview-el" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border-color)">
          </div>
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Or enter URL</label>
          <input type="text" id="img-url-input" class="doc-find-input" style="width:100%" placeholder="https://example.com/image.png">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="img-cancel">Cancel</button>
          <button class="ai-pull-btn" id="img-insert" style="background:var(--brand-color);color:#fff">Insert</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let selectedDataUrl = '';

  const fileInput = dialog.querySelector('#img-file-input');
  const dropZone = dialog.querySelector('#img-drop-zone');
  const previewDiv = dialog.querySelector('#img-preview');
  const previewImg = dialog.querySelector('#img-preview-el');
  const urlInput = dialog.querySelector('#img-url-input');

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleImageFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--brand-color)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
  });

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedDataUrl = e.target.result;
      previewImg.src = selectedDataUrl;
      previewDiv.style.display = '';
      urlInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#img-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#img-insert')?.addEventListener('click', () => {
    const src = selectedDataUrl || urlInput.value.trim();
    if (!src) return;

    editorEl?.focus();
    if (src.startsWith('data:')) {
      insertHTMLAtCursor(`<img src="${src}" style="max-width:100%" />`);
    } else {
      document.execCommand('insertImage', false, src);
    }
    setDirty(true);
    dialog.remove();
  });
}

// ─── Document Outline ───────────────────────────────────────

export function toggleDocOutline() {
  const panel = document.getElementById('doc-outline');
  if (!panel) return;
  setOutlineVisible(!outlineVisible);
  panel.classList.toggle('hidden', !outlineVisible);
  if (outlineVisible) updateDocOutline();
}

export function updateDocOutline() {
  const list = document.getElementById('doc-outline-list');
  if (!list || !editorEl) return;

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (!headings.length) {
    list.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:12px;text-align:center">No headings found.<br>Add headings (H1-H6) to see the outline.</div>';
    return;
  }

  list.innerHTML = '';
  headings.forEach((h, idx) => {
    const level = parseInt(h.tagName[1]);
    const btn = document.createElement('button');
    btn.className = 'doc-outline-item';
    btn.dataset.level = level;
    btn.textContent = h.textContent || `Heading ${idx + 1}`;
    btn.title = h.textContent;
    btn.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origBg = h.style.background;
      h.style.background = 'rgba(59, 130, 246, 0.15)';
      h.style.borderRadius = '4px';
      setTimeout(() => {
        h.style.background = origBg;
        h.style.borderRadius = '';
      }, 1500);
    });
    list.appendChild(btn);
  });
}

// ─── Page Break Insert ──────────────────────────────────────

export function insertPageBreak() {
  if (!editorEl) return;
  editorEl.focus();

  const breakHtml = `<div class="doc-page-break" contenteditable="false" style="page-break-after:always;border-top:2px dashed var(--border-color);margin:24px 0;padding:4px 0;text-align:center;font-size:10px;color:var(--text-tertiary);user-select:none;cursor:default">\u2014 Page Break \u2014</div>`;
  document.execCommand('insertHTML', false, breakHtml);
  setDirty(true);
}

// ─── Bookmarks ──────────────────────────────────────────────

export function insertBookmark() {
  const name = prompt('Bookmark name:');
  if (!name) return;

  const id = 'bm-' + Date.now();
  const bookmark = { id, name };
  const newBookmarks = [...bookmarks];
  newBookmarks.push(bookmark);
  setBookmarks(newBookmarks);

  editorEl?.focus();
  const html = `<span class="doc-bookmark" id="${id}" contenteditable="false" style="display:inline-block;width:16px;height:16px;background:#3b82f6;color:#fff;font-size:9px;font-weight:700;text-align:center;line-height:16px;border-radius:3px;cursor:pointer;vertical-align:middle;margin:0 2px;user-select:none" title="Bookmark: ${name}">\u{1F516}</span>`;
  document.execCommand('insertHTML', false, html);

  setTimeout(() => {
    const bmEl = document.getElementById(id);
    if (bmEl) {
      bmEl.addEventListener('click', (e) => {
        e.preventDefault();
        showBookmarkJumpMenu();
      });
    }
  }, 100);

  setDirty(true);
}

export function showBookmarkJumpMenu() {
  const existing = document.querySelector('.doc-bookmark-menu');
  if (existing) existing.remove();

  if (!bookmarks.length) {
    alert('No bookmarks found');
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'doc-bookmark-menu';
  menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;z-index:2000;min-width:240px';

  menu.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:var(--text-primary)">Bookmarks</h3>
    ${bookmarks.map(bm => `
      <button class="bm-item" data-id="${bm.id}" style="display:block;width:100%;text-align:left;padding:8px 12px;margin:4px 0;border:1px solid var(--border-color);border-radius:6px;background:var(--hover-bg);cursor:pointer;color:var(--text-primary);font-size:13px">
        \u{1F516} ${bm.name}
      </button>
    `).join('')}
    <button class="bm-close" style="margin-top:8px;width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;color:var(--text-primary);font-size:12px">Close</button>
  `;

  document.body.appendChild(menu);

  menu.querySelectorAll('.bm-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      menu.remove();
    });
  });
  menu.querySelector('.bm-close').addEventListener('click', () => menu.remove());
}

// ─── Image Resize Handles ───────────────────────────────────

export function removeImageResizeHandles() {
  document.querySelectorAll('.doc-img-resize-wrap').forEach(wrap => {
    const img = wrap.querySelector('img');
    if (img) wrap.parentNode.insertBefore(img, wrap);
    wrap.remove();
  });
  setActiveResizeImg(null);
}

export function showImageResizeHandles(img) {
  removeImageResizeHandles();
  setActiveResizeImg(img);

  const wrapper = document.createElement('span');
  wrapper.className = 'doc-img-resize-wrap';
  wrapper.contentEditable = 'false';
  wrapper.style.cssText = 'display:inline-block;position:relative;line-height:0;border:2px solid #3b82f6;';
  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);

  const handles = [
    { cursor: 'nw-resize', pos: 'top:0;left:0;transform:translate(-50%,-50%)' },
    { cursor: 'n-resize', pos: 'top:0;left:50%;transform:translate(-50%,-50%)' },
    { cursor: 'ne-resize', pos: 'top:0;right:0;transform:translate(50%,-50%)' },
    { cursor: 'e-resize', pos: 'top:50%;right:0;transform:translate(50%,-50%)' },
    { cursor: 'se-resize', pos: 'bottom:0;right:0;transform:translate(50%,50%)' },
    { cursor: 's-resize', pos: 'bottom:0;left:50%;transform:translate(-50%,50%)' },
    { cursor: 'sw-resize', pos: 'bottom:0;left:0;transform:translate(-50%,50%)' },
    { cursor: 'w-resize', pos: 'top:50%;left:0;transform:translate(-50%,-50%)' },
  ];

  handles.forEach(h => {
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;${h.pos};width:8px;height:8px;background:#3b82f6;border:1px solid #fff;border-radius:50%;cursor:${h.cursor};z-index:2;`;
    dot.addEventListener('mousedown', (e) => startImageResize(e, img, h.cursor));
    wrapper.appendChild(dot);
  });

  const label = document.createElement('div');
  label.className = 'doc-img-size-label';
  label.style.cssText = 'position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);background:#333;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;white-space:nowrap;pointer-events:none;';
  label.textContent = `${Math.round(img.offsetWidth)} \u00D7 ${Math.round(img.offsetHeight)}`;
  wrapper.appendChild(label);
}

function startImageResize(e, img, cursor) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX, startY = e.clientY;
  const startW = img.offsetWidth, startH = img.offsetHeight;
  const ratio = startW / startH;
  const label = img.parentNode?.querySelector('.doc-img-size-label');

  const onMove = (ev) => {
    let dx = ev.clientX - startX;
    let dy = ev.clientY - startY;
    let newW = startW, newH = startH;

    if (cursor.includes('e')) newW = startW + dx;
    if (cursor.includes('w')) newW = startW - dx;
    if (cursor.includes('s')) newH = startH + dy;
    if (cursor.includes('n')) newH = startH - dy;

    if (cursor.startsWith('nw') || cursor.startsWith('ne') || cursor.startsWith('se') || cursor.startsWith('sw')) {
      newH = newW / ratio;
    }

    newW = Math.max(20, newW);
    newH = Math.max(20, newH);
    img.style.width = newW + 'px';
    img.style.height = newH + 'px';
    if (label) label.textContent = `${Math.round(newW)} \u00D7 ${Math.round(newH)}`;
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    setDirty(true);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Paragraph Spacing ──────────────────────────────────────

export function showParagraphSpacingDialog() {
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const block = node?.nodeType === 3 ? node.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, li, div') : node?.closest('p, h1, h2, h3, h4, h5, h6, li, div');

  const currentLineHeight = block?.style.lineHeight || getComputedStyle(block || editorEl).lineHeight;
  let currentLH = '1.6';
  if (currentLineHeight) {
    const parsed = parseFloat(currentLineHeight);
    if (!isNaN(parsed)) {
      currentLH = parsed <= 4 ? String(parsed) : String(Math.round((parsed / 16) * 100) / 100);
    }
  }

  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-primary,#fff);border-radius:10px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10000;width:360px;font-size:14px;color:var(--text-primary,#333);';
  const inputStyle = 'width:100%;padding:6px;border:1px solid var(--border-color,#ccc);border-radius:4px;margin-top:4px;background:var(--bg-primary,#fff);color:var(--text-primary,#333)';
  const btnStyle = 'flex:1;padding:6px;border:1px solid var(--border-color,#ccc);border-radius:4px;cursor:pointer;font-size:11px;background:var(--bg-primary,#fff);color:var(--text-primary,#333)';
  dlg.innerHTML = `
    <h3 style="margin:0 0 16px">Paragraph Spacing</h3>
    <div style="margin-bottom:16px">
      <label style="font-weight:600;font-size:12px">Line Height:</label>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="ps-lh" data-lh="1" style="${btnStyle}">1.0</button>
        <button class="ps-lh" data-lh="1.15" style="${btnStyle}">1.15</button>
        <button class="ps-lh" data-lh="1.5" style="${btnStyle}">1.5</button>
        <button class="ps-lh" data-lh="2" style="${btnStyle}">2.0</button>
        <input type="number" id="ps-line-height" value="${currentLH}" min="0.5" max="5" step="0.1" style="width:60px;padding:6px;border:1px solid var(--border-color,#ccc);border-radius:4px;text-align:center;background:var(--bg-primary,#fff);color:var(--text-primary,#333)">
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px">
      <div style="flex:1">
        <label style="font-weight:600;font-size:12px">Space Before (px):</label>
        <input type="number" id="ps-before" value="${parseInt(block?.style.marginTop) || 0}" min="0" max="100" style="${inputStyle}">
      </div>
      <div style="flex:1">
        <label style="font-weight:600;font-size:12px">Space After (px):</label>
        <input type="number" id="ps-after" value="${parseInt(block?.style.marginBottom) || 0}" min="0" max="100" style="${inputStyle}">
      </div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-weight:600;font-size:12px">Quick Presets:</label>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="ps-preset" data-before="0" data-after="0" data-lh="1" style="${btnStyle}">Compact</button>
        <button class="ps-preset" data-before="6" data-after="6" data-lh="1.15" style="${btnStyle}">Normal</button>
        <button class="ps-preset" data-before="12" data-after="12" data-lh="1.5" style="${btnStyle}">Open</button>
        <button class="ps-preset" data-before="24" data-after="24" data-lh="2" style="${btnStyle}">Double</button>
      </div>
    </div>
    <div style="text-align:right">
      <button id="ps-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid var(--border-color,#ccc);border-radius:4px;cursor:pointer;background:var(--bg-primary,#fff);color:var(--text-primary,#333)">Cancel</button>
      <button id="ps-apply" style="padding:6px 16px;background:var(--brand-color,#3b82f6);color:#fff;border:none;border-radius:4px;cursor:pointer">Apply</button>
    </div>
  `;
  document.body.appendChild(dlg);

  const lhInput = dlg.querySelector('#ps-line-height');
  dlg.querySelectorAll('.ps-lh').forEach((btn) => {
    btn.addEventListener('click', () => { lhInput.value = btn.dataset.lh; });
  });

  dlg.querySelectorAll('.ps-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      dlg.querySelector('#ps-before').value = btn.dataset.before;
      dlg.querySelector('#ps-after').value = btn.dataset.after;
      lhInput.value = btn.dataset.lh;
    });
  });

  dlg.querySelector('#ps-cancel').addEventListener('click', () => dlg.remove());
  dlg.querySelector('#ps-apply').addEventListener('click', () => {
    const before = dlg.querySelector('#ps-before').value + 'px';
    const after = dlg.querySelector('#ps-after').value + 'px';
    const lh = lhInput.value;
    if (block) {
      block.style.marginTop = before;
      block.style.marginBottom = after;
      block.style.lineHeight = lh;
    }
    const lineSpacingSelect = document.getElementById('doc-line-spacing');
    if (lineSpacingSelect) {
      const opt = Array.from(lineSpacingSelect.options).find((o) => o.value === lh);
      if (opt) lineSpacingSelect.value = lh;
    }
    dlg.remove();
    editorEl?.focus();
    setDirty(true);
  });
}

// ─── Document Compare ───────────────────────────────────────

export function showDocCompare() {
  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  const inputStyle = 'width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box;font-size:13px';

  dlg.innerHTML = `<div class="modal-content" style="width:90vw;max-width:900px;max-height:90vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">Document Compare</h3>
      <button id="doc-compare-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">&times;</button>
    </div>
    <div style="margin-bottom:12px">
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Paste or upload the comparison text below. The current document will be compared against it.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="toolbar-btn" id="doc-compare-paste" style="padding:4px 12px;font-size:12px">Paste Text</button>
        <button class="toolbar-btn" id="doc-compare-file" style="padding:4px 12px;font-size:12px">Load File</button>
        <input type="file" id="doc-compare-file-input" accept=".txt,.html,.htm,.md" style="display:none">
      </div>
      <textarea id="doc-compare-input" style="${inputStyle};height:120px;resize:vertical" placeholder="Paste comparison text here..."></textarea>
    </div>
    <button class="toolbar-btn" id="doc-compare-run" style="padding:6px 16px;background:var(--accent-color);color:white;border-radius:4px;margin-bottom:12px">Compare</button>
    <div id="doc-compare-result" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:8px;font-size:12px">
        <span style="background:#d4edda;padding:2px 8px;border-radius:4px">Added</span>
        <span style="background:#f8d7da;padding:2px 8px;border-radius:4px;text-decoration:line-through">Removed</span>
        <span style="color:var(--text-secondary)">| <span id="doc-compare-stats"></span></span>
      </div>
      <div id="doc-compare-output" style="border:1px solid var(--border-color);border-radius:8px;padding:16px;max-height:400px;overflow:auto;font-size:13px;line-height:1.8;background:var(--bg-primary)"></div>
    </div>
  </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('#doc-compare-close').onclick = () => dlg.remove();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  const fileInput = dlg.querySelector('#doc-compare-file-input');
  dlg.querySelector('#doc-compare-file').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (file) {
      const text = await file.text();
      dlg.querySelector('#doc-compare-input').value = text;
    }
  };

  dlg.querySelector('#doc-compare-run').onclick = () => {
    const compareText = dlg.querySelector('#doc-compare-input').value;
    if (!compareText.trim()) return;

    const currentText = editorEl?.innerText || '';
    const diff = computeWordDiff(currentText, compareText);

    const resultEl = dlg.querySelector('#doc-compare-result');
    const outputEl = dlg.querySelector('#doc-compare-output');
    const statsEl = dlg.querySelector('#doc-compare-stats');
    resultEl.style.display = 'block';

    let added = 0, removed = 0;
    let html = '';
    for (const part of diff) {
      if (part.type === 'add') {
        html += `<span style="background:#d4edda;padding:1px 2px">${escapeHtml(part.text)}</span>`;
        added++;
      } else if (part.type === 'remove') {
        html += `<span style="background:#f8d7da;padding:1px 2px;text-decoration:line-through">${escapeHtml(part.text)}</span>`;
        removed++;
      } else {
        html += escapeHtml(part.text);
      }
    }
    outputEl.innerHTML = html;
    statsEl.textContent = `${added} additions, ${removed} deletions`;
  };
}

function computeWordDiff(oldText, newText) {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result = [];

  const m = oldWords.length, n = newWords.length;
  if (m * n > 1000000) {
    return simpleDiff(oldWords, newWords);
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = m, j = n;
  const parts = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ type: 'same', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'add', text: newWords[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'remove', text: oldWords[i - 1] });
      i--;
    }
  }

  for (const part of parts) {
    if (result.length > 0 && result[result.length - 1].type === part.type) {
      result[result.length - 1].text += part.text;
    } else {
      result.push({ ...part });
    }
  }
  return result;
}

function simpleDiff(oldWords, newWords) {
  const result = [];
  const oldSet = new Set(oldWords.filter(w => w.trim()));
  const newSet = new Set(newWords.filter(w => w.trim()));

  for (const w of oldWords) {
    if (!w.trim()) { result.push({ type: 'same', text: w }); continue; }
    if (newSet.has(w)) result.push({ type: 'same', text: w });
    else result.push({ type: 'remove', text: w });
  }
  for (const w of newWords) {
    if (!w.trim()) continue;
    if (!oldSet.has(w)) result.push({ type: 'add', text: w });
  }
  return result;
}

// ─── Date/Time Picker ───────────────────────────────────────

export function showDateTimePicker() {
  const existing = document.querySelector('.datetime-picker-dialog');
  if (existing) { existing.remove(); return; }

  const now = new Date();
  const formats = [
    { label: 'Full Date', fn: () => now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Short Date', fn: () => now.toLocaleDateString('en-US') },
    { label: 'ISO Date', fn: () => now.toISOString().slice(0, 10) },
    { label: 'Date & Time', fn: () => now.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { label: 'Time Only', fn: () => now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    { label: 'ISO DateTime', fn: () => now.toISOString().slice(0, 16).replace('T', ' ') },
    { label: 'Korean Date', fn: () => now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Korean DateTime', fn: () => now.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
  ];

  const dlg = document.createElement('div');
  dlg.className = 'datetime-picker-dialog';
  dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:20px;z-index:10010;min-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3)';

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3 style="margin:0;font-size:15px;color:var(--text-primary)">Insert Date / Time</h3>
    <button id="dt-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--text-secondary)">&times;</button>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">`;

  formats.forEach((f, i) => {
    const val = f.fn();
    html += `<button class="dt-fmt-btn" data-idx="${i}" style="text-align:left;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);cursor:pointer;font-size:13px;color:var(--text-primary);transition:background 0.15s">
      <span style="color:var(--text-secondary);font-size:11px">${f.label}</span><br>
      <span style="font-weight:500">${val}</span>
    </button>`;
  });

  html += `</div>
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">
    <label style="font-size:12px;color:var(--text-secondary)">Custom format</label>
    <div style="display:flex;gap:8px;margin-top:4px">
      <input id="dt-custom" type="text" value="${now.toISOString().slice(0, 10)}" style="flex:1;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);font-size:13px">
      <button id="dt-insert-custom" class="toolbar-btn" style="padding:6px 14px;background:var(--accent-color);color:white;border-radius:6px;font-size:12px">Insert</button>
    </div>
  </div>`;

  dlg.innerHTML = html;
  document.body.appendChild(dlg);

  function insertTextAtCursor(text) {
    editorEl.focus();
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      document.execCommand('insertText', false, text);
    }
  }

  dlg.querySelector('#dt-close').onclick = () => dlg.remove();
  dlg.querySelectorAll('.dt-fmt-btn').forEach(btn => {
    btn.onmouseenter = () => btn.style.background = 'var(--accent-color-light, rgba(66,133,244,0.1))';
    btn.onmouseleave = () => btn.style.background = 'var(--bg-primary)';
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      insertTextAtCursor(formats[idx].fn());
      dlg.remove();
    };
  });
  dlg.querySelector('#dt-insert-custom').onclick = () => {
    const val = dlg.querySelector('#dt-custom').value;
    if (val) { insertTextAtCursor(val); dlg.remove(); }
  };
}

// ─── Focus Mode ─────────────────────────────────────────────

export function toggleFocusMode() {
  if (!editorEl) return;

  setFocusModeActive(!focusModeActive);
  const btn = document.getElementById('doc-focus-mode');

  if (focusModeActive) {
    const overlay = document.createElement('div');
    overlay.className = 'doc-focus-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary);z-index:9999;display:flex;justify-content:center;overflow-y:auto';

    const container = document.createElement('div');
    container.style.cssText = 'width:700px;max-width:90vw;padding:80px 40px;min-height:100vh';

    const editArea = document.createElement('div');
    editArea.contentEditable = 'true';
    editArea.id = 'doc-focus-editor';
    editArea.style.cssText = 'font-size:18px;line-height:1.8;color:var(--text-primary);outline:none;font-family:Georgia,serif;letter-spacing:0.01em';
    editArea.innerHTML = editorEl.innerHTML;
    container.appendChild(editArea);

    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:white;padding:8px 20px;border-radius:20px;font-size:12px;opacity:0.6;z-index:10000';
    hint.textContent = t('ui.pressEscFocus');
    overlay.appendChild(hint);

    const wc = document.createElement('div');
    wc.style.cssText = 'position:fixed;top:20px;right:30px;font-size:12px;color:var(--text-tertiary);z-index:10000';
    overlay.appendChild(wc);

    const updateWC = () => {
      const text = editArea.innerText || '';
      const words = text.trim().split(/\s+/).filter(w => w).length;
      wc.textContent = `${words} ${t('doc.words')}`;
    };
    editArea.addEventListener('input', updateWC);
    updateWC();

    overlay.appendChild(container);
    document.body.appendChild(overlay);
    setFocusModeOverlay(overlay);
    editArea.focus();

    setTimeout(() => { hint.style.transition = 'opacity 1s'; hint.style.opacity = '0'; }, 3000);

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        editorEl.innerHTML = editArea.innerHTML;
        toggleFocusMode();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (focusModeOverlay) {
      const focusEditor = focusModeOverlay.querySelector('#doc-focus-editor');
      if (focusEditor) {
        editorEl.innerHTML = focusEditor.innerHTML;
      }
      focusModeOverlay.remove();
      setFocusModeOverlay(null);
    }
    if (btn) btn.style.background = '';
  }
}

// ─── Reading Mode ───────────────────────────────────────────

export function toggleReadingMode() {
  if (!editorEl) return;

  setReadingModeActive(!readingModeActive);
  const btn = document.getElementById('doc-reading-mode');

  if (readingModeActive) {
    const overlay = document.createElement('div');
    overlay.className = 'doc-reading-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary);z-index:9999;display:flex;overflow-y:auto';

    const tocPanel = document.createElement('div');
    tocPanel.className = 'reading-toc-panel';
    tocPanel.style.cssText = 'width:260px;min-width:260px;background:var(--bg-secondary);border-right:1px solid var(--border-color);padding:60px 16px 24px;overflow-y:auto;position:sticky;top:0;height:100vh;flex-shrink:0;display:none';

    const tocHeader = document.createElement('div');
    tocHeader.style.cssText = 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:12px;padding:0 4px';
    tocHeader.textContent = t('doc.toc');
    tocPanel.appendChild(tocHeader);

    const tocList = document.createElement('div');
    tocList.className = 'reading-toc-list';
    tocList.style.cssText = 'font-size:13px;line-height:1.6';
    tocPanel.appendChild(tocList);
    overlay.appendChild(tocPanel);

    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = 'flex:1;display:flex;justify-content:center;overflow-y:auto';

    const container = document.createElement('div');
    container.style.cssText = 'width:680px;max-width:90vw;padding:60px 40px;min-height:100vh';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'position:fixed;top:0;left:0;right:0;display:flex;justify-content:center;gap:8px;padding:10px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);z-index:10000';
    toolbar.innerHTML = `
      <button id="read-toc-toggle" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px" title="Toggle Table of Contents">TOC</button>
      <button id="read-font-up" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">A+</button>
      <button id="read-font-down" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">A-</button>
      <button id="read-serif-toggle" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Serif</button>
      <button id="read-sepia" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Sepia</button>
      <button id="read-close" style="border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px">Close</button>
    `;
    overlay.appendChild(toolbar);

    const content = document.createElement('div');
    content.className = 'reading-mode-content';
    content.style.cssText = 'font-size:18px;line-height:2;color:var(--text-primary);font-family:Georgia,serif;margin-top:60px';
    content.innerHTML = editorEl.innerHTML;

    content.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '16px 0';
    });

    content.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h, idx) => {
      if (!h.id) h.id = `reading-heading-${idx}`;
      h.style.marginTop = '1.5em';
      h.style.marginBottom = '0.5em';
    });

    content.querySelectorAll('p').forEach((p) => {
      p.style.marginBottom = '1em';
      p.style.textAlign = 'justify';
    });

    content.querySelectorAll('blockquote').forEach((bq) => {
      bq.style.cssText = 'border-left:3px solid var(--accent-color);padding:8px 20px;margin:16px 0;font-style:italic;opacity:0.85;background:rgba(0,0,0,0.02);border-radius:0 6px 6px 0';
    });

    container.appendChild(content);

    const progressBar = document.createElement('div');
    progressBar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:var(--accent-color);z-index:10001;transition:width 0.15s';
    overlay.appendChild(progressBar);

    contentWrapper.appendChild(container);
    overlay.appendChild(contentWrapper);
    document.body.appendChild(overlay);
    setReadingModeOverlay(overlay);

    let tocVisible = false;
    const buildTOC = () => {
      const headings = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
      tocList.innerHTML = '';
      if (headings.length === 0) {
        tocList.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 4px">No headings found in document.</div>';
        return;
      }

      headings.forEach((h, idx) => {
        const level = parseInt(h.tagName[1]);
        const item = document.createElement('div');
        item.className = 'reading-toc-item';
        item.dataset.idx = idx;
        item.style.cssText = `padding:4px ${4 + (level - 1) * 16}px;cursor:pointer;border-radius:4px;color:var(--text-primary);transition:background 0.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${level <= 2 ? '13px' : '12px'};font-weight:${level <= 2 ? '600' : '400'};opacity:${level <= 2 ? '1' : '0.8'}`;
        item.textContent = h.textContent || 'Untitled';
        item.title = h.textContent || 'Untitled';

        item.addEventListener('click', () => {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          tocList.querySelectorAll('.reading-toc-item').forEach((el) => { el.style.background = ''; el.style.color = 'var(--text-primary)'; });
          item.style.background = 'var(--accent-color)';
          item.style.color = '#fff';
        });
        item.addEventListener('mouseenter', () => { if (item.style.background !== 'var(--accent-color)') item.style.background = 'var(--hover-bg)'; });
        item.addEventListener('mouseleave', () => { if (item.style.color !== '#fff') item.style.background = ''; });
        tocList.appendChild(item);
      });
    };
    buildTOC();

    const scrollHandler = () => {
      const scrollTop = contentWrapper.scrollTop;
      const scrollHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      progressBar.style.width = pct + '%';

      if (tocVisible) {
        const headings = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let activeIdx = 0;
        headings.forEach((h, idx) => {
          const rect = h.getBoundingClientRect();
          if (rect.top < 150) activeIdx = idx;
        });
        tocList.querySelectorAll('.reading-toc-item').forEach((el, idx) => {
          if (idx === activeIdx) {
            el.style.background = 'var(--accent-color)';
            el.style.color = '#fff';
            el.scrollIntoView({ block: 'nearest' });
          } else {
            el.style.background = '';
            el.style.color = 'var(--text-primary)';
          }
        });
      }
    };
    contentWrapper.addEventListener('scroll', scrollHandler);

    let fontSize = 18;
    let isSerif = true;
    let isSepia = false;

    toolbar.querySelector('#read-toc-toggle').addEventListener('click', () => {
      tocVisible = !tocVisible;
      tocPanel.style.display = tocVisible ? '' : 'none';
      toolbar.querySelector('#read-toc-toggle').style.background = tocVisible ? 'var(--accent-color)' : 'var(--bg-primary)';
      toolbar.querySelector('#read-toc-toggle').style.color = tocVisible ? '#fff' : 'var(--text-primary)';
      if (tocVisible) scrollHandler();
    });
    toolbar.querySelector('#read-font-up').addEventListener('click', () => {
      fontSize = Math.min(fontSize + 2, 32);
      content.style.fontSize = fontSize + 'px';
    });
    toolbar.querySelector('#read-font-down').addEventListener('click', () => {
      fontSize = Math.max(fontSize - 2, 12);
      content.style.fontSize = fontSize + 'px';
    });
    toolbar.querySelector('#read-serif-toggle').addEventListener('click', () => {
      isSerif = !isSerif;
      content.style.fontFamily = isSerif ? 'Georgia, serif' : '-apple-system, sans-serif';
    });
    toolbar.querySelector('#read-sepia').addEventListener('click', () => {
      isSepia = !isSepia;
      overlay.style.background = isSepia ? '#f5f0e8' : 'var(--bg-primary)';
      tocPanel.style.background = isSepia ? '#ede5d5' : 'var(--bg-secondary)';
      content.style.color = isSepia ? '#3e2c1c' : 'var(--text-primary)';
    });
    toolbar.querySelector('#read-close').addEventListener('click', () => toggleReadingMode());

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        toggleReadingMode();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    if (btn) btn.style.background = 'var(--accent-color)';
  } else {
    if (readingModeOverlay) {
      readingModeOverlay.remove();
      setReadingModeOverlay(null);
    }
    if (btn) btn.style.background = '';
  }
}

// ─── Multi-Column Picker ────────────────────────────────────

export function showMultiColumnPicker() {
  document.querySelector('.doc-multicol-picker')?.remove();
  const btn = document.getElementById('doc-multi-column');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.className = 'doc-multicol-picker';
  picker.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:12px;z-index:2000;display:flex;gap:10px`;

  [1, 2, 3].forEach(n => {
    const opt = document.createElement('button');
    opt.style.cssText = 'padding:12px 16px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-primary);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--text-primary);transition:border-color 0.15s,background 0.15s';
    const colVisual = Array(n).fill('<div style="width:18px;height:32px;border:1px solid var(--text-secondary);border-radius:2px;background:var(--sidebar-bg)"></div>').join('');
    opt.innerHTML = `<div style="display:flex;gap:3px">${colVisual}</div><span style="font-size:11px;font-weight:600">${n} Col${n > 1 ? 's' : ''}</span>`;
    opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--brand-color)'; opt.style.background = 'var(--hover-bg)'; });
    opt.addEventListener('mouseleave', () => { opt.style.borderColor = 'var(--border-color)'; opt.style.background = 'var(--bg-primary)'; });
    opt.addEventListener('click', () => {
      if (!editorEl) return;
      if (n === 1) {
        editorEl.style.columnCount = '';
        editorEl.style.columnGap = '';
        editorEl.style.columnRule = '';
      } else {
        editorEl.style.columnCount = n;
        editorEl.style.columnGap = '24px';
        editorEl.style.columnRule = '1px solid var(--border-color)';
      }
      picker.remove();
      setDirty(true);
    });
    picker.appendChild(opt);
  });

  document.body.appendChild(picker);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); }
    });
  }, 10);
}

// ─── Paragraph Drag Reorder ─────────────────────────────────

export function toggleParagraphDragReorder() {
  setDragReorderEnabled(!dragReorderEnabled);
  const btn = document.getElementById('doc-drag-reorder');
  if (btn) {
    btn.style.background = dragReorderEnabled ? 'var(--accent-color)' : '';
    btn.style.color = dragReorderEnabled ? '#fff' : '';
  }

  if (!editorEl) return;

  if (dragReorderEnabled) {
    applyDragHandles();
    editorEl.addEventListener('input', applyDragHandles);
  } else {
    removeDragHandles();
    editorEl.removeEventListener('input', applyDragHandles);
  }
}

function applyDragHandles() {
  if (!editorEl || !dragReorderEnabled) return;
  removeDragHandles();

  const blocks = editorEl.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > table, :scope > div:not(.doc-toc):not(.doc-footnotes):not(.doc-endnotes):not(.doc-references)');

  blocks.forEach(block => {
    block.setAttribute('draggable', 'true');
    block.classList.add('doc-draggable-block');

    block.addEventListener('dragstart', handleDragStart);
    block.addEventListener('dragover', handleDragOver);
    block.addEventListener('dragenter', handleDragEnter);
    block.addEventListener('dragleave', handleDragLeave);
    block.addEventListener('drop', handleDrop);
    block.addEventListener('dragend', handleDragEnd);
  });
}

function removeDragHandles() {
  if (!editorEl) return;
  const blocks = editorEl.querySelectorAll('.doc-draggable-block');
  blocks.forEach(block => {
    block.removeAttribute('draggable');
    block.classList.remove('doc-draggable-block', 'doc-drag-over');
    block.removeEventListener('dragstart', handleDragStart);
    block.removeEventListener('dragover', handleDragOver);
    block.removeEventListener('dragenter', handleDragEnter);
    block.removeEventListener('dragleave', handleDragLeave);
    block.removeEventListener('drop', handleDrop);
    block.removeEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  setDragSrcEl(this);
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter() {
  this.classList.add('doc-drag-over');
}

function handleDragLeave() {
  this.classList.remove('doc-drag-over');
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  if (dragSrcEl !== this) {
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      this.parentNode.insertBefore(dragSrcEl, this);
    } else {
      this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
    }
    setDirty(true);
  }
  this.classList.remove('doc-drag-over');
  return false;
}

function handleDragEnd() {
  this.style.opacity = '1';
  const blocks = editorEl?.querySelectorAll('.doc-draggable-block') || [];
  blocks.forEach(b => b.classList.remove('doc-drag-over'));
}

// ─── Smart Table Operations ─────────────────────────────────
// (showSmartTableOps, showTemplateLibrary, showCitationDialog, etc. — large UI dialogs)
// Due to file size, these are included but abbreviated. Each function's full body
// is preserved from the original doc-editor.js.

export function showSmartTableOps() {
  if (!editorEl) return;

  const tables = editorEl.querySelectorAll('table');
  if (tables.length === 0) {
    alert('No tables found in the document. Insert a table first.');
    return;
  }

  const sel = window.getSelection();
  let targetTable = null;
  if (sel && sel.rangeCount > 0) {
    const node = sel.anchorNode;
    targetTable = node?.closest?.('table') || node?.parentElement?.closest?.('table');
  }
  if (!targetTable) targetTable = tables[tables.length - 1];

  document.querySelector('.doc-tableops-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-tableops-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:440px">
      <div class="ai-setup-header">
        <h3>Smart Table Operations</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Target Table (${tables.length} table${tables.length > 1 ? 's' : ''} found)</label>
          <select id="tblops-target" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            ${Array.from(tables).map((tbl, i) => {
              const firstRow = tbl.querySelector('tr');
              const preview = firstRow ? Array.from(firstRow.cells).slice(0, 3).map(c => c.textContent.trim().substring(0, 15)).join(', ') : 'Empty';
              return `<option value="${i}" ${tbl === targetTable ? 'selected' : ''}>Table ${i + 1}: ${preview}...</option>`;
            }).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;grid-column:span 2;margin-bottom:4px">Sort</div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Column</label>
            <select id="tblops-sort-col" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)"></select>
          </div>
          <div style="display:flex;gap:4px;align-items:flex-end">
            <button id="tblops-sort-asc" class="ai-pull-btn" style="flex:1;font-size:11px">Sort A-Z</button>
            <button id="tblops-sort-desc" class="ai-pull-btn" style="flex:1;font-size:11px">Sort Z-A</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;grid-column:span 2;margin-bottom:4px">Filter Rows</div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Column</label>
            <select id="tblops-filter-col" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)"></select>
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary)">Contains</label>
            <div style="display:flex;gap:4px">
              <input id="tblops-filter-val" type="text" placeholder="keyword" style="flex:1;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
              <button id="tblops-filter-apply" class="ai-pull-btn" style="font-size:11px">Filter</button>
              <button id="tblops-filter-reset" class="ai-pull-btn" style="font-size:11px">Reset</button>
            </div>
          </div>
        </div>
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--brand-color);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Aggregate (Numeric Column)</div>
          <div style="display:flex;gap:6px;align-items:center">
            <select id="tblops-agg-col" style="flex:1;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)"></select>
            <button id="tblops-sum" class="ai-pull-btn" style="font-size:11px">Sum</button>
            <button id="tblops-avg" class="ai-pull-btn" style="font-size:11px">Average</button>
            <button id="tblops-min" class="ai-pull-btn" style="font-size:11px">Min</button>
            <button id="tblops-max" class="ai-pull-btn" style="font-size:11px">Max</button>
          </div>
          <div id="tblops-agg-result" style="margin-top:8px;font-size:13px;font-weight:600;color:var(--text-primary);min-height:20px"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  const getSelectedTable = () => tables[parseInt(dialog.querySelector('#tblops-target').value)] || tables[0];

  function populateColumns() {
    const table = getSelectedTable();
    const firstRow = table.querySelector('tr');
    if (!firstRow) return;
    const headers = Array.from(firstRow.cells).map((c, i) => ({ idx: i, label: c.textContent.trim() || `Col ${i + 1}` }));
    const optionsHtml = headers.map(h => `<option value="${h.idx}">${h.label}</option>`).join('');
    dialog.querySelector('#tblops-sort-col').innerHTML = optionsHtml;
    dialog.querySelector('#tblops-filter-col').innerHTML = optionsHtml;
    dialog.querySelector('#tblops-agg-col').innerHTML = optionsHtml;
  }
  populateColumns();
  dialog.querySelector('#tblops-target').addEventListener('change', populateColumns);

  const doSort = (asc) => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-sort-col').value);
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const aVal = a.cells[colIdx]?.textContent.trim() || '';
      const bVal = b.cells[colIdx]?.textContent.trim() || '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
      return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    rows.forEach(r => tbody.appendChild(r));
    setDirty(true);
  };
  dialog.querySelector('#tblops-sort-asc').addEventListener('click', () => doSort(true));
  dialog.querySelector('#tblops-sort-desc').addEventListener('click', () => doSort(false));

  dialog.querySelector('#tblops-filter-apply').addEventListener('click', () => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-filter-col').value);
    const keyword = dialog.querySelector('#tblops-filter-val').value.toLowerCase();
    const tbody = table.querySelector('tbody') || table;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(r => {
      const cellText = r.cells[colIdx]?.textContent.toLowerCase() || '';
      r.style.display = cellText.includes(keyword) ? '' : 'none';
    });
  });
  dialog.querySelector('#tblops-filter-reset').addEventListener('click', () => {
    const table = getSelectedTable();
    const tbody = table.querySelector('tbody') || table;
    tbody.querySelectorAll('tr').forEach(r => r.style.display = '');
    dialog.querySelector('#tblops-filter-val').value = '';
  });

  const doAggregate = (fn) => {
    const table = getSelectedTable();
    const colIdx = parseInt(dialog.querySelector('#tblops-agg-col').value);
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.style.display !== 'none');
    const values = rows.map(r => parseFloat(r.cells[colIdx]?.textContent.trim())).filter(v => !isNaN(v));
    let result = '';
    if (values.length === 0) { result = 'No numeric values found'; }
    else {
      switch (fn) {
        case 'sum': result = `Sum = ${values.reduce((a, b) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'avg': result = `Average = ${(values.reduce((a, b) => a + b, 0) / values.length).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'min': result = `Min = ${Math.min(...values).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
        case 'max': result = `Max = ${Math.max(...values).toLocaleString(undefined, { maximumFractionDigits: 4 })}`; break;
      }
    }
    dialog.querySelector('#tblops-agg-result').textContent = result;
  };
  dialog.querySelector('#tblops-sum').addEventListener('click', () => doAggregate('sum'));
  dialog.querySelector('#tblops-avg').addEventListener('click', () => doAggregate('avg'));
  dialog.querySelector('#tblops-min').addEventListener('click', () => doAggregate('min'));
  dialog.querySelector('#tblops-max').addEventListener('click', () => doAggregate('max'));
}

// The remaining huge features (templates, citations, spell check, auto-save,
// version diff, smart styles, outline nav, writing stats, page break indicators)
// are too large to include inline in this continuation. They will be re-exported
// from the orchestrator doc-editor.js which delegates to this module.

// For brevity, we export stubs that will call the original inline code from doc-editor.js.
// Actually, let's include the key ones that are called from initDocEditor:

export { showTemplateLibrary, showCitationDialog, toggleSpellCheck, initAutoSave,
  showVersionDiffDialog, showSmartStyleGallery, toggleDocOutlineNav, updateDocOutlineNav,
  showWritingStatsDialog, initPageBreakIndicators, destroyPageBreakIndicators,
  saveVersionSnapshot, getWordCount, performAutoSave };

// ─── Templates ──────────────────────────────────────────────

const DOC_TEMPLATES = {
  resume: {
    name: 'Resume / CV',
    icon: '\u{1F464}',
    content: `<h1 style="text-align:center;margin-bottom:4px">Your Name</h1>
<p style="text-align:center;color:gray;font-size:14px">your.email@example.com | (123) 456-7890 | City, State | linkedin.com/in/yourname</p>
<hr>
<h2>Professional Summary</h2>
<p>Experienced professional with a proven track record in [industry/field].</p>
<h2>Experience</h2>
<h3>Job Title \u2014 Company Name</h3>
<p style="color:gray;font-size:13px"><em>Jan 2022 \u2013 Present | City, State</em></p>
<ul><li>Led cross-functional team of 10+ members</li></ul>
<h2>Education</h2>
<h3>Degree \u2014 University Name</h3>
<p style="color:gray;font-size:13px"><em>Graduated: May 2019 | GPA: 3.8/4.0</em></p>
<h2>Skills</h2>
<p>Project Management, Data Analysis, Python, JavaScript, SQL</p>`
  },
  report: {
    name: 'Business Report',
    icon: '\u{1F4CA}',
    content: `<h1>Report Title</h1>
<p style="color:gray"><strong>Prepared by:</strong> Author Name | <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<hr>
<h2>1. Executive Summary</h2><p>Brief overview of findings.</p>
<h2>2. Introduction</h2><p>Background and context.</p>
<h2>3. Findings</h2><p>Detail the results.</p>
<h2>4. Recommendations</h2><ul><li>Recommendation 1</li></ul>
<h2>5. Conclusion</h2><p>Summary and next steps.</p>`
  },
  letter: {
    name: 'Formal Letter',
    icon: '\u2709\uFE0F',
    content: `<p style="text-align:right">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
<p><br></p>
<p><strong>Sender Name</strong><br>Address<br>City, State ZIP</p>
<p><br></p>
<p>Dear [Recipient Name],</p>
<p><br></p>
<p>I am writing to [state purpose].</p>
<p><br></p>
<p>Sincerely,</p>
<p><strong>Your Name</strong></p>`
  },
  meeting: {
    name: 'Meeting Notes',
    icon: '\u{1F4DD}',
    content: `<h1>Meeting Notes</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>Time:</strong> 10:00 AM</p>
<h2>Agenda</h2><ol><li>Review of previous items</li><li>Topic 1</li></ol>
<h2>Discussion Notes</h2><ul><li>Key point discussed</li></ul>
<h2>Action Items</h2><ul><li>Action item 1 - Owner - Due Date</li></ul>`
  },
  invoice: {
    name: 'Invoice',
    icon: '\u{1F4B0}',
    content: `<h1 style="color:var(--brand-color,#0071e3)">INVOICE</h1>
<p style="color:gray;font-size:13px">Invoice #: INV-001 | Date: ${new Date().toLocaleDateString()}</p>
<hr>
<p><strong>Bill To:</strong> Client Name</p>
<table style="width:100%"><thead><tr><th style="padding:8px 12px;border:1px solid var(--border-color)">Description</th><th style="padding:8px 12px;border:1px solid var(--border-color)">Amount</th></tr></thead>
<tbody><tr><td style="padding:8px 12px;border:1px solid var(--border-color)">Service 1</td><td style="padding:8px 12px;border:1px solid var(--border-color);text-align:right">$500.00</td></tr></tbody></table>
<p style="text-align:right;font-size:18px;font-weight:700;color:var(--brand-color)"><strong>Total:</strong> $500.00</p>`
  }
};

function showTemplateLibrary() {
  document.querySelector('.doc-template-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-template-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:560px;max-height:80vh;overflow-y:auto">
      <div class="ai-setup-header">
        <h3>Document Templates</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Choose a template to start with. Your current content will be replaced.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${Object.entries(DOC_TEMPLATES).map(([key, tpl]) => `
            <button class="doc-tpl-card" data-tpl="${key}" style="padding:16px;border:2px solid var(--border-color);border-radius:10px;background:var(--bg-primary);cursor:pointer;text-align:left;transition:border-color 0.15s,box-shadow 0.15s;color:var(--text-primary)">
              <div style="font-size:24px;margin-bottom:8px">${tpl.icon}</div>
              <div style="font-size:14px;font-weight:700">${tpl.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Click to apply this template</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelectorAll('.doc-tpl-card').forEach(card => {
    card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--brand-color)'; card.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border-color)'; card.style.boxShadow = 'none'; });
    card.addEventListener('click', () => {
      const tplKey = card.dataset.tpl;
      const tpl = DOC_TEMPLATES[tplKey];
      if (!tpl || !editorEl) return;
      if (editorEl.innerText.trim().length > 30) {
        if (!confirm('This will replace your current document content. Continue?')) return;
      }
      editorEl.innerHTML = tpl.content;
      setDirty(true);
      updateWordCount();
      dialog.remove();
    });
  });
}

// ─── Citation / Bibliography ─────────────────────────────────

let citations = [];

function showCitationDialog() {
  document.querySelector('.doc-cite-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-cite-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:520px;max-height:85vh;overflow-y:auto">
      <div class="ai-setup-header">
        <h3>Citation Manager</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border-color);padding-bottom:8px">
          <button id="cite-tab-add" class="ai-pull-btn" style="font-weight:700;background:var(--brand-color);color:#fff">Add Citation</button>
          <button id="cite-tab-list" class="ai-pull-btn">Manage (${citations.length})</button>
        </div>

        <div id="cite-add-panel">
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">Type</label>
            <select id="cite-type" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="article">Journal Article</option>
              <option value="book">Book</option>
              <option value="web">Website</option>
              <option value="conference">Conference Paper</option>
            </select>
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600">Authors</label>
            <input id="cite-authors" type="text" placeholder="e.g. Smith, J., & Doe, A." style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600">Title</label>
            <input id="cite-title" type="text" placeholder="Title of the work" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:12px;font-weight:600">Year</label>
              <input id="cite-year" type="text" placeholder="2024" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600">Source / Journal</label>
              <input id="cite-source" type="text" placeholder="Journal name or publisher" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:12px;font-weight:600">Volume / Issue</label>
              <input id="cite-volume" type="text" placeholder="12(3)" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600">Pages</label>
              <input id="cite-pages" type="text" placeholder="45-67" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
            </div>
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">URL / DOI</label>
            <input id="cite-url" type="text" placeholder="https://doi.org/..." style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600">Citation Style</label>
            <select id="cite-style" style="width:100%;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="apa">APA 7th</option>
              <option value="mla">MLA 9th</option>
              <option value="chicago">Chicago</option>
              <option value="ieee">IEEE</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="cite-insert" class="ai-pull-btn" style="background:var(--brand-color);color:#fff;font-weight:600">Insert Citation</button>
            <button id="cite-update-refs" class="ai-pull-btn">Update References</button>
          </div>
        </div>

        <div id="cite-list-panel" style="display:none">
          <div id="cite-list-items" style="margin-bottom:12px"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button id="cite-clear-all" class="ai-pull-btn" style="color:#ef4444">Clear All</button>
            <button id="cite-regenerate" class="ai-pull-btn" style="background:var(--brand-color);color:#fff">Regenerate References</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  const addPanel = dialog.querySelector('#cite-add-panel');
  const listPanel = dialog.querySelector('#cite-list-panel');

  dialog.querySelector('#cite-tab-add').addEventListener('click', () => {
    addPanel.style.display = '';
    listPanel.style.display = 'none';
    dialog.querySelector('#cite-tab-add').style.background = 'var(--brand-color)';
    dialog.querySelector('#cite-tab-add').style.color = '#fff';
    dialog.querySelector('#cite-tab-list').style.background = '';
    dialog.querySelector('#cite-tab-list').style.color = '';
  });

  dialog.querySelector('#cite-tab-list').addEventListener('click', () => {
    addPanel.style.display = 'none';
    listPanel.style.display = '';
    dialog.querySelector('#cite-tab-list').style.background = 'var(--brand-color)';
    dialog.querySelector('#cite-tab-list').style.color = '#fff';
    dialog.querySelector('#cite-tab-add').style.background = '';
    dialog.querySelector('#cite-tab-add').style.color = '';
    renderCitationList(dialog);
  });

  dialog.querySelector('#cite-insert').addEventListener('click', () => {
    const c = {
      id: 'cite-' + Date.now(),
      type: dialog.querySelector('#cite-type').value,
      authors: dialog.querySelector('#cite-authors').value.trim(),
      title: dialog.querySelector('#cite-title').value.trim(),
      year: dialog.querySelector('#cite-year').value.trim(),
      source: dialog.querySelector('#cite-source').value.trim(),
      volume: dialog.querySelector('#cite-volume').value.trim(),
      pages: dialog.querySelector('#cite-pages').value.trim(),
      url: dialog.querySelector('#cite-url').value.trim(),
    };
    if (!c.authors || !c.title) {
      alert('At least Authors and Title are required.');
      return;
    }
    citations.push(c);
    const idx = citations.length;
    const style = dialog.querySelector('#cite-style').value;
    const inlineText = formatInlineCitation(c, idx, style);
    editorEl?.focus();
    document.execCommand('insertHTML', false, `<span class="doc-cite-ref" data-cite-id="${c.id}" style="color:var(--brand-color);cursor:pointer;font-weight:500" title="${c.authors} (${c.year})">${inlineText}</span>`);
    setDirty(true);
    ['#cite-authors', '#cite-title', '#cite-year', '#cite-source', '#cite-volume', '#cite-pages', '#cite-url'].forEach(sel => {
      const el = dialog.querySelector(sel);
      if (el) el.value = '';
    });
    dialog.querySelector('#cite-tab-list').textContent = `Manage (${citations.length})`;
  });

  dialog.querySelector('#cite-update-refs').addEventListener('click', () => {
    const style = dialog.querySelector('#cite-style').value;
    updateReferencesSection(style);
    dialog.remove();
  });

  dialog.querySelector('#cite-regenerate').addEventListener('click', () => {
    const style = dialog.querySelector('#cite-style').value;
    updateReferencesSection(style);
    dialog.remove();
  });

  dialog.querySelector('#cite-clear-all').addEventListener('click', () => {
    if (!confirm('Remove all citations and references?')) return;
    editorEl?.querySelectorAll('.doc-cite-ref').forEach(el => {
      el.replaceWith(document.createTextNode(''));
    });
    editorEl?.querySelector('.doc-references')?.remove();
    citations = [];
    setDirty(true);
    dialog.remove();
  });
}

function renderCitationList(dialog) {
  const container = dialog.querySelector('#cite-list-items');
  if (!container) return;
  if (citations.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;text-align:center;padding:20px">No citations added yet.</p>';
    return;
  }
  container.innerHTML = citations.map((c, i) => `
    <div style="padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">[${i + 1}] ${c.title}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${c.authors} (${c.year})${c.source ? ' \u2014 ' + c.source : ''}</div>
      </div>
      <button class="cite-remove-btn" data-idx="${i}" style="border:none;background:none;cursor:pointer;font-size:16px;color:#ef4444;padding:4px 8px" title="Remove">\u00D7</button>
    </div>
  `).join('');

  container.querySelectorAll('.cite-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const removed = citations.splice(idx, 1)[0];
      editorEl?.querySelector(`.doc-cite-ref[data-cite-id="${removed.id}"]`)?.remove();
      setDirty(true);
      renderCitationList(dialog);
      dialog.querySelector('#cite-tab-list').textContent = `Manage (${citations.length})`;
    });
  });
}

function formatInlineCitation(c, idx, style) {
  const surname = c.authors.split(',')[0].trim();
  switch (style) {
    case 'apa': return `(${surname}, ${c.year})`;
    case 'mla': return `(${surname} ${c.pages || ''})`.replace(/ +\)/, ')');
    case 'chicago': return `(${surname} ${c.year}, ${c.pages || ''})`.replace(/, \)/, ')');
    case 'ieee': return `[${idx}]`;
    default: return `(${surname}, ${c.year})`;
  }
}

function formatFullReference(c, idx, style) {
  const a = c.authors;
  const ti = c.title;
  const y = c.year;
  const s = c.source;
  const v = c.volume;
  const p = c.pages;
  const u = c.url;

  switch (style) {
    case 'apa':
      return `${a} (${y}). ${ti}.${s ? ` <em>${s}</em>` : ''}${v ? `, <em>${v}</em>` : ''}${p ? `, ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'mla':
      return `${a}. \u201C${ti}.\u201D${s ? ` <em>${s}</em>` : ''}${v ? `, vol. ${v}` : ''}${y ? `, ${y}` : ''}${p ? `, pp. ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'chicago':
      return `${a}. \u201C${ti}.\u201D${s ? ` <em>${s}</em>` : ''}${v ? ` ${v}` : ''}${y ? ` (${y})` : ''}${p ? `: ${p}` : ''}.${u ? ` <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    case 'ieee':
      return `[${idx + 1}] ${a}, \u201C${ti},\u201D${s ? ` <em>${s}</em>` : ''}${v ? `, vol. ${v}` : ''}${p ? `, pp. ${p}` : ''}${y ? `, ${y}` : ''}.${u ? ` [Online]. Available: <a href="${u}" style="color:var(--brand-color)">${u}</a>` : ''}`;
    default:
      return `${a} (${y}). ${ti}.${s ? ` ${s}` : ''}.`;
  }
}

function updateReferencesSection(style) {
  if (!editorEl || citations.length === 0) return;

  editorEl.querySelector('.doc-references')?.remove();

  const refDiv = document.createElement('div');
  refDiv.className = 'doc-references';
  refDiv.contentEditable = 'false';
  refDiv.style.cssText = 'border-top:2px solid var(--border-color);margin-top:32px;padding-top:16px';

  const title = style === 'ieee' ? 'References' : style === 'mla' ? 'Works Cited' : style === 'chicago' ? 'Bibliography' : 'References';

  let html = `<h2 style="font-size:18px;font-weight:700;margin-bottom:16px">${title}</h2>`;
  html += '<div style="font-size:14px;line-height:1.8">';
  citations.forEach((c, i) => {
    const indent = style === 'apa' || style === 'mla' ? 'padding-left:2em;text-indent:-2em' : '';
    html += `<p style="margin-bottom:8px;${indent}">${formatFullReference(c, i, style)}</p>`;
  });
  html += '</div>';
  refDiv.innerHTML = html;

  editorEl.appendChild(refDiv);
  setDirty(true);
}

// ─── Spell Check ─────────────────────────────────────────────

let customDictionary = (() => { try { return JSON.parse(localStorage.getItem('doc-custom-dict') || '[]'); } catch { return []; } })();

const BASIC_DICT = new Set();
const COMMON_WORDS = `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further get got had has have having he her here hers herself him himself his how i if in into is it its itself just know let like make me might more most my myself no nor not now of off on once only or other our ours ourselves out over own part per put re s same she should so some still such t take than that the their theirs them themselves then there these they this those through to too under until up us very want was we were what when where which while who whom why will with would you your yours yourself yourselves able about above absent accept access accident according account across act action active actually add address admit adult advance advice affect afford after afternoon again against age ago agree ahead aim air allow almost alone along already also always amount and animal another answer any anyone anything anyway apart appear apple apply area arm army around arrive art article as ask at attack attempt attention available away baby back bad bag ball bank bar base basic basis be bear beat beautiful because become bed before begin behind believe below beside best better between big bill bit black blood blue board body bone book born both box boy brain break bring brother build burn bus business but buy by call came can capital car card care carry case catch cause central century certain chair chairman chance change character charge check child choice choose church city claim class clear close cold come common community company computer concern condition consider contain continue control cost could country county couple course court cover create cross cup current cut dark data daughter day dead deal dear death decide decision deep degree department depend describe design detail develop development die difference different difficult dinner direction discover discussion do doctor dog door down draw dream dress drink drive drop during each early east eat economic economy edge education effect egg eight either election else employee end energy enjoy enough enter environment especially european even evening event ever every everyone everything evidence exactly example exchange expect experience explain eye face fact fall family far fast father fear feel few field fight figure fill final finally financial find fine finger fish five floor fly follow food foot for force foreign forget form former forward four free friend from front full fund further future game garden general get girl give glass go god good government great green ground group grow growth gun guy hair half hand hang happen happy hard have he head health hear heart heat heavy help her here herself high him himself his hit hold home hope hot hotel hour house how however human hundred husband idea if important in include increase indeed indicate individual industry information inside instead interest into investment involve issue it item its itself job join just keep key kid kill kind king kitchen know knowledge land language large last late later law lay lead leader learn least leave left leg less let letter level lie life light like likely line list listen little live long look lord lose lot love low machine main major make man manage manager many market may maybe me mean meeting member memory mention might million mind minister minute miss model modern moment money month more morning most mother mouth move much music must my myself name nation national nature near nearly necessary need never new news next nice night no none nor north not note nothing notice now number occur of off offer office officer official often oh oil ok old on once one only open operation opportunity option or order organization other our out outside over own page pair paper parent part particular particularly party pass past patient pattern pay people per perhaps period person phone pick picture piece place plan plant play player please point police political poor popular population position possible power practice prepare present president pressure pretty price private probably problem process produce product production program project provide public pull purpose push put quality question quickly quite range rate rather reach read ready real reality realize really reason receive recent recently record red reduce reflect region relate relationship remember report represent require research resource respond rest result return right rise risk road role room rule run safe same save say school science score sea season seat second section security see seek seem sell send senior sense serious serve service set seven several shake shall shape share she shoot short should shoulder show side sign significant similar simple simply since sing single sir sister sit situation six size skill skin small smile so social society soldier some someone something sometimes son soon sort south southern space speak special specific spend spring staff stage stand standard star start state statement stay step still stock stop story strategy street strong structure student study stuff style subject success successful such suddenly suggest summer support sure surface system table take talk tax teacher team technology tell ten tend term test than thank that the their them then there these they thing think third this those though thought three through throw thus time to today together tonight too top total tough toward town trade training travel treat tree trial trip trouble truth try turn tv two type under understand unit until up us use usually value various very visit voice vote wait walk wall want war watch water way we weapon wear week weight well west western what whatever when where whether which while white who whole whom whose why wide wife will win window wish with without woman wonder word work worker world worry would write wrong yeah year yes yet young your`;
COMMON_WORDS.split(/\s+/).forEach(w => BASIC_DICT.add(w));

const EXTENDED_WORDS = `ability absolute absolutely abstract academic accept acceptable accepted access accessible according account accurate achieve achievement acknowledge acquire across actual add additional address adequate adjust administration administrative adopt advanced advantage advertising affect afternoon agency agent aggregate agree agreement ahead aid aircraft airport align alive alliance allow allowance alongside already alternative although altogether amazing amid amount analysis analyst ancient announce annual anticipate anxiety apparent apparently appeal appearance application apply appointment approach appropriate approval approve approximately archive argue argument arise arrangement array arrive aside aspect assembly assess assessment asset assign assignment assist assistance assistant associate association assume assumption atmosphere attach attempt attend attention attitude attorney attractive attribute audience author authority automatic availability avoid award aware awareness background backward balance band barrier basically bear beat bedroom behavior behind belief belong beneath benefit beside besides beyond billion bind biological blank block blow blue boat bond border bother bottom brain branch brave breast bridge brief bright brilliant broad broken brother brown budget burden burn buyer cabinet cable calculate camera camp campaign candidate capable capacity capital capture carbon careful carefully carrier carry catch category cause celebrate cell center central century ceremony chain chair chairman challenge champion championship channel chapter character characteristic charge charity chart check chief child childhood chip choice christian church cigarette citizen civilian claim classroom clean clearly client climate climb clinical clock closely closer clothes club cluster coach coalition code cognitive collapse colleague collect collection collective college colonial color column combat combination combine comedy comfort comfortable command commander comment commercial commission commit commitment committee common communicate communication community companion compare comparison compete competition competitive complaint complete completely complex complicate component compose composition comprehensive concern conclude conclusion concrete condition conduct conference confidence confirm conflict confront confusion congressional connect connection consciousness consensus consequence conservative consider considerable consideration consist consistent constant constantly constitute constitutional construct construction consultant consumer consumption contact contain container contemporary content contest context continue contract contrast contribute contribution control controversial controversy convention conventional conversation convert conviction cook core corporate correct corridor counter couple courage coverage crack craft crash crazy creature credit crew crime criminal crisis criteria critical criticism critics crop crowd crucial cry cultural culture cup curious current customer cycle daily danger dare darkness database deal dealer debate decade decide decision deck declare decline decrease deep deeply defeat defend defense defensive deficit define definitely definition degree delay deliver delivery demand democracy demonstrate department depend dependent depending deposit depress depression derive describe description desert deserve design designer desire desk despite destroy destruction detail detect determine develop developer development device devote dialogue die diet differ dimension dinner direction directly director disability disappear disaster discipline discount discourse discover discovery discrimination discuss discussion disease dismiss disorder display dispute distance distinction distinguish distribute distribution district diverse diversity divide division doctor document domestic dominant dominate door double doubt downtown dozen draft drag drama dramatic dramatically draw drawing dream dress drink drive driver drop drug dry due during dust duty each earn earning earth ease easily eastern easy eat economic economy edge edition editor education educator effect effectively efficiency effort eight either elderly election element eliminate elite elsewhere embrace emerge emergency emission emotional emphasis emphasize employ employee employer employment empty enable encounter encourage enemy energy enforcement engage engine engineer engineering enhance enjoy enormous enough ensure enter enterprise entertainment entire entirely entrance entry environment environmental episode equal equally equipment era escape especially essay essentially establish establishment estate estimate evaluate evaluation even evening eventually every everything everywhere evidence evil evolution evolve exact exactly examine example exceed excellent except exchange exciting executive exercise exhibit exhibition exist existence existing expand expansion expect expectation expense expensive experience experiment expert explain explanation explicit explicitly explore explosion export expose exposure extend extension extensive extent external extra extraordinary extreme extremely fabric facility factor failure fairly faith familiar family fan fantasy farmer fascinating fashion fast fate fault favorite federal feel fellow female fence fiction field fight fighter figure file fill final finally finance financial finding finger finish fire firm fish fit fitness fix flag flat flight float floor flow flower focus folk follow following football force foreign forest forever forget formation formula forth fortune forward found foundation founder frame framework free freedom frequently fresh friend front fruit fuel fully function fundamental funding furniture gain galaxy game garden garner gas gate gather gaze gene generally generation genetic gentleman gently genuine gift giant girlfriend given glad glance glass global gold golden gonna good grab grade gradually grand grandfather grant grass grave greatly green greet grocery gross ground guard guess guest guide guilty gun habitat half hall hand handle hanging happen happy harbor harm hat hate hay heading headquarters healthy hear hearing heart heat heavily height hell helpful hence hero herself hide highlight highly highway hire historic historical hit hold holiday honest honor hope hopefully horror hospital host hostile hotel household housing huge hurt hypothesis identification identify identity ignore ill illegal illustrate image imagination imagine immediate immediately immigrant impact implement implication imply impose impose impossible impress impression impressive improve improvement incident include income increase increasingly incredible incredibly indeed independence independent index indicate indicator individual industrial industry infant infection inflation influence inform initial initially initiative injury inner innocent innovation innovative input inquiry inside insight insist install instance instead institution institutional instruction instructor instrument insurance intellectual intelligence intend intense intention interest interested interesting internal international internet interpretation intervention interview into introduce introduction invasion investigation investigator investment investor invisible invitation involve involvement iron islamic island isolate isolation issue jacket journey joy judge judgment jump junior jury justice justify keen keeping kick killing kitchen knee knife knock label labor laboratory lack landing landscape largely laser launch lawn lawsuit lawyer layer leading league lean learning leather leave lecture left legal legislation legitimate length lesson letter liberal library lift light limit limited line link literally literary literature loan local locate location logic long loss mainly maintain major majority maker manage management manner manufacturer map margin mark massive match material math matter maximum meaning measure measurement meat mechanism media medical medication medium membership mental mention merely merely message metal method middle military mine minister minor minority minute mirror mission mixture model moderate modern modify moment monitor mood moreover mortgage mostly motion motivation mount mouse multiple murder muscle museum mutual mysterious mystery narrow naturally negotiate negotiation neighborhood nervous network nevertheless newspaper nobody nonetheless nonetheless noise nomination nonetheless norm normal normally northern nose notable noting notion novel nowhere nuclear numerous nurse nutrition object objection observation observe observer obstacle obtain obvious obviously occasion occasionally occupation occupy occurrence odd offense offensive officer official often oil ongoing online only opening operate operation operator opinion opponent opportunity opposite opposition option ordinary organic organism organization organize orientation origin otherwise ought outcome output outside overall overcome overlook overwhelming owner pace pack package page painting pair pale pan panel participate participation particular particularly partly partner passage passenger patient pattern payment peace peak peer penalty per percent percentage perception perform performance perhaps permission permit person personal personality perspective phase phenomenon philosophy photo phrase physical physician piano pile pilot pine pipe pitch place plain plan plane planet planning plate platform player pleasant please pleasure plenty plus pocket poem poet point pollution pool popular popularity portion portrait pose positive possibility possibly potential potentially pour poverty powerful practice prayer predict prefer preference pregnancy prepare presence preserve presidency president presidential pressure prevent previously primary prime principal principle print priority prison prisoner privacy private probably proceed process produce producer product production professional professor profit program project promise promote proportion proposal propose prosecutor prospect protect protection protein protest prove provider province provision psychological psychology pull punch purchase pure purple pursue qualify quarter quiet quite race racial radical rain range rapid rarely rating ratio raw reaction reading ready reality reasonable rebel recipe recognition recommend recommendation record recording recover recovery recruit red reduce reduction reflect reflection reform regard regime region regional register regular regulation reinforce reject relate relation relative relatively release relevant relief religion religious rely remark remarkable remember remind remote remove repeatedly replace reporter represent representation representative request require requirement researcher reserve resident residential resist resistance resolution resolve resort resource respond response responsibility responsible rest restore restrict restriction retain retire retirement reveal revenue review revolution rich ride rifle rise risk rival river road robot rock role romantic roof routine row rural rush sacrifice sad sadly safety salary sand satellite satisfaction satisfy save saving scale scandal scared scenario schedule scholar scholarship scope screen search seat secondary secretary section sector secure seek select selection senate senior senior sense sensitive separate sequence series seriously servant session settle settlement several severe sexual shall shape shelter shift ship shirt shoot shooting shortly shot shoulder shout shut sight silence simple simply sing singer single sister sit site size skill skin sleep slight slightly slow slowly smart smile smoke so so-called soccer social software soil soldier solid solution solve somebody somehow someone something somewhat somewhere sort soul source southern space speak specialist specific specifically spectrum speech spend spirit spiritual spokesman spot spread spring square squeeze stability stable staff stage standard star stare start station status stay steady step stick stock stomach stone stop storage storm straight strategic strategy stream street strength stress stretch strike strongly structure struggle student studio study stupid style subject submit subsequent substantial succeed sufficient sugar suggestion suitable summer summit supply supporter surely surface surgery surprised surprisingly surround surrounding survive suspect sustain sweep sweet swim swing switch symbol symptom table tail talent task tea teaching team technology telephone television temperature temporary tension territory terrorism terrorist thank the themselves theory therapy thin tired toe tone tonight tool topic total totally tough tournament toward tower trace track trade tradition traditional training transfer transform transition translate transport travel treatment tremendous trend trial trip trouble truly trust truth try typical ultimately uncle undergo understand unfortunately unfortunately union unique universe university unknown unless unlikely unusual upon urban use used user usual utility vacation valley variation variety vast vehicle version versus veteran via victim video view viewer village violence virtual virtually virtue visible vision visitor visual vital volume voluntary volunteer vulnerability wage wage wake walk wall warning wash waste wave weakness wealth weapon weather weekend welfare western whatever whom widely widespread willing wind winter wire wish withdraw within without witness wonder wonderful wooden worker workplace works workshop worried worry worth wrap writer writing yard yeah yesterday youth zone`;
EXTENDED_WORDS.split(/\s+/).forEach(w => BASIC_DICT.add(w));

function isWordInDictionary(word) {
  const lower = word.toLowerCase();
  if (BASIC_DICT.has(lower)) return true;
  if (customDictionary.includes(lower)) return true;
  if (lower.endsWith('s') && BASIC_DICT.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('ed') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('ing') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ly') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('er') && BASIC_DICT.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('est') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('tion') && BASIC_DICT.has(lower.slice(0, -4) + 'te')) return true;
  if (lower.endsWith('ment') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ness') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('able') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ful') && BASIC_DICT.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('less') && BASIC_DICT.has(lower.slice(0, -4))) return true;
  if (lower.endsWith("'s")) return isWordInDictionary(lower.slice(0, -2));
  if (lower.endsWith("n't")) return isWordInDictionary(lower.slice(0, -3));
  if (/^\d+$/.test(lower)) return true;
  if (lower.length <= 1) return true;
  return false;
}

function getSuggestions(word) {
  const lower = word.toLowerCase();
  const suggestions = [];
  const candidates = [...BASIC_DICT];

  for (const candidate of candidates) {
    if (Math.abs(candidate.length - lower.length) > 2) continue;
    const dist = editDistance(lower, candidate);
    if (dist === 1 || dist === 2) {
      suggestions.push({ word: candidate, dist });
    }
    if (suggestions.length >= 8) break;
  }

  suggestions.sort((a, b) => a.dist - b.dist);
  return suggestions.slice(0, 5).map(s => s.word);
}

function editDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function toggleSpellCheck() {
  setSpellCheckEnabled(!spellCheckEnabled);
  const btn = document.getElementById('doc-spell-check');
  if (btn) {
    btn.style.background = spellCheckEnabled ? 'var(--brand-color)' : '';
    btn.style.color = spellCheckEnabled ? '#fff' : '';
  }

  if (spellCheckEnabled) {
    runSpellCheck();
  } else {
    clearSpellCheckMarks();
  }
}

function clearSpellCheckMarks() {
  for (const mark of spellCheckMarks) {
    if (mark.parentNode) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  }
  setSpellCheckMarks([]);
}

function runSpellCheck() {
  clearSpellCheckMarks();
  if (!editorEl) return;

  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.doc-toc, .doc-footnotes, .doc-endnotes, .doc-references, .doc-equation, code, pre, .doc-spell-error')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  for (let i = textNodes.length - 1; i >= 0; i--) {
    const textNode = textNodes[i];
    const text = textNode.textContent;
    const wordRegex = /[a-zA-Z'\u2019]+/g;
    let match;
    const errors = [];

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      if (word.length < 2) continue;
      if (!isWordInDictionary(word)) {
        errors.push({ start: match.index, length: word.length, word });
      }
    }

    for (let j = errors.length - 1; j >= 0; j--) {
      const err = errors[j];
      try {
        const range = document.createRange();
        range.setStart(textNode, err.start);
        range.setEnd(textNode, err.start + err.length);

        const span = document.createElement('span');
        span.className = 'doc-spell-error';
        span.dataset.word = err.word;
        range.surroundContents(span);
        spellCheckMarks.push(span);

        span.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showSpellSuggestionMenu(span, e);
        });
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          showSpellSuggestionMenu(span, e);
        });
      } catch {
        // Ignore errors from cross-boundary ranges
      }
    }
  }
}

function showSpellSuggestionMenu(span, event) {
  document.querySelector('.doc-spell-menu')?.remove();

  const word = span.dataset.word || span.textContent;
  const suggestions = getSuggestions(word);

  const menu = document.createElement('div');
  menu.className = 'doc-spell-menu';
  menu.style.top = (event.clientY + 4) + 'px';
  menu.style.left = Math.min(event.clientX, window.innerWidth - 200) + 'px';

  let html = '';
  if (suggestions.length > 0) {
    suggestions.forEach(s => {
      html += `<button class="doc-spell-suggestion" data-word="${s}">${s}</button>`;
    });
    html += '<div class="doc-spell-divider"></div>';
  } else {
    html += '<div style="padding:6px 10px;font-size:11px;color:var(--text-tertiary)">No suggestions</div>';
    html += '<div class="doc-spell-divider"></div>';
  }
  html += `<button class="doc-spell-action" data-action="ignore">Ignore</button>`;
  html += `<button class="doc-spell-action" data-action="ignore-all">Ignore All</button>`;
  html += `<button class="doc-spell-action" data-action="add">Add to Dictionary</button>`;

  menu.innerHTML = html;
  document.body.appendChild(menu);

  menu.querySelectorAll('.doc-spell-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const replacement = btn.dataset.word;
      const textNode = document.createTextNode(replacement);
      span.parentNode.replaceChild(textNode, span);
      textNode.parentNode.normalize();
      setSpellCheckMarks(spellCheckMarks.filter(m => m !== span));
      menu.remove();
      setDirty(true);
    });
  });

  menu.querySelectorAll('.doc-spell-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'ignore') {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
        setSpellCheckMarks(spellCheckMarks.filter(m => m !== span));
      } else if (action === 'ignore-all') {
        const targetWord = word.toLowerCase();
        [...spellCheckMarks].forEach(mark => {
          if (mark.textContent.toLowerCase() === targetWord && mark.parentNode) {
            const p = mark.parentNode;
            p.replaceChild(document.createTextNode(mark.textContent), mark);
            p.normalize();
          }
        });
        setSpellCheckMarks(spellCheckMarks.filter(m => m.parentNode));
        customDictionary.push(targetWord);
      } else if (action === 'add') {
        const targetWord = word.toLowerCase();
        customDictionary.push(targetWord);
        localStorage.setItem('doc-custom-dict', JSON.stringify(customDictionary));
        [...spellCheckMarks].forEach(mark => {
          if (mark.textContent.toLowerCase() === targetWord && mark.parentNode) {
            const p = mark.parentNode;
            p.replaceChild(document.createTextNode(mark.textContent), mark);
            p.normalize();
          }
        });
        setSpellCheckMarks(spellCheckMarks.filter(m => m.parentNode));
      }
      menu.remove();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 10);
}

// ─── Auto-Save ──────────────────────────────────────────────

function initAutoSave() {
  const savedContent = localStorage.getItem(AUTO_SAVE_KEY);
  const savedTimestamp = localStorage.getItem(AUTO_SAVE_TS_KEY);
  if (savedContent && editorEl) {
    const currentContent = editorEl.innerHTML.trim();
    const defaultContent = '<h1>Untitled Document</h1>\n            <p>Start typing here...</p>';
    if (savedContent !== currentContent && savedContent !== defaultContent && currentContent.length < 100) {
      const ts = savedTimestamp ? new Date(parseInt(savedTimestamp)).toLocaleString() : 'unknown time';
      showAutoSaveRecoveryDialog(savedContent, ts);
    }
  }

  setAutoSaveInterval(setInterval(() => {
    if (editorEl && dirty) {
      performAutoSave();
    }
  }, AUTO_SAVE_INTERVAL_MS));

  setVisibilityHandler(() => {
    if (document.visibilityState === 'hidden' && editorEl && dirty) {
      performAutoSave();
    }
  });
  document.addEventListener('visibilitychange', _visibilityHandler);
}

function performAutoSave() {
  if (!editorEl) return;
  const content = editorEl.innerHTML;
  localStorage.setItem(AUTO_SAVE_KEY, content);
  localStorage.setItem(AUTO_SAVE_TS_KEY, String(Date.now()));
  updateAutoSaveIndicator();
}

function updateAutoSaveIndicator() {
  const statusBar = document.getElementById('doc-status-bar');
  if (!statusBar) return;
  let indicator = document.getElementById('doc-autosave-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'doc-autosave-indicator';
    indicator.style.cssText = 'margin-left:12px;color:var(--text-tertiary);font-size:11px;transition:opacity 0.3s';
    statusBar.appendChild(indicator);
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  indicator.textContent = `${t('doc.autoSaved')} ${timeStr}`;
  indicator.style.opacity = '1';
  setTimeout(() => { if (indicator) indicator.style.opacity = '0.6'; }, 3000);
}

function showAutoSaveRecoveryDialog(savedContent, timestamp) {
  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:450px">
      <h3 style="margin:0 0 8px;display:flex;align-items:center;gap:8px">Recovery Available</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px">
        Unsaved work was found from <strong>${timestamp}</strong>.<br>
        Would you like to recover it?
      </p>
      <div id="recovery-preview" style="max-height:150px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;padding:8px;font-size:12px;color:var(--text-secondary);margin-bottom:12px;background:var(--sidebar-bg)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="recovery-discard" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px">Discard</button>
        <button id="recovery-restore" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Recover</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  const previewEl = dlg.querySelector('#recovery-preview');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = savedContent;
  previewEl.textContent = tempDiv.textContent.substring(0, 500) + (tempDiv.textContent.length > 500 ? '...' : '');

  dlg.querySelector('#recovery-restore').addEventListener('click', () => {
    if (editorEl) {
      editorEl.innerHTML = savedContent;
      setDirty(true);
      updateWordCount();
      if (outlineVisible) updateDocOutline();
    }
    dlg.remove();
  });

  dlg.querySelector('#recovery-discard').addEventListener('click', () => {
    localStorage.removeItem(AUTO_SAVE_KEY);
    localStorage.removeItem(AUTO_SAVE_TS_KEY);
    dlg.remove();
  });
}

// ─── Version Diff ───────────────────────────────────────────

function showVersionDiffDialog() {
  document.querySelector('.doc-version-diff-dialog')?.remove();
  let versionHistory;
  try { versionHistory = JSON.parse(localStorage.getItem('doc-version-history') || '[]'); } catch { versionHistory = []; }

  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay doc-version-diff-dialog';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:95vw;width:960px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px">Version Compare / Diff</h3>
        <button id="vdiff-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-secondary)">&times;</button>
      </div>
      <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <label style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Compare with</label>
          <select id="vdiff-source" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);margin-top:4px">
            <option value="paste">Paste / Upload text</option>
            ${versionHistory.map((v, i) => `<option value="v-${i}">Version ${i + 1} -- ${new Date(v.timestamp).toLocaleString()}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <button id="vdiff-upload" class="toolbar-btn" style="padding:4px 12px;font-size:12px">Upload File</button>
          <input type="file" id="vdiff-file-input" accept=".txt,.html,.htm,.md" style="display:none">
          <button id="vdiff-run" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Compare</button>
        </div>
      </div>
      <div id="vdiff-paste-area" style="padding:8px 20px;border-bottom:1px solid var(--border-color)">
        <textarea id="vdiff-input" style="width:100%;height:80px;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);resize:vertical;box-sizing:border-box" placeholder="Paste comparison text here..."></textarea>
      </div>
      <div id="vdiff-stats" style="padding:8px 20px;border-bottom:1px solid var(--border-color);font-size:12px;color:var(--text-secondary);display:none">
        <span class="vdiff-stat-additions" style="background:#d4edda;padding:2px 8px;border-radius:4px;margin-right:8px">0 additions</span>
        <span class="vdiff-stat-deletions" style="background:#f8d7da;padding:2px 8px;border-radius:4px;margin-right:8px">0 deletions</span>
        <span class="vdiff-stat-modifications" style="background:#fff3cd;padding:2px 8px;border-radius:4px">0 modifications</span>
      </div>
      <div id="vdiff-result" style="flex:1;overflow:auto;display:none">
        <div style="display:flex;height:100%;min-height:300px">
          <div id="vdiff-left" class="vdiff-pane" style="flex:1;overflow:auto;padding:16px;border-right:1px solid var(--border-color)">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Current Document</div>
            <div id="vdiff-left-content" style="font-size:13px;line-height:1.8"></div>
          </div>
          <div id="vdiff-right" class="vdiff-pane" style="flex:1;overflow:auto;padding:16px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Previous Version</div>
            <div id="vdiff-right-content" style="font-size:13px;line-height:1.8"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  const sourceSelect = dlg.querySelector('#vdiff-source');
  const pasteArea = dlg.querySelector('#vdiff-paste-area');
  const fileInput = dlg.querySelector('#vdiff-file-input');

  sourceSelect.addEventListener('change', () => {
    pasteArea.style.display = sourceSelect.value === 'paste' ? '' : 'none';
    if (sourceSelect.value.startsWith('v-')) {
      const idx = parseInt(sourceSelect.value.split('-')[1]);
      dlg.querySelector('#vdiff-input').value = versionHistory[idx]?.content || '';
    }
  });

  dlg.querySelector('#vdiff-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) {
      dlg.querySelector('#vdiff-input').value = await file.text();
    }
  });

  dlg.querySelector('#vdiff-close').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#vdiff-run').addEventListener('click', () => {
    const compareText = dlg.querySelector('#vdiff-input').value;
    if (!compareText.trim()) return;

    const currentText = editorEl?.innerText || '';
    const currentLines = currentText.split('\n').filter(l => l.trim());
    const compareLines = compareText.split('\n').filter(l => l.trim());

    const diff = computeLineDiff(currentLines, compareLines);

    let leftHtml = '', rightHtml = '';
    let additions = 0, deletions = 0, modifications = 0;

    diff.forEach(d => {
      if (d.type === 'same') {
        leftHtml += `<div class="vdiff-line vdiff-same">${escapeHtml(d.left)}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-same">${escapeHtml(d.right)}</div>`;
      } else if (d.type === 'add') {
        leftHtml += `<div class="vdiff-line vdiff-empty">&nbsp;</div>`;
        rightHtml += `<div class="vdiff-line vdiff-addition">${escapeHtml(d.right)}</div>`;
        additions++;
      } else if (d.type === 'remove') {
        leftHtml += `<div class="vdiff-line vdiff-deletion">${escapeHtml(d.left)}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-empty">&nbsp;</div>`;
        deletions++;
      } else if (d.type === 'modify') {
        leftHtml += `<div class="vdiff-line vdiff-modification">${highlightWordChanges(d.left, d.right, 'old')}</div>`;
        rightHtml += `<div class="vdiff-line vdiff-modification">${highlightWordChanges(d.left, d.right, 'new')}</div>`;
        modifications++;
      }
    });

    dlg.querySelector('#vdiff-left-content').innerHTML = leftHtml;
    dlg.querySelector('#vdiff-right-content').innerHTML = rightHtml;
    dlg.querySelector('#vdiff-result').style.display = '';
    dlg.querySelector('#vdiff-stats').style.display = '';
    dlg.querySelector('.vdiff-stat-additions').textContent = `${additions} ${t('doc.additions')}`;
    dlg.querySelector('.vdiff-stat-deletions').textContent = `${deletions} ${t('doc.deletions')}`;
    dlg.querySelector('.vdiff-stat-modifications').textContent = `${modifications} ${t('doc.modifications')}`;

    const leftPane = dlg.querySelector('#vdiff-left');
    const rightPane = dlg.querySelector('#vdiff-right');
    let syncing = false;
    leftPane.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      rightPane.scrollTop = leftPane.scrollTop;
      syncing = false;
    });
    rightPane.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      leftPane.scrollTop = rightPane.scrollTop;
      syncing = false;
    });
  });
}

function computeLineDiff(currentLines, compareLines) {
  const result = [];
  const m = currentLines.length;
  const n = compareLines.length;

  if (m * n > 25000000) {
    const cSet = new Set(currentLines);
    const pSet = new Set(compareLines);
    currentLines.forEach(l => {
      if (pSet.has(l)) result.push({ type: 'same', left: l, right: l });
      else result.push({ type: 'remove', left: l, right: '' });
    });
    compareLines.forEach(l => {
      if (!cSet.has(l)) result.push({ type: 'add', left: '', right: l });
    });
    return result;
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = currentLines[i - 1] === compareLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = m, j = n;
  const parts = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentLines[i - 1] === compareLines[j - 1]) {
      parts.unshift({ type: 'same', left: currentLines[i - 1], right: compareLines[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      if (i > 0 && dp[i - 1][j - 1] >= dp[i][j - 1] - 1) {
        const similarity = computeSimilarity(currentLines[i - 1], compareLines[j - 1]);
        if (similarity > 0.4) {
          parts.unshift({ type: 'modify', left: currentLines[i - 1], right: compareLines[j - 1] });
          i--; j--;
          continue;
        }
      }
      parts.unshift({ type: 'add', left: '', right: compareLines[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'remove', left: currentLines[i - 1], right: '' });
      i--;
    }
  }

  return parts;
}

function computeSimilarity(a, b) {
  if (!a || !b) return 0;
  const aWords = a.split(/\s+/);
  const bWords = new Set(b.split(/\s+/));
  let common = 0;
  aWords.forEach(w => { if (bWords.has(w)) common++; });
  return common / Math.max(aWords.length, bWords.size);
}

function highlightWordChanges(oldLine, newLine, side) {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  const oldSet = new Set(oldWords.filter(w => w.trim()));
  const newSet = new Set(newWords.filter(w => w.trim()));

  if (side === 'old') {
    return oldWords.map(w => {
      if (!w.trim()) return escapeHtml(w);
      return newSet.has(w) ? escapeHtml(w) : `<span class="vdiff-word-del">${escapeHtml(w)}</span>`;
    }).join('');
  } else {
    return newWords.map(w => {
      if (!w.trim()) return escapeHtml(w);
      return oldSet.has(w) ? escapeHtml(w) : `<span class="vdiff-word-add">${escapeHtml(w)}</span>`;
    }).join('');
  }
}

// ─── Smart Styles Gallery ───────────────────────────────────

const SMART_STYLES = [
  { name: 'Title', tag: 'h1', css: 'font-size:32px;font-weight:800;color:var(--text-primary);margin:0 0 4px;line-height:1.2;letter-spacing:-0.5px', preview: 'Title' },
  { name: 'Subtitle', tag: 'p', css: 'font-size:20px;font-weight:300;color:var(--text-secondary);margin:0 0 20px;line-height:1.4', preview: 'Subtitle text' },
  { name: 'Abstract', tag: 'div', css: 'font-size:14px;font-style:italic;color:var(--text-secondary);padding:16px 24px;margin:16px 0;border:1px solid var(--border-color);border-radius:8px;background:var(--sidebar-bg);line-height:1.7', preview: 'Abstract paragraph...' },
  { name: 'Block Quote', tag: 'blockquote', css: 'font-size:16px;font-style:italic;color:#555;border-left:4px solid var(--brand-color,#0071e3);padding:12px 20px;margin:16px 0;background:rgba(0,113,227,0.04);border-radius:0 8px 8px 0;line-height:1.7', preview: 'Quoted text...' },
  { name: 'Code Block', tag: 'pre', css: 'font-family:"SF Mono","Fira Code",monospace;font-size:13px;background:#1e1e2e;color:#cdd6f4;padding:16px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;margin:16px 0;line-height:1.5;overflow-x:auto', preview: 'code { ... }' },
  { name: 'Caption', tag: 'p', css: 'font-size:12px;color:var(--text-tertiary);text-align:center;font-style:italic;margin:4px 0 20px;line-height:1.5', preview: 'Figure 1: Caption text' },
  { name: 'List Paragraph', tag: 'div', css: 'font-size:15px;line-height:1.8;padding-left:24px;margin:8px 0;border-left:2px solid var(--border-color)', preview: 'Indented list paragraph' },
  { name: 'Heading 1', tag: 'h1', css: 'font-size:26px;font-weight:700;color:var(--brand-color,#0071e3);border-bottom:2px solid var(--brand-color,#0071e3);padding-bottom:6px;margin:28px 0 12px', preview: 'Heading 1' },
  { name: 'Heading 2', tag: 'h2', css: 'font-size:22px;font-weight:600;color:var(--text-primary);margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border-color)', preview: 'Heading 2' },
  { name: 'Heading 3', tag: 'h3', css: 'font-size:18px;font-weight:600;color:var(--text-primary);margin:20px 0 6px', preview: 'Heading 3' },
  { name: 'Lead Paragraph', tag: 'p', css: 'font-size:18px;font-weight:300;color:#444;line-height:1.8;margin:12px 0', preview: 'Lead paragraph text...' },
  { name: 'Highlight Box', tag: 'div', css: 'background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Important note...' },
  { name: 'Info Box', tag: 'div', css: 'background:#e3f2fd;border:1px solid #2196f3;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Information...' },
  { name: 'Success Box', tag: 'div', css: 'background:#e8f5e9;border:1px solid #4caf50;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Success message...' },
  { name: 'Danger Box', tag: 'div', css: 'background:#ffebee;border:1px solid #f44336;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.6', preview: 'Warning/danger...' },
];

const CUSTOM_STYLES_KEY = 'doc-custom-styles';

function getCustomStyles() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_STYLES_KEY) || '[]'); } catch { return []; }
}

function saveCustomStyles(styles) {
  localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(styles));
}

function showSmartStyleGallery() {
  document.querySelector('.doc-smart-style-gallery')?.remove();

  const btn = document.getElementById('doc-smart-styles');
  const rect = btn?.getBoundingClientRect() || { bottom: 100, left: 100 };
  const customStyles = getCustomStyles();

  const gallery = document.createElement('div');
  gallery.className = 'doc-smart-style-gallery';
  gallery.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 380)}px;width:360px;max-height:500px;overflow-y:auto;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:2000;padding:0`;

  let html = `<div style="padding:12px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:700;font-size:14px;color:var(--text-primary)">Smart Styles</span>
    <button id="ssg-add-custom" style="border:none;background:var(--brand-color);color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600">+ Custom</button>
  </div>
  <div style="padding:8px">`;

  SMART_STYLES.forEach((s, i) => {
    const previewCss = s.css.replace(/font-size:\d+px/, 'font-size:13px').replace(/margin:[^;]+/g, 'margin:0').replace(/padding:[^;]+/g, 'padding:4px 8px');
    html += `<div class="ssg-item" data-idx="${i}" style="cursor:pointer;border-radius:6px;margin-bottom:2px;padding:6px 10px;transition:background 0.15s">
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">${s.name}</div>
      <div style="${previewCss};max-height:24px;overflow:hidden;pointer-events:none;border-radius:4px">${s.preview}</div>
    </div>`;
  });

  if (customStyles.length > 0) {
    html += `<div style="border-top:1px solid var(--border-color);margin:8px 0;padding-top:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;padding:0 10px">Custom Styles</div>`;
    customStyles.forEach((cs, i) => {
      const previewCss = cs.css.replace(/font-size:\d+px/, 'font-size:13px').replace(/margin:[^;]+/g, 'margin:0').replace(/padding:[^;]+/g, 'padding:4px 8px');
      html += `<div class="ssg-item ssg-custom" data-custom-idx="${i}" style="cursor:pointer;border-radius:6px;margin-bottom:2px;padding:6px 10px;transition:background 0.15s;display:flex;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">${cs.name}</div>
          <div style="${previewCss};max-height:24px;overflow:hidden;pointer-events:none;border-radius:4px">${cs.name}</div>
        </div>
        <button class="ssg-delete-custom" data-cidx="${i}" style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px;padding:4px" title="Delete">&times;</button>
      </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  gallery.innerHTML = html;
  document.body.appendChild(gallery);

  gallery.querySelectorAll('.ssg-item:not(.ssg-custom)').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      applySmartStyle(SMART_STYLES[idx]);
      gallery.remove();
    });
  });

  gallery.querySelectorAll('.ssg-custom').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', (e) => {
      if (e.target.closest('.ssg-delete-custom')) return;
      const idx = parseInt(item.dataset.customIdx);
      if (customStyles[idx]) applySmartStyle(customStyles[idx]);
      gallery.remove();
    });
  });

  gallery.querySelectorAll('.ssg-delete-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.cidx);
      customStyles.splice(idx, 1);
      saveCustomStyles(customStyles);
      gallery.remove();
      showSmartStyleGallery();
    });
  });

  gallery.querySelector('#ssg-add-custom').addEventListener('click', (e) => {
    e.stopPropagation();
    gallery.remove();
    showCustomStyleEditor();
  });

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!gallery.contains(e.target) && e.target !== btn) {
        gallery.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

function applySmartStyle(style) {
  editorEl?.focus();
  const placeholder = style.name === 'Code Block' ? 'code here...' : 'Type here...';
  const html = `<${style.tag} style="${style.css}">${placeholder}</${style.tag}>`;
  document.execCommand('insertHTML', false, html);
  setDirty(true);
}

function showCustomStyleEditor() {
  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:420px">
      <h3 style="margin:0 0 12px">Create Custom Style</h3>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Style Name</label>
        <input id="cs-name" type="text" placeholder="e.g. My Heading" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Font Family</label>
          <select id="cs-font" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="inherit">Default</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="monospace">Monospace</option>
            <option value="Georgia,serif">Georgia</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Font Size (px)</label>
          <input id="cs-size" type="number" value="16" min="8" max="72" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary);box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Text Color</label>
          <input id="cs-color" type="color" value="#333333" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">BG Color</label>
          <input id="cs-bg" type="color" value="#ffffff" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Border</label>
          <input id="cs-border" type="color" value="#cccccc" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:6px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Line Height</label>
          <select id="cs-lh" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="1.2">1.2</option><option value="1.5">1.5</option><option value="1.6" selected>1.6</option><option value="1.8">1.8</option><option value="2.0">2.0</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Element</label>
          <select id="cs-tag" style="width:100%;padding:6px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="div">Block (div)</option><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Blockquote</option><option value="pre">Preformatted</option>
          </select>
        </div>
      </div>
      <div id="cs-preview" style="border:1px solid var(--border-color);border-radius:6px;padding:12px;margin-bottom:12px;min-height:40px">
        <div id="cs-preview-text">Preview text</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="cs-cancel" style="padding:6px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px">Cancel</button>
        <button id="cs-save" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Save Style</button>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  const buildCustomCSS = () => {
    const font = dlg.querySelector('#cs-font').value;
    const size = dlg.querySelector('#cs-size').value;
    const color = dlg.querySelector('#cs-color').value;
    const bg = dlg.querySelector('#cs-bg').value;
    const border = dlg.querySelector('#cs-border').value;
    const lh = dlg.querySelector('#cs-lh').value;
    let css = `font-family:${font};font-size:${size}px;color:${color};line-height:${lh};padding:8px;margin:12px 0`;
    if (bg !== '#ffffff') css += `;background:${bg};border-radius:8px`;
    if (border !== '#cccccc') css += `;border:1px solid ${border}`;
    return css;
  };

  const updatePreview = () => {
    const previewText = dlg.querySelector('#cs-preview-text');
    previewText.style.cssText = buildCustomCSS();
    previewText.textContent = dlg.querySelector('#cs-name').value || 'Preview text';
  };

  dlg.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });
  updatePreview();

  dlg.querySelector('#cs-cancel').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#cs-save').addEventListener('click', () => {
    const name = dlg.querySelector('#cs-name').value.trim();
    if (!name) { alert('Please enter a style name'); return; }
    const tag = dlg.querySelector('#cs-tag').value;
    const css = buildCustomCSS();
    const customs = getCustomStyles();
    customs.push({ name, tag, css, preview: name });
    saveCustomStyles(customs);
    dlg.remove();
  });
}

// ─── Document Outline Navigator ─────────────────────────────

function toggleDocOutlineNav() {
  const panel = document.getElementById('doc-outline-nav-panel');
  if (!panel) return;
  setOutlineNavVisible(!outlineNavVisible);
  panel.classList.toggle('hidden', !outlineNavVisible);
  if (outlineNavVisible) updateDocOutlineNav();
}

function updateDocOutlineNav() {
  const list = document.getElementById('doc-outline-nav-list');
  if (!list || !editorEl) return;

  const headings = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (!headings.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:12px;text-align:center">No headings found.<br>Add headings (H1-H6) to see<br>the document structure.</div>';
    return;
  }

  list.innerHTML = '';
  headings.forEach((h, idx) => {
    const level = parseInt(h.tagName[1]);
    if (!h.id) h.id = `outline-nav-h-${idx}`;

    const item = document.createElement('div');
    item.className = 'doc-outline-nav-item';
    item.dataset.level = level;
    item.dataset.idx = idx;
    item.innerHTML = `<span class="outline-nav-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.textContent || 'Untitled'}</span>`;

    item.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origBg = h.style.background;
      h.style.background = 'rgba(59, 130, 246, 0.15)';
      h.style.borderRadius = '4px';
      h.style.transition = 'background 0.3s';
      setTimeout(() => { h.style.background = origBg; h.style.borderRadius = ''; }, 2000);
      list.querySelectorAll('.doc-outline-nav-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
    });

    list.appendChild(item);
  });
}

// ─── Writing Stats Dialog ───────────────────────────────────

export function updateWritingStreak() {
  const streakData = JSON.parse(localStorage.getItem(WRITING_STREAK_KEY) || '{"dates":[],"currentStreak":0,"bestStreak":0}');
  const today = new Date().toISOString().slice(0, 10);

  if (!streakData.dates.includes(today)) {
    streakData.dates.push(today);

    const sorted = [...new Set(streakData.dates)].sort().reverse();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (prev - curr) / (1000 * 60 * 60 * 24);
      if (diff === 1) streak++;
      else break;
    }
    streakData.currentStreak = streak;
    if (streak > (streakData.bestStreak || 0)) streakData.bestStreak = streak;

    localStorage.setItem(WRITING_STREAK_KEY, JSON.stringify(streakData));
  }

  return streakData;
}

function showWritingStatsDialog() {
  document.querySelector('.doc-writing-stats-dialog')?.remove();

  const text = editorEl?.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const streakData = updateWritingStreak();

  const sessionDuration = Math.round((Date.now() - sessionStartTime) / 1000);
  const sessionMinutes = Math.max(1, Math.round(sessionDuration / 60));
  const sessionWords = Math.max(0, words - sessionWordCountStart);
  const wpm = sessionMinutes > 0 ? Math.round(sessionWords / sessionMinutes) : 0;

  let totalEditTime = parseInt(localStorage.getItem('doc-total-edit-time') || '0');
  totalEditTime += sessionDuration;
  localStorage.setItem('doc-total-edit-time', String(totalEditTime));

  const totalHours = Math.floor(totalEditTime / 3600);
  const totalMins = Math.floor((totalEditTime % 3600) / 60);

  const goalPct = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  const dlg = document.createElement('div');
  dlg.className = 'doc-dialog-overlay doc-writing-stats-dialog';
  dlg.innerHTML = `
    <div class="doc-dialog" style="max-width:480px;padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px">Writing Stats & Goals</h3>
        <button id="ws-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-secondary)">&times;</button>
      </div>
      <div style="padding:16px 20px">
        ${wordGoal > 0 ? `
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Word Goal Progress</span>
            <span style="font-size:14px;font-weight:700;color:${goalPct >= 100 ? '#34a853' : 'var(--brand-color)'}">${goalPct}%</span>
          </div>
          <div style="height:8px;background:var(--border-color);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${goalPct}%;background:${goalPct >= 100 ? '#34a853' : 'var(--brand-color)'};border-radius:4px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${words.toLocaleString()} / ${wordGoal.toLocaleString()} words ${goalPct >= 100 ? '-- Goal reached!' : `-- ${(wordGoal - words).toLocaleString()} to go`}</div>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.currentStreak}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Day Streak</div>
          </div>
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.bestStreak || streakData.currentStreak}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Best Streak</div>
          </div>
          <div style="background:var(--sidebar-bg);border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text-primary)">${streakData.dates.length}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Days Active</div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">This Session</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Duration</span><span style="font-weight:600">${sessionMinutes} min</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Words written</span><span style="font-weight:600">${sessionWords.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Words/min</span><span style="font-weight:600">${wpm}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Total words</span><span style="font-weight:600">${words.toLocaleString()}</span></div>
          </div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">All-Time</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-secondary)">Total editing time</span><span style="font-weight:600">${totalHours > 0 ? `${totalHours}h ` : ''}${totalMins}m</span></div>
        </div>

        <div style="border-top:1px solid var(--border-color);padding-top:12px">
          <div style="display:flex;gap:8px;align-items:center">
            <label style="font-size:12px;font-weight:600;white-space:nowrap">Set word goal:</label>
            <input id="ws-goal-input" type="number" value="${wordGoal || ''}" placeholder="e.g. 1000" min="0" style="flex:1;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-primary);color:var(--text-primary)">
            <button id="ws-goal-set" style="padding:5px 12px;border:none;border-radius:6px;background:var(--brand-color);color:#fff;cursor:pointer;font-size:12px;font-weight:600">Set</button>
            ${wordGoal > 0 ? `<button id="ws-goal-clear" style="padding:5px 12px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px">Clear</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(dlg);

  dlg.querySelector('#ws-close').addEventListener('click', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });

  dlg.querySelector('#ws-goal-set').addEventListener('click', () => {
    setWordGoal(parseInt(dlg.querySelector('#ws-goal-input').value) || 0);
    updateWordCount();
    dlg.remove();
  });

  dlg.querySelector('#ws-goal-clear')?.addEventListener('click', () => {
    setWordGoal(0);
    updateWordCount();
    dlg.remove();
  });
}

// ─── Page Break Indicators ──────────────────────────────────

const A4_HEIGHT_PX = 1122;

function updatePageBreakIndicators() {
  if (!editorEl) return;
  editorEl.querySelectorAll('.doc-page-break-indicator').forEach((el) => el.remove());

  const editorHeight = editorEl.scrollHeight;
  if (editorHeight <= A4_HEIGHT_PX) return;

  const pageCount = Math.floor(editorHeight / A4_HEIGHT_PX);
  for (let i = 1; i <= pageCount; i++) {
    const yPos = i * A4_HEIGHT_PX;
    const indicator = document.createElement('div');
    indicator.className = 'doc-page-break-indicator';
    indicator.contentEditable = 'false';
    indicator.setAttribute('data-page', String(i));
    indicator.style.cssText = `position:absolute;left:0;right:0;top:${yPos}px;height:0;border-top:2px dashed var(--border-color,#ccc);pointer-events:none;user-select:none;z-index:5;`;
    const label = document.createElement('span');
    label.style.cssText = 'position:absolute;right:8px;top:-10px;font-size:9px;color:var(--text-tertiary,#999);background:var(--bg-primary,#fff);padding:0 4px;line-height:1;';
    label.textContent = `Page ${i} / ${i + 1}`;
    indicator.appendChild(label);
    editorEl.appendChild(indicator);
  }
}

function initPageBreakIndicators() {
  if (!editorEl) return;
  editorEl.style.position = 'relative';

  const debouncedUpdate = () => {
    clearTimeout(pageBreakDebounceTimer);
    setPageBreakDebounceTimer(setTimeout(() => updatePageBreakIndicators(), 500));
  };

  setPageBreakObserver(new MutationObserver(debouncedUpdate));
  pageBreakObserver.observe(editorEl, { childList: true, subtree: true, characterData: true });

  _addHandler(window, 'resize', debouncedUpdate);

  updatePageBreakIndicators();
}

function destroyPageBreakIndicators() {
  if (pageBreakObserver) {
    pageBreakObserver.disconnect();
    setPageBreakObserver(null);
  }
  clearTimeout(pageBreakDebounceTimer);
  editorEl?.querySelectorAll('.doc-page-break-indicator').forEach((el) => el.remove());
}

// ─── Version Snapshot ───────────────────────────────────────

function saveVersionSnapshot() {
  if (!editorEl) return;
  let history;
  try { history = JSON.parse(localStorage.getItem('doc-version-history') || '[]'); } catch { history = []; }
  history.push({
    content: editorEl.innerText,
    html: editorEl.innerHTML,
    timestamp: Date.now(),
    wordCount: getWordCount()
  });
  if (history.length > 20) history.splice(0, history.length - 20);
  try { localStorage.setItem('doc-version-history', JSON.stringify(history)); } catch { /* quota exceeded */ }
}

function getWordCount() {
  if (!editorEl) return 0;
  const text = editorEl.innerText || '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
