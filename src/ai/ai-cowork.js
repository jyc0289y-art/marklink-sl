// OfficeLink SL — AI Co-work Module
// Deep AI integration for each editor: Document, Sheet, Slide, Markdown, PDF, Photo
// Uses Ollama local LLM via ollama-client.js

import { chat, streamChat, checkOllamaStatus, listModels } from './ollama-client.js';

// ─── State ───────────────────────────────────────────────
let ollamaOk = false;
let selectedModel = '';
let activeOverlay = null; // currently visible AI overlay element
let currentAbortController = null; // for cancelling streaming

// ─── Per-editor Prompt Templates ─────────────────────────
const EDITOR_PROMPT_TEMPLATES = {
  document: [
    { id: 'proofread', label: 'Proofread', icon: '✓', prompt: 'Proofread the following text. Fix grammar, spelling, and punctuation errors. Return only the corrected text.' },
    { id: 'expand', label: 'Expand', icon: '📐', prompt: 'Expand the following text with more detail, examples, and elaboration while keeping the same tone. Return only the expanded text.' },
    { id: 'summarize', label: 'Summarize', icon: '📋', prompt: 'Summarize the following text into clear, concise key points. Return only the summary.' },
  ],
  sheet: [
    { id: 'formula', label: 'Suggest Formula', icon: '=', prompt: 'You are a spreadsheet formula expert. Generate an Excel-compatible formula for the user\'s description. Return ONLY the formula starting with =, nothing else.' },
    { id: 'chart', label: 'Chart Advice', icon: '📊', prompt: 'Based on this spreadsheet data, recommend the best chart type and explain why. Describe axes, labels, and any data transformations needed. Be concise.' },
  ],
  slide: [
    { id: 'outline', label: 'Create Outline', icon: '📑', prompt: 'Create a presentation outline with slide titles and 3-4 bullet points per slide. Format with "Slide N: Title" headers.' },
    { id: 'notes', label: 'Speaker Notes', icon: '🎤', prompt: 'Write speaker notes for this slide content. 2-3 sentences per point to help the presenter explain clearly.' },
  ],
  markdown: [
    { id: 'format', label: 'Format & Clean', icon: '✨', prompt: 'Clean up and reformat this markdown. Fix headings, lists, links, and code blocks. Improve readability. Return only the reformatted markdown.' },
    { id: 'document', label: 'Document It', icon: '📝', prompt: 'Generate proper documentation for this content in markdown. Add section headings, descriptions, and formatting. Return only the documentation.' },
  ],
  photo: [
    { id: 'describe', label: 'Describe Image', icon: '🔍', prompt: 'Generate a detailed description of this image including composition, colors, subjects, mood, and technical quality. Suitable for accessibility alt text.' },
    { id: 'caption', label: 'Generate Caption', icon: '📝', prompt: 'Generate 3 caption options: 1) Short (under 10 words), 2) Medium (1-2 sentences), 3) Detailed description.' },
  ],
  pdf: [
    { id: 'summarize', label: 'Summarize PDF', icon: '📋', prompt: 'Summarize this PDF document. Provide: 1) Main topic/purpose 2) Key points (5-7 bullets) 3) Conclusions.' },
    { id: 'extract', label: 'Extract Data', icon: '📊', prompt: 'Extract structured data from this PDF text. Look for tables, lists, key-value pairs, dates, numbers, names. Format as markdown.' },
  ],
  calculator: [
    { id: 'explain', label: 'Explain Calculation', icon: '🔍', prompt: 'Explain this mathematical calculation step by step. Describe what each operation does and the final result.' },
    { id: 'check', label: 'Check Work', icon: '✓', prompt: 'Verify this calculation. Check for errors, confirm the result, and suggest any simplifications.' },
  ],
};

// ─── Chat History Persistence per Editor ─────────────────
const COWORK_HISTORY_KEY = 'marklink-cowork-history';

const getCoworkHistory = (editorType) => {
  try {
    const all = JSON.parse(localStorage.getItem(COWORK_HISTORY_KEY) || '{}');
    return all[editorType] || [];
  } catch { return []; }
};

const saveCoworkHistory = (editorType, history) => {
  try {
    const all = JSON.parse(localStorage.getItem(COWORK_HISTORY_KEY) || '{}');
    all[editorType] = history.slice(-50); // keep last 50 entries
    localStorage.setItem(COWORK_HISTORY_KEY, JSON.stringify(all));
  } catch { /* silent */ }
};

const addToCoworkHistory = (editorType, role, content) => {
  const hist = getCoworkHistory(editorType);
  hist.push({ role, content: content.substring(0, 500), ts: Date.now() });
  saveCoworkHistory(editorType, hist);
};

/** Export prompt templates for external use */
export { EDITOR_PROMPT_TEMPLATES };

// ─── Init / Status ──────────────────────────────────────
async function ensureReady() {
  if (!ollamaOk) {
    const s = await checkOllamaStatus();
    ollamaOk = s.running;
  }
  if (!selectedModel) {
    selectedModel = localStorage.getItem('marklink-ai-model') || '';
    if (!selectedModel && ollamaOk) {
      const models = await listModels();
      if (models.length > 0) selectedModel = models[0].name;
    }
  }
  return ollamaOk && !!selectedModel;
}

// ─── Helpers ─────────────────────────────────────────────

function showToast(msg, duration = 3000) {
  const el = document.createElement('div');
  el.className = 'ai-cowork-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, duration);
}

function removeOverlay() {
  if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
}

/** Single-shot AI call (non-streaming for simplicity in inline features) */
async function aiCall(systemPrompt, userContent) {
  const ready = await ensureReady();
  if (!ready) { showToast('AI unavailable — check Ollama is running'); return null; }
  try {
    const result = await chat(selectedModel, [{ role: 'user', content: userContent }], systemPrompt, null);
    return result.content;
  } catch (e) {
    showToast('AI error: ' + e.message);
    return null;
  }
}

/** Streaming AI call — shows tokens as they arrive in a target element */
async function aiCallStreaming(systemPrompt, userContent, targetEl, editorType) {
  const ready = await ensureReady();
  if (!ready) { showToast('AI unavailable — check Ollama is running'); return null; }

  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();

  if (editorType) addToCoworkHistory(editorType, 'user', userContent);

  targetEl.innerHTML = '<span class="ai-cowork-spinner"></span> ';
  targetEl.classList.add('ai-streaming');

  try {
    const result = await streamChat(
      selectedModel,
      [{ role: 'user', content: userContent }],
      systemPrompt,
      (token, full) => {
        targetEl.innerHTML = escapeHtml(full) + '<span class="ai-stream-cursor">|</span>';
      },
      currentAbortController.signal
    );

    targetEl.classList.remove('ai-streaming');
    targetEl.innerHTML = escapeHtml(result.content);

    if (result.tokenStats) {
      const statsSpan = document.createElement('div');
      statsSpan.className = 'ai-cowork-token-stats';
      statsSpan.textContent = `${result.tokenStats.promptTokens + result.tokenStats.completionTokens} tokens · ${result.tokenStats.totalDurationMs}ms`;
      targetEl.appendChild(statsSpan);
    }

    if (editorType) addToCoworkHistory(editorType, 'assistant', result.content);

    currentAbortController = null;
    return result.content;
  } catch (e) {
    targetEl.classList.remove('ai-streaming');
    if (e.name === 'AbortError') {
      targetEl.innerHTML += '<br><em style="color:var(--text-secondary)">(cancelled)</em>';
      return null;
    }
    showToast('AI error: ' + e.message);
    return null;
  }
}

/** Create an "Apply suggestion" button that inserts AI response at cursor */
function createApplyButton(content, targetEditorEl) {
  const btn = document.createElement('button');
  btn.className = 'ai-cowork-btn accent small';
  btn.textContent = 'Apply to Editor';
  btn.addEventListener('click', () => {
    if (targetEditorEl) {
      // Try to insert at cursor
      targetEditorEl.focus();
      if (targetEditorEl.tagName === 'TEXTAREA' || targetEditorEl.tagName === 'INPUT') {
        const start = targetEditorEl.selectionStart;
        const end = targetEditorEl.selectionEnd;
        const val = targetEditorEl.value;
        targetEditorEl.value = val.substring(0, start) + content + val.substring(end);
        targetEditorEl.selectionStart = targetEditorEl.selectionEnd = start + content.length;
        targetEditorEl.dispatchEvent(new Event('input'));
      } else {
        // contentEditable
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const frag = document.createRange().createContextualFragment(content.replace(/\n/g, '<br>'));
          range.insertNode(frag);
        } else {
          document.execCommand('insertHTML', false, content.replace(/\n/g, '<br>'));
        }
      }
      showToast('AI suggestion applied');
    } else {
      navigator.clipboard.writeText(content).then(() => showToast('Copied to clipboard'));
    }
  });
  return btn;
}

/** Show a loading spinner overlay anchored near pos */
function showLoading(anchorEl) {
  removeOverlay();
  const el = document.createElement('div');
  el.className = 'ai-cowork-loading';
  el.innerHTML = '<span class="ai-cowork-spinner"></span> AI is thinking...';
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.top = (rect.bottom + 4) + 'px';
    el.style.left = rect.left + 'px';
  }
  document.body.appendChild(el);
  activeOverlay = el;
  return el;
}

/** Show diff approval overlay with streaming support */
function showDiffApproval(original, result, onAccept, onReject, anchorEl, streamMode = false) {
  removeOverlay();
  const el = document.createElement('div');
  el.className = 'ai-cowork-diff';
  const bodyId = 'ai-diff-body-' + Date.now();
  el.innerHTML = `
    <div class="ai-cowork-diff-header">AI Result${streamMode ? ' <span class="ai-stream-badge">STREAMING</span>' : ''}</div>
    <div class="ai-cowork-diff-body" id="${bodyId}">${streamMode ? '<span class="ai-cowork-spinner"></span>' : escapeHtml(result)}</div>
    <div class="ai-cowork-diff-actions">
      <button class="ai-cowork-btn accept">Accept</button>
      <button class="ai-cowork-btn reject">Reject</button>
      <button class="ai-cowork-btn copy">Copy</button>
      ${streamMode ? '<button class="ai-cowork-btn" style="color:#f44336;border-color:#f44336" id="ai-stop-stream">Stop</button>' : ''}
    </div>`;
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.top = Math.min(rect.bottom + 4, window.innerHeight - 300) + 'px';
    el.style.left = Math.max(8, rect.left) + 'px';
  } else {
    el.style.position = 'fixed';
    el.style.top = '50%'; el.style.left = '50%';
    el.style.transform = 'translate(-50%, -50%)';
  }
  document.body.appendChild(el);
  activeOverlay = el;

  el.querySelector('.accept').addEventListener('click', () => { removeOverlay(); onAccept(result); });
  el.querySelector('.reject').addEventListener('click', () => { removeOverlay(); if (onReject) onReject(); });
  el.querySelector('.copy').addEventListener('click', () => {
    const bodyEl = el.querySelector('.ai-cowork-diff-body');
    const textToCopy = bodyEl ? bodyEl.textContent : result;
    navigator.clipboard.writeText(textToCopy).then(() => showToast('Copied to clipboard'));
  });
  el.querySelector('#ai-stop-stream')?.addEventListener('click', () => {
    if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
  });

  // Return body element ref for streaming updates
  el._bodyEl = el.querySelector(`#${bodyId}`);
  return el;
}

/** Show a panel dialog (for multi-field AI features) */
function showAiPanel(title, bodyHtml, onSubmit) {
  removeOverlay();
  const el = document.createElement('div');
  el.className = 'ai-cowork-panel-overlay';
  el.innerHTML = `
    <div class="ai-cowork-panel">
      <div class="ai-cowork-panel-header">
        <span>${title}</span>
        <button class="ai-cowork-panel-close">&times;</button>
      </div>
      <div class="ai-cowork-panel-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(el);
  activeOverlay = el;

  el.querySelector('.ai-cowork-panel-close').addEventListener('click', () => removeOverlay());
  el.addEventListener('click', (e) => { if (e.target === el) removeOverlay(); });

  if (onSubmit) onSubmit(el);
  return el;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}


// ═══════════════════════════════════════════════════════════════
// 1. DOCUMENT AI ASSISTANT — Context Menu
// ═══════════════════════════════════════════════════════════════

export function initDocAiContextMenu() {
  const editorEl = document.getElementById('doc-editor');
  if (!editorEl) return;

  editorEl.addEventListener('contextmenu', (e) => {
    // Remove any previous AI context menu
    document.querySelectorAll('.ai-ctx-menu').forEach((m) => m.remove());

    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().trim().length > 0;
    const selectedText = hasSelection ? sel.toString() : '';

    const menu = document.createElement('div');
    menu.className = 'ai-ctx-menu';
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';

    const items = [];
    if (hasSelection) {
      items.push({ label: 'AI: Improve writing', icon: '✨', action: () => docAiAction('improve', selectedText, editorEl) });
      items.push({ label: 'AI: Make shorter', icon: '📏', action: () => docAiAction('shorter', selectedText, editorEl) });
      items.push({ label: 'AI: Make longer', icon: '📐', action: () => docAiAction('longer', selectedText, editorEl) });
      items.push({ label: 'AI: Fix grammar', icon: '✓', action: () => docAiAction('grammar', selectedText, editorEl) });
      items.push({ label: 'AI: Change tone...', icon: '🎭', submenu: [
        { label: 'Formal', action: () => docAiAction('tone-formal', selectedText, editorEl) },
        { label: 'Casual', action: () => docAiAction('tone-casual', selectedText, editorEl) },
        { label: 'Professional', action: () => docAiAction('tone-professional', selectedText, editorEl) },
        { label: 'Friendly', action: () => docAiAction('tone-friendly', selectedText, editorEl) },
      ]});
      items.push({ label: 'AI: Translate to...', icon: '🌐', submenu: [
        { label: 'English', action: () => docAiAction('translate-English', selectedText, editorEl) },
        { label: 'Korean', action: () => docAiAction('translate-Korean', selectedText, editorEl) },
        { label: 'Japanese', action: () => docAiAction('translate-Japanese', selectedText, editorEl) },
        { label: 'Chinese', action: () => docAiAction('translate-Chinese', selectedText, editorEl) },
        { label: 'Spanish', action: () => docAiAction('translate-Spanish', selectedText, editorEl) },
        { label: 'French', action: () => docAiAction('translate-French', selectedText, editorEl) },
        { label: 'German', action: () => docAiAction('translate-German', selectedText, editorEl) },
      ]});
      items.push({ label: 'AI: Summarize', icon: '📋', action: () => docAiAction('summarize', selectedText, editorEl) });
    }
    items.push({ label: 'AI: Continue writing', icon: '➡', action: () => docAiContinue(editorEl) });
    if (!hasSelection) {
      items.push({ label: 'AI: Summarize document', icon: '📋', action: () => {
        const text = editorEl.innerText || '';
        docAiAction('summarize', text.substring(0, 5000), editorEl);
      }});
    }

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'ai-ctx-item';
      row.innerHTML = `<span class="ai-ctx-icon">${item.icon}</span> ${item.label}`;

      if (item.submenu) {
        row.classList.add('has-submenu');
        const sub = document.createElement('div');
        sub.className = 'ai-ctx-submenu';
        item.submenu.forEach((si) => {
          const subItem = document.createElement('div');
          subItem.className = 'ai-ctx-item';
          subItem.textContent = si.label;
          subItem.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); si.action(); });
          sub.appendChild(subItem);
        });
        row.appendChild(sub);
      } else {
        row.addEventListener('click', () => { menu.remove(); item.action(); });
      }
      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    // Close on click outside
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
    e.preventDefault();
  });
}

const DOC_PROMPTS = {
  improve: 'Rewrite the following text to improve clarity, flow, and readability. Return only the improved text, nothing else.',
  shorter: 'Condense the following text to be significantly shorter while keeping the key points. Return only the shortened text.',
  longer: 'Expand the following text with more detail, examples, and elaboration. Return only the expanded text.',
  grammar: 'Fix all grammar and spelling errors in the following text. Return only the corrected text.',
  'tone-formal': 'Rewrite in a formal, academic tone. Return only the rewritten text.',
  'tone-casual': 'Rewrite in a casual, conversational tone. Return only the rewritten text.',
  'tone-professional': 'Rewrite in a professional business tone. Return only the rewritten text.',
  'tone-friendly': 'Rewrite in a warm, friendly tone. Return only the rewritten text.',
  summarize: 'Summarize the following text into key points. Return only the summary.',
};

async function docAiAction(action, text, anchorEl) {
  const loading = showLoading(anchorEl);
  let prompt;

  if (action.startsWith('translate-')) {
    const lang = action.replace('translate-', '');
    prompt = `Translate the following text to ${lang}. Return only the translation, nothing else.`;
  } else {
    prompt = DOC_PROMPTS[action] || 'Process the following text:';
  }

  const result = await aiCall(prompt, text);
  removeOverlay();
  if (!result) return;

  showDiffApproval(text, result, (accepted) => {
    // Replace selection in document editor
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createRange().createContextualFragment(accepted.replace(/\n/g, '<br>'));
      range.insertNode(frag);
    } else {
      document.execCommand('insertHTML', false, accepted.replace(/\n/g, '<br>'));
    }
  }, null, anchorEl);
}

async function docAiContinue(editorEl) {
  const text = editorEl.innerText || '';
  const lastPart = text.slice(-1500);
  const loading = showLoading(editorEl);

  const result = await aiCall(
    'Continue writing from where the text ends. Match the style, tone, and topic. Return only the continuation text, do not repeat what was given.',
    lastPart
  );
  removeOverlay();
  if (!result) return;

  showDiffApproval('', result, (accepted) => {
    editorEl.focus();
    // Move cursor to end
    const sel = window.getSelection();
    sel.selectAllChildren(editorEl);
    sel.collapseToEnd();
    document.execCommand('insertHTML', false, '<br>' + accepted.replace(/\n/g, '<br>'));
  }, null, editorEl);
}


// ═══════════════════════════════════════════════════════════════
// 2. SHEET AI FORMULA HELPER
// ═══════════════════════════════════════════════════════════════

export function initSheetAi() {
  // Add AI button to formula bar area
  const formulaBar = document.getElementById('sheet-formula-bar');
  if (!formulaBar) return;

  const aiBtn = document.createElement('button');
  aiBtn.id = 'sheet-ai-btn';
  aiBtn.className = 'ai-cowork-toolbar-btn';
  aiBtn.innerHTML = '✦ AI';
  aiBtn.title = 'AI Formula & Data Helper';
  aiBtn.addEventListener('click', () => showSheetAiPanel());
  formulaBar.parentElement?.insertBefore(aiBtn, formulaBar.nextSibling);
}

function showSheetAiPanel() {
  const html = `
    <div class="ai-cowork-tabs">
      <button class="ai-cowork-tab active" data-tab="formula">Suggest Formula</button>
      <button class="ai-cowork-tab" data-tab="explain">Explain Formula</button>
      <button class="ai-cowork-tab" data-tab="generate">Generate Data</button>
      <button class="ai-cowork-tab" data-tab="analyze">Analyze Data</button>
    </div>
    <div class="ai-cowork-tab-content" data-content="formula">
      <label>Describe what formula you need:</label>
      <textarea id="ai-sheet-formula-desc" rows="3" placeholder="e.g., Sum of column B where column A is 'Sales'"></textarea>
      <button class="ai-cowork-btn accent" id="ai-sheet-formula-go">Generate Formula</button>
      <div id="ai-sheet-formula-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="explain">
      <label>Enter or paste a formula:</label>
      <input id="ai-sheet-explain-input" placeholder="e.g., =VLOOKUP(A2,B:C,2,FALSE)">
      <button class="ai-cowork-btn accent" id="ai-sheet-explain-go">Explain</button>
      <div id="ai-sheet-explain-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="generate">
      <label>Describe the data pattern:</label>
      <textarea id="ai-sheet-gen-desc" rows="3" placeholder="e.g., 10 sample customer records with name, email, phone, city"></textarea>
      <button class="ai-cowork-btn accent" id="ai-sheet-gen-go">Generate Data</button>
      <div id="ai-sheet-gen-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="analyze">
      <label>Paste data or describe what to analyze:</label>
      <textarea id="ai-sheet-analyze-desc" rows="3" placeholder="Select cells in the sheet first, then click Analyze"></textarea>
      <button class="ai-cowork-btn accent" id="ai-sheet-analyze-go">Analyze</button>
      <div id="ai-sheet-analyze-result" class="ai-cowork-result"></div>
    </div>`;

  const panel = showAiPanel('Sheet AI Helper', html, (el) => {
    // Tab switching
    el.querySelectorAll('.ai-cowork-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.ai-cowork-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        el.querySelectorAll('.ai-cowork-tab-content').forEach((c) => c.classList.add('hidden'));
        el.querySelector(`[data-content="${tab.dataset.tab}"]`)?.classList.remove('hidden');
      });
    });

    // Formula suggest
    el.querySelector('#ai-sheet-formula-go')?.addEventListener('click', async () => {
      const desc = el.querySelector('#ai-sheet-formula-desc')?.value;
      if (!desc) return;
      const resultEl = el.querySelector('#ai-sheet-formula-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Generating...';
      const result = await aiCall(
        'You are a spreadsheet formula expert. Generate an Excel-compatible formula for the user\'s description. Return ONLY the formula starting with =, nothing else. No explanation.',
        desc
      );
      if (result) {
        resultEl.innerHTML = `<code class="ai-formula-code">${escapeHtml(result.trim())}</code>
          <button class="ai-cowork-btn small copy-formula">Copy</button>
          <button class="ai-cowork-btn small insert-formula">Insert to Cell</button>`;
        resultEl.querySelector('.copy-formula')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result.trim());
          showToast('Formula copied');
        });
        resultEl.querySelector('.insert-formula')?.addEventListener('click', () => {
          const bar = document.getElementById('sheet-formula-bar');
          if (bar) { bar.value = result.trim(); bar.focus(); bar.dispatchEvent(new Event('input')); }
          removeOverlay();
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed to generate formula.</span>';
      }
    });

    // Explain formula
    el.querySelector('#ai-sheet-explain-go')?.addEventListener('click', async () => {
      const formula = el.querySelector('#ai-sheet-explain-input')?.value;
      if (!formula) return;
      const resultEl = el.querySelector('#ai-sheet-explain-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Analyzing...';
      const result = await aiCall(
        'Explain this spreadsheet formula in simple terms. Break down each part. Be concise.',
        formula
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });

    // Generate data
    el.querySelector('#ai-sheet-gen-go')?.addEventListener('click', async () => {
      const desc = el.querySelector('#ai-sheet-gen-desc')?.value;
      if (!desc) return;
      const resultEl = el.querySelector('#ai-sheet-gen-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Generating data...';
      const result = await aiCall(
        'Generate sample spreadsheet data as CSV. First row = headers. Use comma delimiter. Return ONLY the CSV data, nothing else.',
        desc
      );
      if (result) {
        resultEl.innerHTML = `<pre class="ai-data-preview">${escapeHtml(result.trim())}</pre>
          <button class="ai-cowork-btn small insert-csv">Insert into Sheet</button>
          <button class="ai-cowork-btn small copy-formula">Copy CSV</button>`;
        resultEl.querySelector('.insert-csv')?.addEventListener('click', () => {
          insertCsvIntoSheet(result.trim());
          removeOverlay();
          showToast('Data inserted into sheet');
        });
        resultEl.querySelector('.copy-formula')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result.trim());
          showToast('CSV copied');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Analyze data
    el.querySelector('#ai-sheet-analyze-go')?.addEventListener('click', async () => {
      const descEl = el.querySelector('#ai-sheet-analyze-desc');
      let data = descEl?.value || '';
      // Try to get selected cells from sheet
      if (!data.trim()) {
        data = getSheetSelectionText();
      }
      if (!data.trim()) { showToast('No data to analyze. Select cells or paste data.'); return; }
      const resultEl = el.querySelector('#ai-sheet-analyze-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Analyzing...';
      const result = await aiCall(
        'Analyze this spreadsheet data. Provide: 1) Statistical summary (count, mean, min, max for numeric columns) 2) Key insights and patterns 3) Data quality issues if any. Be concise.',
        data
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });
  });
}

/** Get text representation of selected cells */
function getSheetSelectionText() {
  // Read cell content from visible grid
  const grid = document.getElementById('sheet-grid');
  if (!grid) return '';
  const rows = grid.querySelectorAll('tr');
  const lines = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td, th');
    const vals = [];
    cells.forEach((c) => vals.push(c.textContent.trim()));
    if (vals.some((v) => v)) lines.push(vals.join('\t'));
  });
  return lines.join('\n').substring(0, 5000);
}

/** Insert CSV data into the sheet starting from selected cell */
function insertCsvIntoSheet(csv) {
  const lines = csv.split('\n').filter((l) => l.trim());
  const grid = document.getElementById('sheet-grid');
  if (!grid) return;

  // Find the formula bar and simulate cell editing
  const bar = document.getElementById('sheet-formula-bar');

  lines.forEach((line, ri) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    cols.forEach((val, ci) => {
      // Click on cell to select it, then set value
      const row = grid.querySelector(`tr:nth-child(${ri + 2})`); // skip header
      if (row) {
        const cell = row.querySelector(`td:nth-child(${ci + 2})`); // skip row header
        if (cell) {
          cell.click();
          if (bar) {
            bar.value = val;
            bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          }
        }
      }
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// 3. SLIDE AI CONTENT GENERATOR
// ═══════════════════════════════════════════════════════════════

export function initSlideAi() {
  // Add AI buttons to slide toolbar
  const toolbar = document.querySelector('.slide-toolbar') || document.querySelector('#slide-container .toolbar');
  if (!toolbar) {
    // Create floating AI button on slide editor
    const container = document.getElementById('slide-container');
    if (!container) return;
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-fab';
    btn.id = 'slide-ai-fab';
    btn.innerHTML = '✦';
    btn.title = 'AI Slide Assistant';
    btn.addEventListener('click', () => showSlideAiPanel());
    container.appendChild(btn);
    return;
  }

  const btn = document.createElement('button');
  btn.className = 'ai-cowork-toolbar-btn';
  btn.innerHTML = '✦ AI';
  btn.title = 'AI Slide Assistant';
  btn.addEventListener('click', () => showSlideAiPanel());
  toolbar.appendChild(btn);
}

function showSlideAiPanel() {
  const html = `
    <div class="ai-cowork-tabs">
      <button class="ai-cowork-tab active" data-tab="content">Generate Content</button>
      <button class="ai-cowork-tab" data-tab="notes">Speaker Notes</button>
      <button class="ai-cowork-tab" data-tab="design">Suggest Design</button>
      <button class="ai-cowork-tab" data-tab="outline">Create Outline</button>
    </div>
    <div class="ai-cowork-tab-content" data-content="content">
      <label>Describe the slide topic:</label>
      <textarea id="ai-slide-content-desc" rows="3" placeholder="e.g., Benefits of renewable energy"></textarea>
      <button class="ai-cowork-btn accent" id="ai-slide-content-go">Generate</button>
      <div id="ai-slide-content-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="notes">
      <p style="font-size:12px;color:var(--text-secondary)">Generates speaker notes based on current slide content.</p>
      <button class="ai-cowork-btn accent" id="ai-slide-notes-go">Generate Notes</button>
      <div id="ai-slide-notes-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="design">
      <p style="font-size:12px;color:var(--text-secondary)">AI will suggest layout and color scheme based on content.</p>
      <button class="ai-cowork-btn accent" id="ai-slide-design-go">Get Suggestions</button>
      <div id="ai-slide-design-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="outline">
      <label>Describe the presentation topic:</label>
      <textarea id="ai-slide-outline-desc" rows="3" placeholder="e.g., Quarterly business review for Q1 2026"></textarea>
      <label>Number of slides:</label>
      <input id="ai-slide-outline-count" type="number" value="5" min="3" max="20" style="width:60px">
      <button class="ai-cowork-btn accent" id="ai-slide-outline-go">Create Outline</button>
      <div id="ai-slide-outline-result" class="ai-cowork-result"></div>
    </div>`;

  showAiPanel('Slide AI Assistant', html, (el) => {
    // Tab switching
    el.querySelectorAll('.ai-cowork-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.ai-cowork-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        el.querySelectorAll('.ai-cowork-tab-content').forEach((c) => c.classList.add('hidden'));
        el.querySelector(`[data-content="${tab.dataset.tab}"]`)?.classList.remove('hidden');
      });
    });

    // Generate slide content
    el.querySelector('#ai-slide-content-go')?.addEventListener('click', async () => {
      const desc = el.querySelector('#ai-slide-content-desc')?.value;
      if (!desc) return;
      const resultEl = el.querySelector('#ai-slide-content-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Generating...';
      const result = await aiCall(
        'Generate slide content in HTML format. Include an h2 title and a ul with 4-6 bullet points. Return ONLY the HTML, no explanation.',
        `Create slide content about: ${desc}`
      );
      if (result) {
        resultEl.innerHTML = `<div class="ai-slide-preview">${result}</div>
          <button class="ai-cowork-btn small insert-slide">Insert into Slide</button>`;
        resultEl.querySelector('.insert-slide')?.addEventListener('click', () => {
          const canvas = document.getElementById('slide-canvas');
          if (canvas) { canvas.innerHTML = result; canvas.dispatchEvent(new Event('input')); }
          removeOverlay();
          showToast('Content inserted into slide');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Speaker notes
    el.querySelector('#ai-slide-notes-go')?.addEventListener('click', async () => {
      const canvas = document.getElementById('slide-canvas');
      const content = canvas?.innerText || '';
      if (!content.trim()) { showToast('Slide is empty'); return; }
      const resultEl = el.querySelector('#ai-slide-notes-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Generating notes...';
      const result = await aiCall(
        'Write speaker notes for this slide. The notes should help the presenter explain each point. 2-3 sentences per bullet point. Return only the notes text.',
        content
      );
      if (result) {
        resultEl.innerHTML = `<div class="ai-notes-preview">${escapeHtml(result)}</div>
          <button class="ai-cowork-btn small insert-notes">Insert as Speaker Notes</button>`;
        resultEl.querySelector('.insert-notes')?.addEventListener('click', () => {
          const notesEl = document.getElementById('slide-notes');
          if (notesEl) {
            if (notesEl.tagName === 'TEXTAREA') notesEl.value = result;
            else notesEl.innerHTML = result.replace(/\n/g, '<br>');
            notesEl.dispatchEvent(new Event('input'));
          }
          removeOverlay();
          showToast('Speaker notes inserted');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Design suggestions
    el.querySelector('#ai-slide-design-go')?.addEventListener('click', async () => {
      const canvas = document.getElementById('slide-canvas');
      const content = canvas?.innerText || '';
      const resultEl = el.querySelector('#ai-slide-design-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Analyzing...';
      const result = await aiCall(
        'Based on the slide content, suggest: 1) Best layout type (title, content, two-column, comparison, quote, big-number) 2) Color scheme (2-3 colors with hex codes) 3) Font pairing suggestion 4) Visual elements to add. Be concise and actionable.',
        content || 'Empty slide — suggest a general professional design'
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });

    // Create outline
    el.querySelector('#ai-slide-outline-go')?.addEventListener('click', async () => {
      const desc = el.querySelector('#ai-slide-outline-desc')?.value;
      const count = el.querySelector('#ai-slide-outline-count')?.value || 5;
      if (!desc) return;
      const resultEl = el.querySelector('#ai-slide-outline-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Creating outline...';
      const result = await aiCall(
        `Create a presentation outline with exactly ${count} slides. For each slide, provide:
- Slide number
- Title
- 3-4 bullet points
Format as structured text with "Slide N: Title" headers.`,
        desc
      );
      if (result) {
        resultEl.innerHTML = `<pre class="ai-outline-preview">${escapeHtml(result)}</pre>
          <button class="ai-cowork-btn small apply-outline">Apply (Create All Slides)</button>`;
        resultEl.querySelector('.apply-outline')?.addEventListener('click', () => {
          applySlideOutline(result);
          removeOverlay();
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });
  });
}

function applySlideOutline(outlineText) {
  // Parse outline and create slides
  const slideAddBtn = document.getElementById('slide-add');
  const canvas = document.getElementById('slide-canvas');
  if (!slideAddBtn || !canvas) return;

  const slides = outlineText.split(/Slide\s+\d+[\s:.]*/i).filter((s) => s.trim());
  slides.forEach((slideText, i) => {
    if (i > 0) slideAddBtn.click(); // add new slide

    const lines = slideText.trim().split('\n').filter((l) => l.trim());
    const title = lines[0]?.replace(/^[\-\*#]+\s*/, '').trim() || `Slide ${i + 1}`;
    const bullets = lines.slice(1).map((l) => l.replace(/^[\-\*•]\s*/, '').trim()).filter((l) => l);

    const html = `<h2>${title}</h2><ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`;
    setTimeout(() => {
      canvas.innerHTML = html;
      canvas.dispatchEvent(new Event('input'));
    }, 100 * i);
  });

  showToast(`Created ${slides.length} slides from outline`);
}


// ═══════════════════════════════════════════════════════════════
// 4. MARKDOWN AI WRITING
// ═══════════════════════════════════════════════════════════════

export function initMarkdownAi(getContentFn, setContentFn, updatePreviewFn) {
  // Store references for AI actions
  window._mdAi = { getContent: getContentFn, setContent: setContentFn, updatePreview: updatePreviewFn };

  // Add AI toolbar buttons to markdown toolbar
  const toolbar = document.querySelector('.md-toolbar') || document.querySelector('#editor-pane .toolbar');

  // We'll use the existing /ai slash command in autocomplete
  // Add AI button to status bar area
  const statusBar = document.querySelector('.md-status-bar') || document.querySelector('#editor-pane .status-bar');
  if (statusBar) {
    const aiBtn = document.createElement('button');
    aiBtn.className = 'ai-cowork-toolbar-btn small';
    aiBtn.innerHTML = '✦ AI';
    aiBtn.title = 'Markdown AI Assistant';
    aiBtn.addEventListener('click', () => showMarkdownAiPanel());
    statusBar.appendChild(aiBtn);
  }
}

/** Additional slash commands for AI - to be added to the SLASH_COMMANDS array */
export const AI_SLASH_COMMANDS = [
  { name: 'AI: Continue', icon: '✦', text: '__AI_CONTINUE__', isAi: true },
  { name: 'AI: Summarize', icon: '✦', text: '__AI_SUMMARIZE__', isAi: true },
  { name: 'AI: Table of Contents', icon: '✦', text: '__AI_TOC__', isAi: true },
  { name: 'AI: Explain Code', icon: '✦', text: '__AI_CODE_EXPLAIN__', isAi: true },
];

/** Handle AI slash commands when selected from autocomplete */
export async function handleAiSlashCommand(command) {
  const { getContent, setContent, updatePreview } = window._mdAi || {};
  if (!getContent) return false;

  const content = getContent();

  if (command === '__AI_CONTINUE__') {
    await mdAiContinue(content, setContent, updatePreview);
    return true;
  }
  if (command === '__AI_SUMMARIZE__') {
    await mdAiSummarize(content, setContent, updatePreview);
    return true;
  }
  if (command === '__AI_TOC__') {
    await mdAiToc(content, setContent, updatePreview);
    return true;
  }
  if (command === '__AI_CODE_EXPLAIN__') {
    await mdAiCodeExplain(content, setContent, updatePreview);
    return true;
  }
  return false;
}

function showMarkdownAiPanel() {
  const templates = EDITOR_PROMPT_TEMPLATES.markdown || [];
  const historyItems = getCoworkHistory('markdown');
  const html = `
    <div class="ai-cowork-md-actions">
      <button class="ai-cowork-btn accent wide" id="ai-md-continue">➡ Continue Writing</button>
      <button class="ai-cowork-btn accent wide" id="ai-md-summarize">📋 Summarize</button>
      <button class="ai-cowork-btn accent wide" id="ai-md-toc">📑 Generate TOC</button>
      <button class="ai-cowork-btn accent wide" id="ai-md-code">💻 Explain Code</button>
      ${templates.map((t) => `<button class="ai-cowork-btn wide ai-tpl-btn" data-tpl="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div id="ai-md-result" class="ai-cowork-result" style="margin-top:12px"></div>
    ${historyItems.length > 0 ? `
    <details style="margin-top:12px">
      <summary style="font-size:11px;color:var(--text-secondary);cursor:pointer">Recent AI History (${historyItems.length})</summary>
      <div class="ai-cowork-history-list">${historyItems.slice(-10).reverse().map((h) =>
        `<div class="ai-cowork-history-item"><span class="ai-hist-role">${h.role}</span> ${escapeHtml(h.content.substring(0, 80))}...</div>`
      ).join('')}</div>
    </details>` : ''}`;

  showAiPanel('Markdown AI Assistant', html, (el) => {
    const { getContent, setContent, updatePreview } = window._mdAi || {};
    if (!getContent) return;
    const content = getContent();

    el.querySelector('#ai-md-continue')?.addEventListener('click', () => {
      removeOverlay();
      mdAiContinue(content, setContent, updatePreview);
    });
    el.querySelector('#ai-md-summarize')?.addEventListener('click', () => {
      removeOverlay();
      mdAiSummarize(content, setContent, updatePreview);
    });
    el.querySelector('#ai-md-toc')?.addEventListener('click', () => {
      removeOverlay();
      mdAiToc(content, setContent, updatePreview);
    });
    el.querySelector('#ai-md-code')?.addEventListener('click', () => {
      removeOverlay();
      mdAiCodeExplain(content, setContent, updatePreview);
    });

    // Template buttons with streaming
    el.querySelectorAll('.ai-tpl-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tpl = templates.find((t) => t.id === btn.dataset.tpl);
        if (!tpl) return;
        const resultEl = el.querySelector('#ai-md-result');
        const result = await aiCallStreaming(tpl.prompt, content.substring(0, 4000), resultEl, 'markdown');
        if (result) {
          const editorEl = document.getElementById('editor') || document.querySelector('.CodeMirror textarea');
          resultEl.appendChild(createApplyButton(result, editorEl));
        }
      });
    });
  });
}

async function mdAiContinue(content, setContent, updatePreview) {
  const editorContainer = document.getElementById('editor-container');
  const loading = showLoading(editorContainer);
  const lastPart = content.slice(-2000);

  const result = await aiCall(
    'Continue writing this markdown document. Match the style, formatting, and topic. Use proper markdown syntax. Return only the continuation.',
    lastPart
  );
  removeOverlay();
  if (!result) return;

  showDiffApproval('', result, (accepted) => {
    setContent(content + '\n\n' + accepted);
    if (updatePreview) updatePreview(content + '\n\n' + accepted);
    showToast('AI continuation added');
  }, null, editorContainer);
}

async function mdAiSummarize(content, setContent, updatePreview) {
  const editorContainer = document.getElementById('editor-container');
  const loading = showLoading(editorContainer);

  const result = await aiCall(
    'Summarize this markdown document into key points. Use markdown format with bullet points. Return only the summary.',
    content.substring(0, 5000)
  );
  removeOverlay();
  if (!result) return;

  showDiffApproval('', result, (accepted) => {
    setContent(content + '\n\n---\n\n## Summary\n\n' + accepted);
    if (updatePreview) updatePreview(content + '\n\n---\n\n## Summary\n\n' + accepted);
    showToast('Summary appended');
  }, null, editorContainer);
}

async function mdAiToc(content, setContent, updatePreview) {
  // Extract headings and generate TOC
  const headings = [];
  content.split('\n').forEach((line) => {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  });

  if (headings.length === 0) { showToast('No headings found in document'); return; }

  const toc = '## Table of Contents\n\n' + headings.map((h) => {
    const indent = '  '.repeat(h.level - 1);
    const anchor = h.text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `${indent}- [${h.text}](#${anchor})`;
  }).join('\n');

  showDiffApproval('', toc, (accepted) => {
    // Insert TOC at the beginning after frontmatter if present
    let insertPos = 0;
    if (content.startsWith('---')) {
      const endFm = content.indexOf('---', 3);
      if (endFm > 0) insertPos = endFm + 4;
    }
    const newContent = content.slice(0, insertPos) + accepted + '\n\n' + content.slice(insertPos);
    setContent(newContent);
    if (updatePreview) updatePreview(newContent);
    showToast('Table of Contents inserted');
  });
}

async function mdAiCodeExplain(content, setContent, updatePreview) {
  // Find code blocks
  const codeBlocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    codeBlocks.push({ lang: match[1], code: match[2].trim() });
  }

  if (codeBlocks.length === 0) { showToast('No code blocks found'); return; }

  const editorContainer = document.getElementById('editor-container');
  const loading = showLoading(editorContainer);

  const codeText = codeBlocks.map((b, i) => `Block ${i + 1} (${b.lang || 'unknown'}):\n${b.code}`).join('\n\n');

  const result = await aiCall(
    'Explain each code block concisely. For each block: what it does, key concepts, and any issues. Use markdown formatting.',
    codeText.substring(0, 3000)
  );
  removeOverlay();
  if (!result) return;

  showDiffApproval('', result, (accepted) => {
    setContent(content + '\n\n---\n\n## Code Explanation\n\n' + accepted);
    if (updatePreview) updatePreview(content + '\n\n---\n\n## Code Explanation\n\n' + accepted);
    showToast('Code explanation appended');
  }, null, editorContainer);
}


// ═══════════════════════════════════════════════════════════════
// 5. PDF AI ANALYSIS
// ═══════════════════════════════════════════════════════════════

export function initPdfAi(getPdfTextFn) {
  const container = document.getElementById('pdf-container');
  if (!container) return;

  // Store ref
  window._pdfAi = { getPdfText: getPdfTextFn };

  // Add AI button to PDF toolbar
  const toolbar = container.querySelector('.pdf-toolbar');
  if (toolbar) {
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-toolbar-btn';
    btn.innerHTML = '✦ AI';
    btn.title = 'PDF AI Analysis';
    btn.addEventListener('click', () => showPdfAiPanel());
    toolbar.appendChild(btn);
  } else {
    // Floating button
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-fab';
    btn.innerHTML = '✦';
    btn.title = 'PDF AI Analysis';
    btn.addEventListener('click', () => showPdfAiPanel());
    container.appendChild(btn);
  }
}

function showPdfAiPanel() {
  const html = `
    <div class="ai-cowork-tabs">
      <button class="ai-cowork-tab active" data-tab="summarize">Summarize</button>
      <button class="ai-cowork-tab" data-tab="extract">Extract Data</button>
      <button class="ai-cowork-tab" data-tab="qa">Q&A</button>
    </div>
    <div class="ai-cowork-tab-content" data-content="summarize">
      <p style="font-size:12px;color:var(--text-secondary)">Summarize the current PDF page or entire document.</p>
      <div style="display:flex;gap:8px">
        <button class="ai-cowork-btn accent" id="ai-pdf-sum-page">Summarize Page</button>
        <button class="ai-cowork-btn accent" id="ai-pdf-sum-doc">Summarize Document</button>
      </div>
      <div id="ai-pdf-sum-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="extract">
      <p style="font-size:12px;color:var(--text-secondary)">Extract structured data (tables, lists, key information) from the PDF.</p>
      <button class="ai-cowork-btn accent" id="ai-pdf-extract-go">Extract Data</button>
      <div id="ai-pdf-extract-result" class="ai-cowork-result"></div>
    </div>
    <div class="ai-cowork-tab-content hidden" data-content="qa">
      <label>Ask a question about this PDF:</label>
      <textarea id="ai-pdf-qa-input" rows="2" placeholder="e.g., What are the main conclusions?"></textarea>
      <button class="ai-cowork-btn accent" id="ai-pdf-qa-go">Ask</button>
      <div id="ai-pdf-qa-result" class="ai-cowork-result"></div>
    </div>`;

  showAiPanel('PDF AI Analysis', html, (el) => {
    // Tab switching
    el.querySelectorAll('.ai-cowork-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.ai-cowork-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        el.querySelectorAll('.ai-cowork-tab-content').forEach((c) => c.classList.add('hidden'));
        el.querySelector(`[data-content="${tab.dataset.tab}"]`)?.classList.remove('hidden');
      });
    });

    const getPdfText = window._pdfAi?.getPdfText;

    // Summarize page
    el.querySelector('#ai-pdf-sum-page')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-pdf-sum-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Summarizing page...';
      const text = getPdfText ? await getPdfText() : '';
      if (!text) { resultEl.innerHTML = '<span style="color:#e74c3c">No text extracted from PDF.</span>'; return; }
      // Get roughly current page text (split by page-like breaks)
      const pageText = text.substring(0, 2000);
      const result = await aiCall(
        'Summarize this page from a PDF document. Provide key points in bullet format. Be concise.',
        pageText
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });

    // Summarize document
    el.querySelector('#ai-pdf-sum-doc')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-pdf-sum-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Summarizing document...';
      const text = getPdfText ? await getPdfText() : '';
      if (!text) { resultEl.innerHTML = '<span style="color:#e74c3c">No text extracted from PDF.</span>'; return; }
      const result = await aiCall(
        'Summarize this entire PDF document. Provide: 1) Main topic/purpose 2) Key points (5-7 bullet points) 3) Conclusions if any. Be concise.',
        text.substring(0, 5000)
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });

    // Extract data
    el.querySelector('#ai-pdf-extract-go')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-pdf-extract-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Extracting data...';
      const text = getPdfText ? await getPdfText() : '';
      if (!text) { resultEl.innerHTML = '<span style="color:#e74c3c">No text extracted.</span>'; return; }
      const result = await aiCall(
        'Extract structured data from this PDF text. Look for: tables, lists, key-value pairs, dates, numbers, names. Format the output as clean markdown tables and lists.',
        text.substring(0, 4000)
      );
      if (result) {
        resultEl.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(result)}</pre>
          <button class="ai-cowork-btn small copy-formula">Copy</button>`;
        resultEl.querySelector('.copy-formula')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result);
          showToast('Extracted data copied');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Q&A
    el.querySelector('#ai-pdf-qa-go')?.addEventListener('click', async () => {
      const question = el.querySelector('#ai-pdf-qa-input')?.value;
      if (!question) return;
      const resultEl = el.querySelector('#ai-pdf-qa-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Thinking...';
      const text = getPdfText ? await getPdfText() : '';
      if (!text) { resultEl.innerHTML = '<span style="color:#e74c3c">No text extracted.</span>'; return; }
      const result = await aiCall(
        `You are a document analysis assistant. Answer the user's question based ONLY on the provided PDF content. If the answer is not in the document, say so.

PDF Content:
${text.substring(0, 4000)}`,
        question
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// 6. PHOTO AI SUGGESTIONS
// ═══════════════════════════════════════════════════════════════

export function initPhotoAi() {
  const container = document.getElementById('photo-container');
  if (!container) return;

  // Add AI button to photo toolbar
  const toolbar = container.querySelector('.photo-toolbar');
  if (toolbar) {
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-toolbar-btn';
    btn.innerHTML = '✦ AI';
    btn.title = 'Photo AI Suggestions';
    btn.addEventListener('click', () => showPhotoAiPanel());
    toolbar.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-fab';
    btn.id = 'photo-ai-fab';
    btn.innerHTML = '✦';
    btn.title = 'Photo AI Suggestions';
    btn.addEventListener('click', () => showPhotoAiPanel());
    container.appendChild(btn);
  }
}

function showPhotoAiPanel() {
  const templates = EDITOR_PROMPT_TEMPLATES.photo || [];
  const html = `
    <div class="ai-cowork-md-actions">
      <button class="ai-cowork-btn accent wide" id="ai-photo-suggest">🎨 Suggest Adjustments</button>
      <button class="ai-cowork-btn accent wide" id="ai-photo-caption">📝 Generate Caption</button>
      <button class="ai-cowork-btn accent wide" id="ai-photo-describe">🔍 Describe Image</button>
      ${templates.map((t) => `<button class="ai-cowork-btn wide ai-photo-tpl-btn" data-tpl="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div id="ai-photo-result" class="ai-cowork-result" style="margin-top:12px"></div>`;

  showAiPanel('Photo AI Suggestions', html, (el) => {
    // Get image description from canvas
    const getImageDesc = () => {
      const canvas = document.getElementById('photo-canvas');
      if (!canvas) return 'No image loaded';
      const info = document.querySelector('.photo-info');
      return `Image loaded: ${info?.textContent || 'photo'}, Canvas size: ${canvas.width}x${canvas.height}`;
    };

    // Suggest adjustments
    el.querySelector('#ai-photo-suggest')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-photo-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Analyzing image...';

      // Get current slider values for context
      const sliders = {};
      document.querySelectorAll('.photo-slider').forEach((s) => {
        sliders[s.id || s.name || s.dataset.param] = s.value;
      });

      const result = await aiCall(
        'You are a photo editing assistant. Based on the image information and current settings, suggest specific adjustments to improve the photo. Suggest values for: brightness, contrast, saturation, shadows, highlights, temperature, sharpness. Give specific numeric values (0-200 range, 100 = neutral). Format as a clear list.',
        `${getImageDesc()}\nCurrent settings: ${JSON.stringify(sliders)}`
      );
      resultEl.innerHTML = result ? escapeHtml(result) : '<span style="color:#e74c3c">Failed.</span>';
    });

    // Generate caption
    el.querySelector('#ai-photo-caption')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-photo-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Generating caption...';
      const result = await aiCall(
        'Generate a short, engaging caption/alt text for this image. Provide 3 options: 1) Short (under 10 words), 2) Medium (1-2 sentences), 3) Detailed description. Format clearly.',
        getImageDesc()
      );
      if (result) {
        resultEl.innerHTML = `${escapeHtml(result)}<br><button class="ai-cowork-btn small copy-formula" style="margin-top:8px">Copy</button>`;
        resultEl.querySelector('.copy-formula')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result);
          showToast('Caption copied');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Describe image
    el.querySelector('#ai-photo-describe')?.addEventListener('click', async () => {
      const resultEl = el.querySelector('#ai-photo-result');
      resultEl.innerHTML = '<span class="ai-cowork-spinner"></span> Describing image...';
      const result = await aiCall(
        'Generate a detailed description of this image. Describe the composition, colors, subjects, mood, and technical quality. This will be used as accessibility alt text.',
        getImageDesc()
      );
      if (result) {
        resultEl.innerHTML = `${escapeHtml(result)}<br><button class="ai-cowork-btn small copy-formula" style="margin-top:8px">Copy</button>`;
        resultEl.querySelector('.copy-formula')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result);
          showToast('Description copied');
        });
      } else {
        resultEl.innerHTML = '<span style="color:#e74c3c">Failed.</span>';
      }
    });

    // Photo template buttons
    el.querySelectorAll('.ai-photo-tpl-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tpl = templates.find((t) => t.id === btn.dataset.tpl);
        if (!tpl) return;
        const resultEl = el.querySelector('#ai-photo-result');
        await aiCallStreaming(tpl.prompt, getImageDesc(), resultEl, 'photo');
      });
    });
  });
}


// ═══════════════════════════════════════════════════════════════
// 7. CALCULATOR AI HELPER
// ═══════════════════════════════════════════════════════════════

export function initCalculatorAi() {
  const container = document.getElementById('calc-container');
  if (!container) return;

  const toolbar = container.querySelector('.calc-toolbar');
  if (toolbar) {
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-toolbar-btn';
    btn.innerHTML = '✦ AI';
    btn.title = 'Calculator AI Helper';
    btn.addEventListener('click', () => showCalculatorAiPanel());
    toolbar.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'ai-cowork-fab';
    btn.id = 'calc-ai-fab';
    btn.innerHTML = '✦';
    btn.title = 'Calculator AI Helper';
    btn.addEventListener('click', () => showCalculatorAiPanel());
    container.appendChild(btn);
  }
}

function showCalculatorAiPanel() {
  const templates = EDITOR_PROMPT_TEMPLATES.calculator || [];
  const calcDisplay = document.querySelector('.calc-display, #calc-display, .calc-result');
  const calcContent = calcDisplay ? calcDisplay.textContent : '';

  const html = `
    <div class="ai-cowork-md-actions">
      ${templates.map((t) => `<button class="ai-cowork-btn accent wide ai-calc-tpl-btn" data-tpl="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <label style="margin-top:12px">Or describe your question:</label>
    <textarea id="ai-calc-custom" rows="2" placeholder="e.g., How do I calculate compound interest?">${escapeHtml(calcContent)}</textarea>
    <button class="ai-cowork-btn accent" id="ai-calc-ask">Ask AI</button>
    <div id="ai-calc-result" class="ai-cowork-result" style="margin-top:12px"></div>`;

  showAiPanel('Calculator AI Helper', html, (el) => {
    el.querySelectorAll('.ai-calc-tpl-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tpl = templates.find((t) => t.id === btn.dataset.tpl);
        if (!tpl) return;
        const input = el.querySelector('#ai-calc-custom')?.value || calcContent;
        const resultEl = el.querySelector('#ai-calc-result');
        await aiCallStreaming(tpl.prompt, input, resultEl, 'calculator');
      });
    });

    el.querySelector('#ai-calc-ask')?.addEventListener('click', async () => {
      const input = el.querySelector('#ai-calc-custom')?.value;
      if (!input) return;
      const resultEl = el.querySelector('#ai-calc-result');
      await aiCallStreaming(
        'You are a math assistant. Answer the question clearly with step-by-step working. Use plain text formatting.',
        input, resultEl, 'calculator'
      );
    });
  });
}
