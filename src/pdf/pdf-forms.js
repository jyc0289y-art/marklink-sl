// OfficeLink SL — PDF Forms (form fields, form data export/reset)

import { S, pdfjsLib } from './pdf-state.js';
import { downloadBlob } from '../utils/download.js';
import { persistAnnotationsToStorage } from './pdf-annotations.js';
import { renderAllPages, renderThumbnails } from './pdf-render.js';
import { scrollToPageIdx, updatePageInfo } from './pdf-nav.js';

// ─── Form Filling ───────────────────────────────────────────
export async function detectAndRenderFormFields(wrapper, page, viewport, pageNum) {
  try {
    const annotations = await page.getAnnotations();
    const formAnnots = annotations.filter(a =>
      a.subtype === 'Widget' && (a.fieldType === 'Tx' || a.fieldType === 'Btn' || a.fieldType === 'Ch')
    );

    if (formAnnots.length === 0) return;

    // Sort form fields by vertical then horizontal position for natural tab order
    const sortedAnnots = formAnnots.map(annot => {
      const rect = annot.rect;
      const [x1, y1] = pdfjsLib.Util.applyTransform([rect[0], rect[1]], viewport.transform);
      const [x2, y2] = pdfjsLib.Util.applyTransform([rect[2], rect[3]], viewport.transform);
      return { annot, x1, y1, x2, y2, top: Math.min(y1, y2), left: Math.min(x1, x2) };
    });
    sortedAnnots.sort((a, b) => {
      const rowDiff = Math.abs(a.top - b.top);
      if (rowDiff < 10) return a.left - b.left;
      return a.top - b.top;
    });

    let tabIdx = 1;
    for (const { annot, x1, y1, x2, y2 } of sortedAnnots) {

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const fieldId = annot.id || `field_${pageNum}_${Math.round(left)}_${Math.round(top)}`;

      // Highlight indicator
      const highlight = document.createElement('div');
      highlight.className = 'pdf-form-highlight';
      highlight.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
      wrapper.appendChild(highlight);

      // Create form field
      const fieldWrap = document.createElement('div');
      fieldWrap.className = 'pdf-form-field';
      fieldWrap.style.cssText = `left:${left}px;top:${top}px`;

      if (annot.fieldType === 'Tx') {
        const isMultiline = annot.multiLine;
        if (isMultiline) {
          const textarea = document.createElement('textarea');
          textarea.style.cssText = `width:${width}px;height:${height}px`;
          textarea.value = S.formFieldValues[fieldId] || annot.fieldValue || '';
          textarea.addEventListener('input', () => { S.formFieldValues[fieldId] = textarea.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(textarea);
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.style.cssText = `width:${width}px;height:${height}px`;
          input.value = S.formFieldValues[fieldId] || annot.fieldValue || '';
          input.addEventListener('input', () => { S.formFieldValues[fieldId] = input.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(input);
        }
      } else if (annot.fieldType === 'Btn') {
        if (annot.checkBox) {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = S.formFieldValues[fieldId] !== undefined ? S.formFieldValues[fieldId] : !!annot.fieldValue;
          cb.addEventListener('change', () => { S.formFieldValues[fieldId] = cb.checked; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(cb);
        } else if (annot.radioButton) {
          const rb = document.createElement('input');
          rb.type = 'radio';
          rb.name = annot.fieldName || `radio_${pageNum}`;
          rb.value = annot.buttonValue || '';
          rb.checked = S.formFieldValues[fieldId] !== undefined ? S.formFieldValues[fieldId] : !!annot.fieldValue;
          rb.addEventListener('change', () => { S.formFieldValues[fieldId] = rb.checked; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
          fieldWrap.appendChild(rb);
        }
      } else if (annot.fieldType === 'Ch') {
        const select = document.createElement('select');
        select.style.cssText = `width:${width}px;height:${height}px`;
        if (annot.options) {
          annot.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.exportValue || opt.displayValue;
            option.textContent = opt.displayValue;
            select.appendChild(option);
          });
        }
        select.value = S.formFieldValues[fieldId] || annot.fieldValue || '';
        select.addEventListener('change', () => { S.formFieldValues[fieldId] = select.value; persistAnnotationsToStorage(); updateFormDirtyIndicator(); });
        fieldWrap.appendChild(select);
      }

      // Set tabIndex for natural tab order
      const inputEl = fieldWrap.querySelector('input, textarea, select');
      if (inputEl) inputEl.tabIndex = tabIdx++;

      wrapper.appendChild(fieldWrap);
    }

    // Show Reset/Export buttons
    updateFormToolbarVisibility(true);
  } catch (_e) {
    // Silently ignore form detection errors
  }
}

/**
 * Render non-Widget annotations (highlight, text note, link) as interactive overlays
 */
export async function renderAnnotationOverlays(wrapper, page, viewport, pageNum) {
  try {
    const annotations = await page.getAnnotations();
    const nonWidgetAnnots = annotations.filter(a =>
      a.subtype !== 'Widget' && a.rect && a.rect.length === 4
    );
    if (nonWidgetAnnots.length === 0) return;

    for (const annot of nonWidgetAnnots) {
      const [x1Raw, y1Raw] = pdfjsLib.Util.applyTransform([annot.rect[0], annot.rect[1]], viewport.transform);
      const [x2Raw, y2Raw] = pdfjsLib.Util.applyTransform([annot.rect[2], annot.rect[3]], viewport.transform);
      const left = Math.min(x1Raw, x2Raw);
      const top = Math.min(y1Raw, y2Raw);
      const width = Math.abs(x2Raw - x1Raw);
      const height = Math.abs(y2Raw - y1Raw);

      if (width < 1 || height < 1) continue;

      const overlay = document.createElement('div');
      overlay.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;

      if (annot.subtype === 'Highlight') {
        overlay.className = 'pdf-annot-highlight-overlay';
      } else if (annot.subtype === 'Text') {
        overlay.className = 'pdf-annot-text-overlay';
        if (annot.contents) {
          overlay.dataset.tooltip = annot.contents;
          overlay.title = annot.contents;
        }
      } else if (annot.subtype === 'Link') {
        overlay.className = 'pdf-annot-link-overlay';
        if (annot.url) {
          overlay.addEventListener('click', () => { window.open(annot.url, '_blank', 'noopener'); });
        } else if (annot.dest) {
          overlay.addEventListener('click', () => {
            if (typeof annot.dest === 'string') {
              S.pdfDoc.getDestination(annot.dest).then((dest) => {
                if (dest) {
                  S.pdfDoc.getPageIndex(dest[0]).then((idx) => {
                    S.currentPage = idx + 1;
                    scrollToPageIdx(idx);
                    updatePageInfo();
                  });
                }
              });
            } else if (Array.isArray(annot.dest) && annot.dest[0]) {
              S.pdfDoc.getPageIndex(annot.dest[0]).then((idx) => {
                S.currentPage = idx + 1;
                scrollToPageIdx(idx);
                updatePageInfo();
              });
            }
          });
        }
      } else if (annot.subtype === 'Underline') {
        overlay.className = 'pdf-annot-underline-overlay';
      } else if (annot.subtype === 'StrikeOut') {
        overlay.className = 'pdf-annot-strikeout-overlay';
      } else {
        overlay.className = 'pdf-annot-generic-overlay';
      }

      wrapper.appendChild(overlay);
    }
  } catch (_e) {
    // Silently ignore annotation rendering errors
  }
}

/**
 * Show/hide form toolbar buttons
 */
export function updateFormToolbarVisibility(hasFields) {
  const resetBtn = document.getElementById('pdf-reset-form');
  const exportBtn = document.getElementById('pdf-export-form');
  if (resetBtn) resetBtn.style.display = hasFields ? '' : 'none';
  if (exportBtn) exportBtn.style.display = hasFields ? '' : 'none';
}

/**
 * Update the form dirty indicator
 */
export function updateFormDirtyIndicator() {
  const indicator = document.getElementById('pdf-form-dirty');
  if (!indicator) return;
  const hasChanges = Object.keys(S.formFieldValues).length > 0;
  indicator.style.display = hasChanges ? '' : 'none';
}

/**
 * Reset all form field values and re-render
 */
export function resetFormFields() {
  S.formFieldValues = {};
  persistAnnotationsToStorage();
  updateFormDirtyIndicator();
  if (S.pdfDoc) {
    renderAllPages().then(() => renderThumbnails());
  }
}

/**
 * Export form field values as a JSON file
 */
export function exportFormData() {
  const data = {};
  for (const [fieldId, value] of Object.entries(S.formFieldValues)) {
    data[fieldId] = value;
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const baseName = S.currentName ? S.currentName.replace(/\.pdf$/i, '') : 'form';
  downloadBlob(blob, `${baseName}_form_data.json`);
}
