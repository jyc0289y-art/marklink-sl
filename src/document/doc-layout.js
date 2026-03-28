// OfficeLink SL — Document Editor: Page Layout (Setup, Ruler, Columns, Header/Footer, Watermark, Print)

import {
  editorEl, dirty, setDirty,
  PAGE_SIZES, currentPageSize, currentOrientation, currentMargins, currentApplyTo,
  setCurrentPageSize, setCurrentOrientation, setCurrentMargins, setCurrentApplyTo,
  pageNumbersEnabled, setPageNumbersEnabled,
  hfConfig, setHfConfig,
} from './doc-state.js';

// ─── Page Numbers ───────────────────────────────────────────

export function togglePageNumbers() {
  setPageNumbersEnabled(!pageNumbersEnabled);
  const wrapper = editorEl?.closest('.doc-page-wrapper');
  if (wrapper) {
    wrapper.classList.toggle('show-page-numbers', pageNumbersEnabled);
  }
  document.getElementById('doc-page-numbers')?.classList.toggle('active', pageNumbersEnabled);
}

// ─── Header & Footer ────────────────────────────────────────

export function showHeaderFooterDialog() {
  document.querySelector('.doc-hf-dialog')?.remove();

  const wrapper = editorEl?.closest('.doc-page-wrapper');
  const existingHeader = wrapper?.querySelector('.doc-page-header');
  const existingFooter = wrapper?.querySelector('.doc-page-footer');

  if (existingHeader && !hfConfig.headerText) hfConfig.headerText = existingHeader.innerHTML;
  if (existingFooter && !hfConfig.footerText) hfConfig.footerText = existingFooter.innerHTML;

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-hf-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:520px">
      <div class="ai-setup-header">
        <h3>Headers & Footers</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <!-- Main header/footer -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Header</label>
          <div id="hf-header-edit" contenteditable="true" style="width:100%;min-height:36px;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none">${hfConfig.headerText || ''}</div>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Footer</label>
          <div id="hf-footer-edit" contenteditable="true" style="width:100%;min-height:36px;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);outline:none">${hfConfig.footerText || ''}</div>
        </div>

        <!-- Insert fields -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-secondary)">Insert Field</label>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="hf-field-btn toolbar-btn" data-field="pagenum" style="font-size:11px;padding:4px 8px">Page Number</button>
            <button class="hf-field-btn toolbar-btn" data-field="date" style="font-size:11px;padding:4px 8px">Date</button>
            <button class="hf-field-btn toolbar-btn" data-field="time" style="font-size:11px;padding:4px 8px">Time</button>
            <button class="hf-field-btn toolbar-btn" data-field="title" style="font-size:11px;padding:4px 8px">Document Title</button>
            <button class="hf-field-btn toolbar-btn" data-field="filename" style="font-size:11px;padding:4px 8px">File Name</button>
          </div>
        </div>

        <!-- Options -->
        <div style="margin-bottom:14px;border:1px solid var(--border-color);border-radius:8px;padding:12px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="hf-diff-first" ${hfConfig.differentFirstPage ? 'checked' : ''}>
            Different first page / 첫 페이지 다르게
          </label>
          <div id="hf-first-page-fields" style="display:${hfConfig.differentFirstPage ? 'block' : 'none'};padding-left:24px;margin-bottom:8px">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">First page header</label>
            <input type="text" id="hf-first-header" class="doc-find-input" style="width:100%;margin-bottom:6px" value="${hfConfig.firstPageHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">First page footer</label>
            <input type="text" id="hf-first-footer" class="doc-find-input" style="width:100%" value="${hfConfig.firstPageFooter}">
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px">
            <input type="checkbox" id="hf-diff-oddeven" ${hfConfig.differentOddEven ? 'checked' : ''}>
            Different odd/even pages / 홀짝 페이지 다르게
          </label>
          <div id="hf-oddeven-fields" style="display:${hfConfig.differentOddEven ? 'block' : 'none'};padding-left:24px">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Odd page header</label>
            <input type="text" id="hf-odd-header" class="doc-find-input" style="width:100%;margin-bottom:4px" value="${hfConfig.oddHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Even page header</label>
            <input type="text" id="hf-even-header" class="doc-find-input" style="width:100%;margin-bottom:6px" value="${hfConfig.evenHeader}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Odd page footer</label>
            <input type="text" id="hf-odd-footer" class="doc-find-input" style="width:100%;margin-bottom:4px" value="${hfConfig.oddFooter}">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:2px">Even page footer</label>
            <input type="text" id="hf-even-footer" class="doc-find-input" style="width:100%" value="${hfConfig.evenFooter}">
          </div>
        </div>

        <!-- Height adjustment -->
        <div style="margin-bottom:14px;display:flex;gap:16px">
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">Header height (px)
            <input type="number" id="hf-header-height" value="${hfConfig.headerHeight}" min="16" max="100" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          </label>
          <label style="flex:1;font-size:12px;color:var(--text-secondary)">Footer height (px)
            <input type="number" id="hf-footer-height" value="${hfConfig.footerHeight}" min="16" max="100" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          </label>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="hf-remove">Remove All</button>
          <button class="ai-pull-btn" id="hf-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('#hf-diff-first').addEventListener('change', (e) => {
    dialog.querySelector('#hf-first-page-fields').style.display = e.target.checked ? 'block' : 'none';
  });
  dialog.querySelector('#hf-diff-oddeven').addEventListener('change', (e) => {
    dialog.querySelector('#hf-oddeven-fields').style.display = e.target.checked ? 'block' : 'none';
  });

  dialog.querySelectorAll('.hf-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fieldMap = {
        pagenum: '{{page}}',
        date: '{{date}}',
        time: '{{time}}',
        title: '{{title}}',
        filename: '{{filename}}',
      };
      const field = fieldMap[btn.dataset.field] || '';
      const active = document.activeElement;
      if (active && (active.id === 'hf-header-edit' || active.id === 'hf-footer-edit')) {
        document.execCommand('insertText', false, field);
      } else {
        const headerEdit = dialog.querySelector('#hf-header-edit');
        headerEdit.focus();
        document.execCommand('insertText', false, field);
      }
    });
  });

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#hf-apply')?.addEventListener('click', () => {
    hfConfig.headerText = dialog.querySelector('#hf-header-edit').innerHTML;
    hfConfig.footerText = dialog.querySelector('#hf-footer-edit').innerHTML;
    hfConfig.headerHeight = parseInt(dialog.querySelector('#hf-header-height').value) || 28;
    hfConfig.footerHeight = parseInt(dialog.querySelector('#hf-footer-height').value) || 28;
    hfConfig.differentFirstPage = dialog.querySelector('#hf-diff-first').checked;
    hfConfig.differentOddEven = dialog.querySelector('#hf-diff-oddeven').checked;
    hfConfig.firstPageHeader = dialog.querySelector('#hf-first-header')?.value || '';
    hfConfig.firstPageFooter = dialog.querySelector('#hf-first-footer')?.value || '';
    hfConfig.oddHeader = dialog.querySelector('#hf-odd-header')?.value || '';
    hfConfig.oddFooter = dialog.querySelector('#hf-odd-footer')?.value || '';
    hfConfig.evenHeader = dialog.querySelector('#hf-even-header')?.value || '';
    hfConfig.evenFooter = dialog.querySelector('#hf-even-footer')?.value || '';
    applyHeaderFooter();
    dialog.remove();
  });

  dialog.querySelector('#hf-remove')?.addEventListener('click', () => {
    setHfConfig({ headerText: '', footerText: '', headerHeight: 28, footerHeight: 28, differentFirstPage: false, differentOddEven: false, firstPageHeader: '', firstPageFooter: '', oddHeader: '', oddFooter: '', evenHeader: '', evenFooter: '' });
    const w = editorEl?.closest('.doc-page-wrapper');
    w?.querySelector('.doc-page-header')?.remove();
    w?.querySelector('.doc-page-footer')?.remove();
    dialog.remove();
  });
}

function resolveHFFields(text) {
  const now = new Date();
  const title = editorEl?.querySelector('h1')?.textContent || 'Untitled';
  const fileName = document.getElementById('file-name')?.textContent || 'document';
  return text
    .replace(/\{\{page\}\}/g, '<span class="hf-page-num">1</span>')
    .replace(/\{\{date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{time\}\}/g, now.toLocaleTimeString())
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{filename\}\}/g, fileName);
}

function applyHeaderFooter() {
  const wrapper = editorEl?.closest('.doc-page-wrapper');
  if (!wrapper) return;

  wrapper.querySelector('.doc-page-header')?.remove();
  wrapper.querySelector('.doc-page-footer')?.remove();

  const headerContent = resolveHFFields(hfConfig.headerText);
  const footerContent = resolveHFFields(hfConfig.footerText);

  if (headerContent) {
    const header = document.createElement('div');
    header.className = 'doc-page-header';
    header.contentEditable = 'true';
    header.style.minHeight = hfConfig.headerHeight + 'px';
    header.innerHTML = headerContent;
    const ruler = wrapper.querySelector('.doc-ruler');
    if (ruler) ruler.after(header);
    else wrapper.insertBefore(header, wrapper.firstChild);
  }

  if (footerContent) {
    const footer = document.createElement('div');
    footer.className = 'doc-page-footer';
    footer.contentEditable = 'true';
    footer.style.minHeight = hfConfig.footerHeight + 'px';
    footer.innerHTML = footerContent;
    wrapper.appendChild(footer);
  }
}

// ─── Page Setup Dialog ───────────────────────────────────────

export function showPageSetupDialog() {
  document.querySelector('.doc-ps-dialog')?.remove();

  const curSize = PAGE_SIZES[currentPageSize];
  const isCustom = currentPageSize === 'Custom';

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-ps-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:560px">
      <div class="ai-setup-header">
        <h3>Page Setup / 용지 설정</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body" style="display:flex;gap:24px">
        <div style="flex:1">
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Paper Size / 용지 크기</label>
            <select id="ps-size" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              ${Object.entries(PAGE_SIZES).map(([k, v]) =>
                `<option value="${k}" ${k === currentPageSize ? 'selected' : ''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div id="ps-custom-dims" style="margin-bottom:14px;display:${isCustom ? 'flex' : 'none'};gap:8px">
            <label style="flex:1;font-size:12px;color:var(--text-secondary)">Width (mm)
              <input type="number" id="ps-cw" value="${curSize.w}" min="50" max="600" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
            <label style="flex:1;font-size:12px;color:var(--text-secondary)">Height (mm)
              <input type="number" id="ps-ch" value="${curSize.h}" min="50" max="1000" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
            </label>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Orientation / 방향</label>
            <div style="display:flex;gap:8px">
              <button id="ps-portrait" class="toolbar-btn" style="flex:1;padding:10px;border:2px solid ${currentOrientation === 'portrait' ? 'var(--brand-color)' : 'var(--border-color)'};border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--bg-primary);cursor:pointer">
                <div style="width:24px;height:32px;border:2px solid currentColor;border-radius:2px"></div>
                <span style="font-size:11px">Portrait</span>
              </button>
              <button id="ps-landscape" class="toolbar-btn" style="flex:1;padding:10px;border:2px solid ${currentOrientation === 'landscape' ? 'var(--brand-color)' : 'var(--border-color)'};border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--bg-primary);cursor:pointer">
                <div style="width:32px;height:24px;border:2px solid currentColor;border-radius:2px"></div>
                <span style="font-size:11px">Landscape</span>
              </button>
            </div>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Margins (mm) / 여백</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="font-size:12px;color:var(--text-secondary)">Top / 위
                <input type="number" id="ps-mt" value="${currentMargins.top}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              </label>
              <label style="font-size:12px;color:var(--text-secondary)">Bottom / 아래
                <input type="number" id="ps-mb" value="${currentMargins.bottom}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              </label>
              <label style="font-size:12px;color:var(--text-secondary)">Left / 왼쪽
                <input type="number" id="ps-ml" value="${currentMargins.left}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              </label>
              <label style="font-size:12px;color:var(--text-secondary)">Right / 오른쪽
                <input type="number" id="ps-mr" value="${currentMargins.right}" min="0" max="100" step="1" style="width:100%;padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              </label>
            </div>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Apply to / 적용 대상</label>
            <select id="ps-apply-to" style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
              <option value="whole" ${currentApplyTo === 'whole' ? 'selected' : ''}>Whole document / 전체 문서</option>
              <option value="section" ${currentApplyTo === 'section' ? 'selected' : ''}>Current section / 현재 구역</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="ai-pull-btn" id="ps-cancel">Cancel</button>
            <button class="ai-pull-btn" id="ps-apply" style="background:var(--brand-color);color:#fff">Apply</button>
          </div>
        </div>
        <div style="width:180px;display:flex;flex-direction:column;align-items:center;gap:8px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Preview</label>
          <div id="ps-preview-container" style="width:160px;height:220px;display:flex;align-items:center;justify-content:center;background:var(--sidebar-bg);border-radius:8px;border:1px solid var(--border-color)">
            <div id="ps-preview-page" style="background:white;border:1px solid #ccc;box-shadow:0 2px 8px rgba(0,0,0,0.1);position:relative;transition:all 0.2s"></div>
          </div>
          <div id="ps-preview-dims" style="font-size:11px;color:var(--text-secondary);text-align:center"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  let selectedOrientation = currentOrientation;
  let selectedSize = currentPageSize;

  const updatePreview = () => {
    const sizeKey = dialog.querySelector('#ps-size').value;
    const sz = PAGE_SIZES[sizeKey];
    let pw = sizeKey === 'Custom' ? (parseFloat(dialog.querySelector('#ps-cw')?.value) || 210) : sz.w;
    let ph = sizeKey === 'Custom' ? (parseFloat(dialog.querySelector('#ps-ch')?.value) || 297) : sz.h;
    if (selectedOrientation === 'landscape') { [pw, ph] = [ph, pw]; }

    const mt = parseFloat(dialog.querySelector('#ps-mt').value) || 0;
    const mb = parseFloat(dialog.querySelector('#ps-mb').value) || 0;
    const ml = parseFloat(dialog.querySelector('#ps-ml').value) || 0;
    const mr = parseFloat(dialog.querySelector('#ps-mr').value) || 0;

    const maxW = 140, maxH = 200;
    const scale = Math.min(maxW / pw, maxH / ph);
    const dispW = pw * scale;
    const dispH = ph * scale;

    const page = dialog.querySelector('#ps-preview-page');
    page.style.width = dispW + 'px';
    page.style.height = dispH + 'px';

    const mtS = mt * scale, mbS = mb * scale, mlS = ml * scale, mrS = mr * scale;
    page.innerHTML = `<div style="position:absolute;top:${mtS}px;left:${mlS}px;right:${mrS}px;bottom:${mbS}px;border:1px dashed rgba(0,113,227,0.4);border-radius:1px"></div>
      <div style="position:absolute;top:${mtS + 4}px;left:${mlS + 3}px;right:${mrS + 3}px">
        <div style="height:2px;background:#ccc;margin-bottom:3px;width:80%"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px;width:60%"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px"></div>
        <div style="height:2px;background:#ddd;margin-bottom:3px;width:90%"></div>
        <div style="height:2px;background:#eee;width:40%"></div>
      </div>`;

    const dimsEl = dialog.querySelector('#ps-preview-dims');
    dimsEl.textContent = `${Math.round(pw)} x ${Math.round(ph)} mm (${selectedOrientation})`;
  };

  dialog.querySelector('#ps-portrait').addEventListener('click', () => {
    selectedOrientation = 'portrait';
    dialog.querySelector('#ps-portrait').style.borderColor = 'var(--brand-color)';
    dialog.querySelector('#ps-landscape').style.borderColor = 'var(--border-color)';
    updatePreview();
  });
  dialog.querySelector('#ps-landscape').addEventListener('click', () => {
    selectedOrientation = 'landscape';
    dialog.querySelector('#ps-landscape').style.borderColor = 'var(--brand-color)';
    dialog.querySelector('#ps-portrait').style.borderColor = 'var(--border-color)';
    updatePreview();
  });

  dialog.querySelector('#ps-size').addEventListener('change', (e) => {
    selectedSize = e.target.value;
    const customDims = dialog.querySelector('#ps-custom-dims');
    customDims.style.display = selectedSize === 'Custom' ? 'flex' : 'none';
    updatePreview();
  });

  ['#ps-mt','#ps-mb','#ps-ml','#ps-mr','#ps-cw','#ps-ch'].forEach(sel => {
    dialog.querySelector(sel)?.addEventListener('input', () => updatePreview());
  });

  updatePreview();

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#ps-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#ps-apply')?.addEventListener('click', () => {
    const size = dialog.querySelector('#ps-size').value;
    const mt = parseFloat(dialog.querySelector('#ps-mt').value) || 25.4;
    const mb = parseFloat(dialog.querySelector('#ps-mb').value) || 25.4;
    const ml = parseFloat(dialog.querySelector('#ps-ml').value) || 25.4;
    const mr = parseFloat(dialog.querySelector('#ps-mr').value) || 25.4;

    setCurrentPageSize(size);
    setCurrentOrientation(selectedOrientation);
    setCurrentMargins({ top: mt, right: mr, bottom: mb, left: ml });
    setCurrentApplyTo(dialog.querySelector('#ps-apply-to').value);

    if (size === 'Custom') {
      PAGE_SIZES.Custom.w = parseFloat(dialog.querySelector('#ps-cw').value) || 210;
      PAGE_SIZES.Custom.h = parseFloat(dialog.querySelector('#ps-ch').value) || 297;
    }

    applyPageLayout();
    dialog.remove();
  });
}

function applyPageLayout() {
  if (!editorEl) return;
  const ps = PAGE_SIZES[currentPageSize];
  let w = ps.w, h = ps.h;
  if (currentOrientation === 'landscape') { [w, h] = [h, w]; }

  if (currentApplyTo === 'section') {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const section = node ? (node.nodeType === 3 ? node.parentElement : node)?.closest('.doc-section-content') : null;
    if (section) {
      section.style.width = w + 'mm';
      section.style.minHeight = h + 'mm';
      section.style.padding = `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
    }
  } else {
    editorEl.style.width = w + 'mm';
    editorEl.style.minHeight = h + 'mm';
    editorEl.style.padding = `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
  }
  renderRuler();
}

// ─── Document Ruler ──────────────────────────────────────────

export function renderRuler() {
  const ruler = document.getElementById('doc-ruler');
  if (!ruler || !editorEl) return;

  const editorWidth = editorEl.offsetWidth;
  const leftMarginPx = currentMargins.left * (96 / 25.4);
  const rightMarginPx = currentMargins.right * (96 / 25.4);

  const editorStyle = getComputedStyle(editorEl);
  const rulerWidth = parseFloat(editorStyle.width) || editorWidth;
  ruler.style.width = rulerWidth + 'px';

  let html = '';
  const cmPx = 10 * (96 / 25.4);
  const totalCm = Math.floor(editorWidth / cmPx);

  html += `<div class="ruler-margin-left" style="position:absolute;left:0;top:0;width:${leftMarginPx}px;height:100%;background:var(--border-color);opacity:0.3"></div>`;
  html += `<div class="ruler-margin-right" style="position:absolute;right:0;top:0;width:${rightMarginPx}px;height:100%;background:var(--border-color);opacity:0.3"></div>`;
  html += `<div class="ruler-handle ruler-handle-left" style="position:absolute;left:${leftMarginPx - 4}px;top:0;width:8px;height:100%;cursor:col-resize;z-index:10" title="Drag to adjust left margin"></div>`;
  html += `<div class="ruler-handle ruler-handle-right" style="position:absolute;right:${rightMarginPx - 4}px;top:0;width:8px;height:100%;cursor:col-resize;z-index:10" title="Drag to adjust right margin"></div>`;

  for (let cm = 0; cm <= totalCm; cm++) {
    const x = cm * cmPx;
    html += `<div style="position:absolute;left:${x}px;bottom:0;width:1px;height:${cm % 5 === 0 ? 12 : 8}px;background:var(--text-tertiary)"></div>`;
    if (cm > 0 && cm % 5 === 0) {
      html += `<span style="position:absolute;left:${x - 5}px;top:1px;font-size:8px;color:var(--text-secondary)">${cm}</span>`;
    }
    if (cm < totalCm) {
      html += `<div style="position:absolute;left:${x + cmPx / 2}px;bottom:0;width:1px;height:5px;background:var(--text-tertiary);opacity:0.5"></div>`;
    }
  }

  ruler.innerHTML = html;

  const leftHandle = ruler.querySelector('.ruler-handle-left');
  const rightHandle = ruler.querySelector('.ruler-handle-right');

  if (leftHandle) {
    leftHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rulerRect = ruler.getBoundingClientRect();
      const onMove = (ev) => {
        const newLeftPx = Math.max(0, Math.min(ev.clientX - rulerRect.left, rulerRect.width / 2));
        currentMargins.left = Math.round(newLeftPx / (96 / 25.4) * 10) / 10;
        if (editorEl) editorEl.style.paddingLeft = currentMargins.left + 'mm';
        renderRuler();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  if (rightHandle) {
    rightHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rulerRect = ruler.getBoundingClientRect();
      const onMove = (ev) => {
        const newRightPx = Math.max(0, Math.min(rulerRect.right - ev.clientX, rulerRect.width / 2));
        currentMargins.right = Math.round(newRightPx / (96 / 25.4) * 10) / 10;
        if (editorEl) editorEl.style.paddingRight = currentMargins.right + 'mm';
        renderRuler();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

// ─── Columns Layout ─────────────────────────────────────────

export function showColumnsDialog() {
  document.querySelector('.doc-cols-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-cols-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:320px">
      <div class="ai-setup-header">
        <h3>Columns Layout / 단 나누기</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="display:flex;gap:12px;margin-bottom:16px">
          ${[1, 2, 3].map(n => `
            <button class="doc-col-opt" data-cols="${n}" style="flex:1;padding:16px 8px;border:2px solid var(--border-color);border-radius:8px;background:var(--bg-primary);cursor:pointer;text-align:center;color:var(--text-primary)">
              <div style="display:flex;gap:3px;justify-content:center;margin-bottom:6px">
                ${Array(n).fill('<div style="width:20px;height:28px;border:1px solid var(--text-secondary);border-radius:2px"></div>').join('')}
              </div>
              <span style="font-size:12px;font-weight:600">${n === 1 ? 'One' : n === 2 ? 'Two' : 'Three'}</span>
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="cols-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.querySelector('#cols-cancel')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelectorAll('.doc-col-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const cols = parseInt(btn.dataset.cols);
      if (editorEl) {
        if (cols === 1) {
          editorEl.style.columnCount = '';
          editorEl.style.columnGap = '';
          editorEl.style.columnRule = '';
        } else {
          editorEl.style.columnCount = cols;
          editorEl.style.columnGap = '24px';
          editorEl.style.columnRule = '1px solid var(--border-color)';
        }
      }
      dialog.remove();
    });
  });
}

// ─── Watermark ──────────────────────────────────────────────

export function showWatermarkDialog() {
  document.querySelector('.doc-wm-dialog')?.remove();

  const wrapper = editorEl?.closest('.doc-page-wrapper');
  const existingWm = wrapper?.querySelector('.doc-watermark');

  const dialog = document.createElement('div');
  dialog.className = 'ai-setup-modal doc-wm-dialog';
  dialog.innerHTML = `
    <div class="ai-setup-content" style="width:380px">
      <div class="ai-setup-header">
        <h3>Watermark / 워터마크</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Text</label>
          <input type="text" id="wm-text" class="doc-find-input" style="width:100%" placeholder="e.g. DRAFT, CONFIDENTIAL" value="${existingWm?.textContent || ''}">
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:2px">Color</label>
            <input type="color" id="wm-color" value="#cccccc" style="width:100%;height:32px;border:1px solid var(--border-color);border-radius:4px">
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:2px">Opacity</label>
            <input type="range" id="wm-opacity" min="5" max="50" value="15" style="width:100%">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ai-pull-btn" id="wm-remove">Remove</button>
          <button class="ai-pull-btn" id="wm-apply" style="background:var(--brand-color);color:#fff">Apply</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.ai-setup-close')?.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

  dialog.querySelector('#wm-remove')?.addEventListener('click', () => {
    wrapper?.querySelector('.doc-watermark')?.remove();
    dialog.remove();
  });

  dialog.querySelector('#wm-apply')?.addEventListener('click', () => {
    const text = dialog.querySelector('#wm-text').value.trim();
    if (!text) return;
    const color = dialog.querySelector('#wm-color').value;
    const opacity = parseInt(dialog.querySelector('#wm-opacity').value) / 100;

    wrapper?.querySelector('.doc-watermark')?.remove();

    const wm = document.createElement('div');
    wm.className = 'doc-watermark';
    wm.textContent = text;
    wm.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px; font-weight: 900;
      color: ${color}; opacity: ${opacity};
      pointer-events: none; white-space: nowrap;
      z-index: 0; user-select: none;
    `;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(wm);
    }
    dialog.remove();
  });
}

// ─── Section Break ──────────────────────────────────────────

export function insertSectionBreak() {
  if (!editorEl) return;
  const html = `<div class="doc-section-break" contenteditable="false" style="
    border-top: 2px dashed var(--border-color);
    margin: 24px 0;
    padding: 8px 0;
    text-align: center;
    font-size: 11px;
    color: var(--text-secondary);
    user-select: none;
    page-break-before: always;
  ">— Section Break —</div>`;
  editorEl.focus();
  document.execCommand('insertHTML', false, html);
  setDirty(true);
}

// ─── Columns Menu ───────────────────────────────────────────

export function showColumnsMenu() {
  const existing = document.querySelector('.doc-cols-menu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('doc-columns');
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'doc-cols-menu';
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.12);padding:8px;z-index:2000;display:flex;flex-direction:column;gap:2px;min-width:160px`;

  const layouts = [
    { label: '1 Column', cols: 1, icon: '▮' },
    { label: '2 Columns', cols: 2, icon: '▮▮' },
    { label: '3 Columns', cols: 3, icon: '▮▮▮' },
    { label: '2 Columns (Left wide)', cols: '2-left', icon: '▮▯' },
    { label: '2 Columns (Right wide)', cols: '2-right', icon: '▯▮' },
  ];

  layouts.forEach(l => {
    const item = document.createElement('button');
    item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:12px;color:var(--text-primary);border-radius:4px;width:100%';
    item.innerHTML = `<span style="font-family:monospace;letter-spacing:2px;font-size:14px">${l.icon}</span> ${l.label}`;
    item.onmouseenter = () => item.style.background = 'var(--hover-bg)';
    item.onmouseleave = () => item.style.background = 'transparent';
    item.onclick = () => {
      applyColumnLayout(l.cols);
      menu.remove();
    };
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 50);
}

function applyColumnLayout(cols) {
  if (!editorEl) return;
  const sel = window.getSelection();

  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const content = range.extractContents();
    const wrapper = document.createElement('div');

    if (cols === 1) {
      wrapper.style.cssText = 'column-count:1';
    } else if (cols === 2) {
      wrapper.style.cssText = 'column-count:2;column-gap:24px;column-rule:1px solid var(--border-color)';
    } else if (cols === 3) {
      wrapper.style.cssText = 'column-count:3;column-gap:20px;column-rule:1px solid var(--border-color)';
    } else if (cols === '2-left') {
      wrapper.style.cssText = 'display:flex;gap:24px';
      const left = document.createElement('div');
      left.style.cssText = 'flex:2';
      const right = document.createElement('div');
      right.style.cssText = 'flex:1;border-left:1px solid var(--border-color);padding-left:16px';
      left.appendChild(content);
      right.innerHTML = '<p>Right column content...</p>';
      wrapper.appendChild(left);
      wrapper.appendChild(right);
      range.insertNode(wrapper);
      setDirty(true);
      return;
    } else if (cols === '2-right') {
      wrapper.style.cssText = 'display:flex;gap:24px';
      const left = document.createElement('div');
      left.style.cssText = 'flex:1;border-right:1px solid var(--border-color);padding-right:16px';
      const right = document.createElement('div');
      right.style.cssText = 'flex:2';
      left.innerHTML = '<p>Left column content...</p>';
      right.appendChild(content);
      wrapper.appendChild(left);
      wrapper.appendChild(right);
      range.insertNode(wrapper);
      setDirty(true);
      return;
    }

    wrapper.appendChild(content);
    range.insertNode(wrapper);
  } else {
    if (cols === 1) {
      editorEl.style.columnCount = '1';
      editorEl.style.columnGap = '';
      editorEl.style.columnRule = '';
    } else if (typeof cols === 'number') {
      editorEl.style.columnCount = String(cols);
      editorEl.style.columnGap = '24px';
      editorEl.style.columnRule = '1px solid var(--border-color)';
    }
  }
  setDirty(true);
}

// ─── Print ──────────────────────────────────────────────────

export function printDocument() {
  if (!editorEl) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow pop-ups to print.'); return; }

  const ps = PAGE_SIZES[currentPageSize];
  const wrapper = editorEl.closest('.doc-page-wrapper');
  const header = wrapper?.querySelector('.doc-page-header')?.textContent || '';
  const footer = wrapper?.querySelector('.doc-page-footer')?.textContent || '';

  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Print — OfficeLink SL</title>
    <style>
      @page { size: ${ps.w}mm ${ps.h}mm; margin: ${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: ${editorEl.style.lineHeight || '1.6'}; color: #222; margin: 0; padding: 0; }
      ${header ? `.print-header { text-align: center; font-size: 11px; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 16px; }` : ''}
      ${footer ? `.print-footer { text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 4px; margin-top: 16px; position: fixed; bottom: 0; left: 0; right: 0; }` : ''}
      table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; } th { background: #f5f5f5; font-weight: 600; }
      img { max-width: 100%; height: auto; }
      h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.17em; }
      .doc-footnotes { margin-top: 24px; }
      .doc-toc { border: 1px solid #ccc; padding: 16px; margin-bottom: 24px; border-radius: 8px; }
    </style>
  </head><body>
    ${header ? `<div class="print-header">${header}</div>` : ''}
    ${editorEl.innerHTML}
    ${footer ? `<div class="print-footer">${footer}</div>` : ''}
  </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
}
