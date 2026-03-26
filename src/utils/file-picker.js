/**
 * Shared file picker utilities for OfficeLink SL.
 * Wraps File System Access API with fallback for unsupported browsers.
 * @module utils/file-picker
 */

import { downloadBlob } from './download.js';

/**
 * Open a file picker dialog and return the selected file.
 * Uses File System Access API when available, falls back to <input type="file">.
 * @param {Object} options - Options for showOpenFilePicker
 * @param {Array} options.types - File type filters [{description, accept}]
 * @param {boolean} [options.multiple=false] - Allow multiple file selection
 * @returns {Promise<File|null>} The selected file or null if cancelled
 */
export async function openFilePicker(options) {
  if (window.showOpenFilePicker) {
    const handles = await window.showOpenFilePicker(options);
    return handles[0] ? await handles[0].getFile() : null;
  }
  // Fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.values(options.types[0].accept).flat().join(',');
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

/**
 * Save a blob using a file picker dialog.
 * Uses File System Access API when available, falls back to downloadBlob.
 * @param {Blob} blob - The data to save
 * @param {string} filename - Suggested file name
 * @param {Object} [options] - Options for showSaveFilePicker (e.g. types)
 * @returns {Promise<string>} The saved file name
 */
export async function saveFilePicker(blob, filename, options) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: filename, ...options });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle.name || filename;
  }
  downloadBlob(blob, filename);
  return filename;
}
