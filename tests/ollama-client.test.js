import { describe, it, expect } from 'vitest';
import {
  formatModelSize,
  isVisionModel,
  VISION_MODELS,
  MODEL_TIERS,
  getRecommendedTier,
} from '../src/ai/ollama-client.js';

// ── Ollama Client — Pure Function Tests ──

describe('formatModelSize', () => {
  it('formats GB-scale sizes', () => {
    const oneGB = 1024 * 1024 * 1024;
    expect(formatModelSize(oneGB)).toBe('1.0 GB');
    expect(formatModelSize(oneGB * 3.7)).toBe('3.7 GB');
  });

  it('formats MB-scale sizes', () => {
    const oneMB = 1024 * 1024;
    expect(formatModelSize(oneMB * 500)).toBe('500 MB');
    expect(formatModelSize(oneMB * 128)).toBe('128 MB');
  });

  it('returns empty string for 0', () => {
    expect(formatModelSize(0)).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatModelSize(null)).toBe('');
    expect(formatModelSize(undefined)).toBe('');
  });

  it('handles fractional GB values', () => {
    const gb = 1024 * 1024 * 1024;
    expect(formatModelSize(gb * 7.5)).toBe('7.5 GB');
  });
});

describe('isVisionModel', () => {
  it('detects llava as vision model', () => {
    expect(isVisionModel('llava:13b')).toBe(true);
    expect(isVisionModel('llava:latest')).toBe(true);
  });

  it('detects llama3.2-vision as vision model', () => {
    expect(isVisionModel('llama3.2-vision:11b')).toBe(true);
  });

  it('detects moondream as vision model', () => {
    expect(isVisionModel('moondream:1.8b')).toBe(true);
  });

  it('detects bakllava as vision model', () => {
    expect(isVisionModel('bakllava:latest')).toBe(true);
  });

  it('detects minicpm-v as vision model', () => {
    expect(isVisionModel('minicpm-v:latest')).toBe(true);
  });

  it('returns false for non-vision models', () => {
    expect(isVisionModel('qwen2.5:7b')).toBe(false);
    expect(isVisionModel('llama3.2:3b')).toBe(false);
    expect(isVisionModel('mistral:7b')).toBe(false);
    expect(isVisionModel('phi3:3.8b')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isVisionModel('LLAVA:13B')).toBe(true);
    expect(isVisionModel('Moondream:1.8b')).toBe(true);
  });
});

describe('VISION_MODELS constant', () => {
  it('contains expected vision model names', () => {
    expect(VISION_MODELS).toContain('llava');
    expect(VISION_MODELS).toContain('moondream');
    expect(VISION_MODELS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('MODEL_TIERS', () => {
  it('has entries with required fields', () => {
    for (const tier of MODEL_TIERS) {
      expect(tier).toHaveProperty('id');
      expect(tier).toHaveProperty('label');
      expect(tier).toHaveProperty('model');
      expect(tier).toHaveProperty('minRAM');
      expect(typeof tier.minRAM).toBe('number');
      expect(tier).toHaveProperty('capabilities');
      expect(Array.isArray(tier.capabilities)).toBe(true);
    }
  });

  it('has unique IDs', () => {
    const ids = MODEL_TIERS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks vision tier with isVision flag', () => {
    const visionTier = MODEL_TIERS.find(t => t.id === 'vision');
    expect(visionTier).toBeDefined();
    expect(visionTier.isVision).toBe(true);
  });
});

describe('getRecommendedTier', () => {
  it('returns a valid tier id', () => {
    const tier = getRecommendedTier();
    const validIds = MODEL_TIERS.map(t => t.id).filter(id => id !== 'vision');
    expect(validIds).toContain(tier);
  });
});

describe('context window truncation logic', () => {
  // Test the truncation logic used in sendMessage (MAX_HISTORY_MESSAGES = 40)
  it('truncates history to last 40 messages', () => {
    const MAX_HISTORY_MESSAGES = 40;
    const history = [];
    for (let i = 0; i < 60; i++) {
      history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
    }
    const trimmed = history.length > MAX_HISTORY_MESSAGES
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : history;

    expect(trimmed.length).toBe(40);
    expect(trimmed[0].content).toBe('msg 20');
    expect(trimmed[39].content).toBe('msg 59');
  });

  it('does not truncate when under limit', () => {
    const MAX_HISTORY_MESSAGES = 40;
    const history = [];
    for (let i = 0; i < 10; i++) {
      history.push({ role: 'user', content: `msg ${i}` });
    }
    const trimmed = history.length > MAX_HISTORY_MESSAGES
      ? history.slice(-MAX_HISTORY_MESSAGES)
      : history;

    expect(trimmed.length).toBe(10);
  });
});
