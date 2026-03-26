// OfficeLink SL — Share as Link (local encoding)
// Encodes document content into a URL fragment (base64) for easy sharing.
// Max ~2KB content due to URL length limits.

import { toastSuccess, toastInfo, toastError } from '../ui/toast.js';

// ─── Constants ───────────────────────────────────────────────
const MAX_CONTENT_BYTES = 2048; // ~2KB max for URL safety
const URL_PARAM_PREFIX = 'share'; // URL fragment identifier
let styleInjected = false;

// ─── Helpers ─────────────────────────────────────────────────

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Compress and encode content to base64 URL-safe string
 */
const encodeContent = (content) => {
  try {
    const bytes = new TextEncoder().encode(content);
    // Convert bytes to string safely (spread operator fails on large arrays)
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    // Make URL-safe
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return null;
  }
};

/**
 * Decode content from base64 URL-safe string
 */
const decodeContent = (encoded) => {
  try {
    // Restore standard base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

/**
 * Get byte size of a string
 */
const byteSize = (str) => new Blob([str]).size;

// ─── Styles ──────────────────────────────────────────────────

const injectStyles = () => {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'share-link-styles';
  style.textContent = `
    .share-link-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .share-link-dialog {
      background: var(--bg-primary, #fff);
      color: var(--text-primary, #222);
      border-radius: 14px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.25);
      padding: 24px;
      width: 480px;
      max-width: 92vw;
    }
    .share-link-dialog h3 {
      margin: 0 0 4px;
      font-size: 18px;
    }
    .share-link-dialog .subtitle {
      font-size: 12px;
      color: var(--text-secondary, #888);
      margin-bottom: 16px;
    }
    .share-link-url-box {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .share-link-url-box input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      background: var(--bg-secondary, #f8f8f8);
      color: var(--text-primary, #222);
      box-sizing: border-box;
    }
    .share-link-url-box input:focus {
      outline: 2px solid var(--brand-color, #0071e3);
      outline-offset: -1px;
    }
    .share-link-url-box button {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      background: #0071e3;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .share-link-url-box button:hover {
      background: #005bb5;
    }
    .share-link-info {
      font-size: 12px;
      color: var(--text-secondary, #888);
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .share-link-info .warn {
      color: #e65100;
    }
    .share-link-info .ok {
      color: #2e7d32;
    }
    .share-link-close-row {
      display: flex;
      justify-content: flex-end;
    }
    .share-link-close-row button {
      padding: 8px 20px;
      border-radius: 8px;
      border: none;
      background: var(--hover-bg, #f0f0f0);
      color: var(--text-primary, #222);
      font-size: 13px;
      cursor: pointer;
    }

    /* Import notification banner */
    .share-import-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10002;
      background: #0071e3;
      color: #fff;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    }
    .share-import-banner button {
      padding: 6px 16px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .share-import-banner .btn-accept {
      background: #fff;
      color: #0071e3;
    }
    .share-import-banner .btn-dismiss {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
};

// ─── Get current content helper ──────────────────────────────

const getActiveTab = () => {
  try {
    const active = document.querySelector('.tab-item.active');
    return active?.dataset.tab || 'document';
  } catch { return 'document'; }
};

const getCurrentContent = () => {
  const tab = getActiveTab();
  if (tab === 'document') {
    const docEl = document.getElementById('doc-editor');
    return docEl ? docEl.innerText || docEl.textContent || '' : '';
  }
  if (tab === 'markdown') {
    const editorContainer = document.getElementById('editor-container');
    const cmContent = editorContainer?.querySelector('.cm-content');
    return cmContent?.textContent || '';
  }
  return '';
};

// ─── Share Dialog ────────────────────────────────────────────

const showShareDialog = () => {
  document.querySelector('.share-link-overlay')?.remove();

  const content = getCurrentContent().trim();
  if (!content) {
    toastInfo('Document is empty - nothing to share');
    return;
  }

  const contentBytes = byteSize(content);
  const encoded = encodeContent(content);
  const tooLarge = contentBytes > MAX_CONTENT_BYTES;

  // Build the share URL
  const baseUrl = window.location.origin + window.location.pathname;
  const tab = getActiveTab();
  let shareUrl = '';
  if (encoded && !tooLarge) {
    shareUrl = `${baseUrl}?tab=${tab}#${URL_PARAM_PREFIX}=${encoded}`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'share-link-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'share-link-dialog';

  dialog.innerHTML = `
    <h3>Share as Link</h3>
    <div class="subtitle">Encode your document into a shareable URL</div>
    ${tooLarge ? `
      <div class="share-link-info">
        <span class="warn">Content is too large (${(contentBytes / 1024).toFixed(1)} KB).</span><br>
        Maximum allowed: ${(MAX_CONTENT_BYTES / 1024).toFixed(1)} KB (~2,000 characters).<br>
        Try shortening your document or sharing the first portion.
      </div>
      <div class="share-link-url-box">
        <input type="text" value="Content too large for URL sharing" readonly style="color:var(--text-tertiary)">
      </div>
    ` : `
      <div class="share-link-info">
        <span class="ok">Content size: ${(contentBytes / 1024).toFixed(1)} KB</span> (limit: ${(MAX_CONTENT_BYTES / 1024).toFixed(1)} KB)<br>
        URL length: ${shareUrl.length.toLocaleString()} characters<br>
        Anyone with this link can view the content.
      </div>
      <div class="share-link-url-box">
        <input type="text" id="share-url-input" value="${escapeHtml(shareUrl)}" readonly>
        <button id="share-copy-btn">Copy Link</button>
      </div>
    `}
    <div class="share-link-close-row">
      <button id="share-close-btn">Close</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Select URL on focus
  const urlInput = dialog.querySelector('#share-url-input');
  if (urlInput) {
    urlInput.addEventListener('click', () => urlInput.select());
  }

  // Copy button
  dialog.querySelector('#share-copy-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Link copied to clipboard');
      const btn = dialog.querySelector('#share-copy-btn');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
      }
    } catch {
      // Fallback
      urlInput?.select();
      document.execCommand('copy');
      toastSuccess('Link copied');
    }
  });

  // Close handlers
  const close = () => overlay.remove();
  dialog.querySelector('#share-close-btn')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  });
};

// ─── Import from URL ─────────────────────────────────────────

const checkUrlForSharedContent = () => {
  const hash = window.location.hash;
  if (!hash) return;

  const match = hash.match(new RegExp(`#${URL_PARAM_PREFIX}=(.+)`));
  if (!match) return;

  const encoded = match[1];
  const content = decodeContent(encoded);
  if (!content) return;

  // Show an import banner
  showImportBanner(content);
};

const showImportBanner = (content) => {
  const existing = document.querySelector('.share-import-banner');
  if (existing) existing.remove();

  const preview = content.slice(0, 80).replace(/\n/g, ' ');
  const banner = document.createElement('div');
  banner.className = 'share-import-banner';
  banner.innerHTML = `
    <span>Shared document detected: "${escapeHtml(preview)}${content.length > 80 ? '...' : ''}"</span>
    <button class="btn-accept">Load Content</button>
    <button class="btn-dismiss">Dismiss</button>
  `;

  document.body.appendChild(banner);

  banner.querySelector('.btn-accept')?.addEventListener('click', () => {
    loadSharedContent(content);
    banner.remove();
    // Clean up URL hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
  });

  banner.querySelector('.btn-dismiss')?.addEventListener('click', () => {
    banner.remove();
    // Clean up URL hash
    history.replaceState(null, '', window.location.pathname + window.location.search);
  });
};

const loadSharedContent = (content) => {
  const tab = getActiveTab();

  if (tab === 'document') {
    const docEditor = document.getElementById('doc-editor');
    if (docEditor) {
      docEditor.innerHTML = '';
      // Split content by lines and create paragraphs
      const lines = content.split('\n');
      for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line || '\u00A0';
        docEditor.appendChild(p);
      }
    }
  } else if (tab === 'markdown') {
    // Dispatch event for CM6 editor to handle
    try {
      const event = new CustomEvent('officelink-restore-content', { detail: content });
      document.dispatchEvent(event);
    } catch {
      // Fallback
      const cm = document.querySelector('#editor-container .cm-content');
      if (cm) cm.textContent = content;
    }
  }

  toastSuccess('Shared content loaded');
};

// ─── Initialize ──────────────────────────────────────────────

export const initShareLink = () => {
  injectStyles();

  // Check URL on load for shared content
  // Delay slightly to ensure editors are initialized
  setTimeout(() => checkUrlForSharedContent(), 1000);

  // Also check on hash change
  window.addEventListener('hashchange', () => checkUrlForSharedContent());
};

/**
 * Open the share dialog
 */
export const shareAsLink = () => showShareDialog();
