// OfficeLink SL — Drag & Drop Handler

/**
 * Initialize drag and drop for all supported file types
 * @param {Function} onFileLoad - Callback with {name, content} for markdown files
 */
export function initDragDrop(onFileLoad) {
  const overlay = document.getElementById('drop-overlay');

  // Prevent default browser drag behavior
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    overlay?.classList.remove('hidden');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only hide if leaving the window
    if (e.relatedTarget === null) {
      overlay?.classList.add('hidden');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    overlay?.classList.add('hidden');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const name = file.name.toLowerCase();

    // DOCX → switch to document tab and import via mammoth
    if (name.endsWith('.docx')) {
      try {
        const { switchTab } = await import('../ui/tabs.js');
        switchTab('document');
        const { importDocx } = await import('../document/docx.js');
        const result = await importDocx(file);
        const { setDocFileName } = await import('../document/doc-file.js');
        setDocFileName(file.name);
        const fileNameEl = document.getElementById('file-name');
        if (fileNameEl) fileNameEl.textContent = result.name;
      } catch (err) {
        console.error('DOCX drag-drop import error:', err);
        alert('DOCX import error: ' + err.message);
      }
      return;
    }

    // HWPX → switch to document tab and import
    if (name.endsWith('.hwpx')) {
      try {
        const { switchTab } = await import('../ui/tabs.js');
        switchTab('document');
        const { importHwpx } = await import('../document/hwpx.js');
        const result = await importHwpx(file);
        const { setDocFileName } = await import('../document/doc-file.js');
        setDocFileName(file.name);
        const fileNameEl = document.getElementById('file-name');
        if (fileNameEl) fileNameEl.textContent = result.name;
      } catch (err) {
        console.error('HWPX drag-drop import error:', err);
        alert('HWPX import error: ' + err.message);
      }
      return;
    }

    // HTML → switch to document tab
    if (name.endsWith('.html') || name.endsWith('.htm')) {
      try {
        const { switchTab } = await import('../ui/tabs.js');
        switchTab('document');
        const { setDocContent } = await import('../document/doc-editor.js');
        const { setDocFileName } = await import('../document/doc-file.js');
        const text = await file.text();
        const match = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        setDocContent(match ? match[1].trim() : text);
        setDocFileName(file.name);
        const fileNameEl = document.getElementById('file-name');
        if (fileNameEl) fileNameEl.textContent = file.name;
      } catch (err) {
        console.error('HTML drag-drop import error:', err);
      }
      return;
    }

    // PDF → switch to PDF tab
    if (name.endsWith('.pdf')) {
      try {
        const { switchTab } = await import('../ui/tabs.js');
        switchTab('pdf');
        const { loadPdfFromFile } = await import('../pdf/pdf-viewer.js');
        if (loadPdfFromFile) await loadPdfFromFile(file);
      } catch (err) {
        console.error('PDF drag-drop import error:', err);
      }
      return;
    }

    // Image → switch to photo tab
    if (name.match(/\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/)) {
      try {
        const { switchTab } = await import('../ui/tabs.js');
        switchTab('photo');
        // Try to load into photo editor
        const reader = new FileReader();
        reader.onload = () => {
          const event = new CustomEvent('photo-file-drop', { detail: { dataUrl: reader.result, name: file.name } });
          document.dispatchEvent(event);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Image drag-drop import error:', err);
      }
      return;
    }

    // Markdown / text files
    if (name.match(/\.(md|markdown|txt)$/)) {
      const content = await file.text();
      onFileLoad({ name: file.name, content });
      return;
    }

    console.warn('Unsupported file type:', file.name);
  });
}
