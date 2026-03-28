// OfficeLink SL — Shared Image Utility Functions

/** Convert Uint8Array to base64 string */
export function uint8ToBase64(u8) {
  let binary = '';
  const len = u8.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

/** Detect MIME type from first few bytes of binary image data */
export function detectImageMime(data) {
  if (data.length < 4) return 'image/png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'image/webp';
  return 'image/png'; // fallback
}
