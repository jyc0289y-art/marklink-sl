/**
 * Shared download utility for OfficeLink SL.
 * Centralizes the Blob → anchor-click download pattern.
 * @module utils/download
 */

/**
 * Download a Blob as a file by creating a temporary anchor element.
 * @param {Blob} blob - The data to download
 * @param {string} filename - Suggested file name
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
