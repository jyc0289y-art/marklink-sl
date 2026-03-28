import { describe, it, expect } from 'vitest';
import { uint8ToBase64, detectImageMime } from '../src/utils/image-utils.js';

// ─── 1. uint8ToBase64 ───

describe('uint8ToBase64', () => {
  it('converts empty Uint8Array to empty base64', () => {
    expect(uint8ToBase64(new Uint8Array([]))).toBe('');
  });

  it('converts single byte to base64', () => {
    // 0x41 = 'A', base64 of 'A' = 'QQ=='
    expect(uint8ToBase64(new Uint8Array([0x41]))).toBe('QQ==');
  });

  it('converts "Hello" bytes to base64', () => {
    const hello = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ToBase64(hello)).toBe('SGVsbG8=');
  });

  it('converts 3-byte input (no padding needed)', () => {
    // 'Man' = [77, 97, 110] → base64 = 'TWFu'
    expect(uint8ToBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
  });

  it('converts 2-byte input (single = padding)', () => {
    // 'Ma' = [77, 97] → base64 = 'TWE='
    expect(uint8ToBase64(new Uint8Array([77, 97]))).toBe('TWE=');
  });

  it('handles all zero bytes', () => {
    expect(uint8ToBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA');
  });

  it('handles all 0xFF bytes', () => {
    expect(uint8ToBase64(new Uint8Array([255, 255, 255]))).toBe('////');
  });

  it('handles PNG-like header bytes', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = uint8ToBase64(pngHeader);
    // Verify roundtrip with native btoa
    expect(result).toBe(btoa(String.fromCharCode(...pngHeader)));
  });

  it('handles larger data (256 bytes)', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const result = uint8ToBase64(data);
    // base64 of 256 bytes should be 344 chars (ceil(256/3)*4)
    expect(result.length).toBe(344);
    // Decode and verify roundtrip
    expect(result).toBe(btoa(String.fromCharCode(...data)));
  });
});

// ─── 2. detectImageMime ───

describe('detectImageMime', () => {
  it('detects JPEG from magic bytes (FF D8)', () => {
    expect(detectImageMime(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes (89 50 4E 47)', () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBe('image/png');
  });

  it('detects GIF from magic bytes (47 49 46)', () => {
    expect(detectImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif');
  });

  it('detects BMP from magic bytes (42 4D)', () => {
    expect(detectImageMime(new Uint8Array([0x42, 0x4D, 0x00, 0x00]))).toBe('image/bmp');
  });

  it('detects WebP from magic bytes (52 49 46 46)', () => {
    expect(detectImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe('image/webp');
  });

  it('returns image/png as fallback for unknown bytes', () => {
    expect(detectImageMime(new Uint8Array([0x00, 0x00, 0x00, 0x01]))).toBe('image/png');
  });

  it('returns image/png for very short data (< 4 bytes)', () => {
    expect(detectImageMime(new Uint8Array([0xFF]))).toBe('image/png');
    expect(detectImageMime(new Uint8Array([0x89, 0x50]))).toBe('image/png');
    expect(detectImageMime(new Uint8Array([]))).toBe('image/png');
  });

  it('returns image/png for 3-byte data even if partial JPEG match', () => {
    // FF D8 is JPEG but we need at least 4 bytes to test properly
    expect(detectImageMime(new Uint8Array([0xFF, 0xD8, 0xFF]))).toBe('image/png');
  });

  it('detects JPEG correctly even with extra trailing bytes', () => {
    const data = new Uint8Array(1000);
    data[0] = 0xFF;
    data[1] = 0xD8;
    expect(detectImageMime(data)).toBe('image/jpeg');
  });

  it('detects PNG correctly even with extra trailing bytes', () => {
    const data = new Uint8Array(1000);
    data[0] = 0x89;
    data[1] = 0x50;
    data[2] = 0x4E;
    data[3] = 0x47;
    expect(detectImageMime(data)).toBe('image/png');
  });

  it('does not confuse GIF with non-GIF starting with 0x47', () => {
    // 0x47 alone is not enough, need 0x49 0x46 too
    expect(detectImageMime(new Uint8Array([0x47, 0x00, 0x00, 0x00]))).toBe('image/png');
  });

  it('does not confuse BMP with non-BMP starting with 0x42', () => {
    expect(detectImageMime(new Uint8Array([0x42, 0x00, 0x00, 0x00]))).toBe('image/png');
  });
});
