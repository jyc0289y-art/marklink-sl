// OfficeLink SL — Ollama Client (Local LLM Integration)
// Adapted from T1.15wc security consultation agent architecture

const OLLAMA_DEFAULT = 'http://localhost:11434';
const OLLAMA_URL_KEY = 'marklink-ollama-url';
const OLLAMA_MODEL_KEY = 'marklink-ai-model';
const API_KEY_STORAGE_KEY = 'marklink-ai-apikey';
const CLOUD_ENDPOINT_KEY = 'marklink-ai-cloud-endpoint';

function getOllamaBase() {
  return localStorage.getItem(OLLAMA_URL_KEY) || OLLAMA_DEFAULT;
}

export function setOllamaUrl(url) {
  if (url && url.trim()) {
    // Remove trailing slash
    const cleaned = url.trim().replace(/\/+$/, '');
    localStorage.setItem(OLLAMA_URL_KEY, cleaned);
  } else {
    localStorage.removeItem(OLLAMA_URL_KEY);
  }
}

export function getOllamaUrl() {
  return getOllamaBase();
}

/**
 * Save selected model to localStorage
 */
export function saveSelectedModel(model) {
  localStorage.setItem(OLLAMA_MODEL_KEY, model);
}

/**
 * Get saved model from localStorage
 */
export function getSavedModel() {
  return localStorage.getItem(OLLAMA_MODEL_KEY) || '';
}

// Model tiers matched to PC specs
export const MODEL_TIERS = [
  {
    id: 'small',
    label: 'Light (1.5B)',
    model: 'qwen2.5:1.5b',
    minRAM: 4,
    size: '~1GB',
    desc: '가벼운 모델 — 4GB RAM 이상, 빠른 응답',
    capabilities: ['문서 작성', '번역', '요약'],
    limitations: ['복잡한 분석 어려움', '이미지 인식 불가'],
  },
  {
    id: 'medium',
    label: 'Standard (7B)',
    model: 'qwen2.5:7b',
    minRAM: 8,
    size: '~4.5GB',
    desc: '균형 잡힌 모델 — 8GB RAM 이상 권장',
    capabilities: ['문서 작성', '번역', '요약', '코드 작성', '데이터 분석'],
    limitations: ['이미지 인식 불가'],
  },
  {
    id: 'large',
    label: 'Pro (14B)',
    model: 'qwen2.5:14b',
    minRAM: 16,
    size: '~9GB',
    desc: '고성능 모델 — 16GB RAM 이상 권장',
    capabilities: ['문서 작성', '번역', '요약', '코드 작성', '데이터 분석', '논문 분석'],
    limitations: ['이미지 인식 불가'],
  },
  {
    id: 'xlarge',
    label: 'Ultra (32B)',
    model: 'qwen2.5:32b',
    minRAM: 32,
    size: '~20GB',
    desc: '최고 성능 — 32GB RAM 이상 권장',
    capabilities: ['문서 작성', '번역', '요약', '코드 작성', '데이터 분석', '논문 분석', '복잡한 추론'],
    limitations: ['이미지 인식 불가'],
  },
  {
    id: 'vision',
    label: 'Vision (11B)',
    model: 'llama3.2-vision:11b',
    minRAM: 16,
    size: '~7GB',
    desc: 'PDF 수식/표/그림 인식 — 이미지 분석 전용',
    capabilities: ['이미지 인식', 'PDF 수식 분석', '표 읽기', '그림 설명', '문서 작성'],
    limitations: ['텍스트 전용 모델보다 일반 작문 능력 낮음'],
    isVision: true,
  },
];

/**
 * Detect device RAM and recommend model tier
 */
export function getRecommendedTier() {
  const ram = navigator.deviceMemory || 8; // default 8GB if API unavailable
  if (ram >= 32) return 'xlarge';
  if (ram >= 16) return 'large';
  if (ram >= 8) return 'medium';
  return 'small';
}

/**
 * Check if Ollama is running — returns { running, version, corsError }
 */
export async function checkOllamaStatus(customUrl) {
  const base = customUrl || getOllamaBase();
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const text = await res.text();
      return { running: text.includes('Ollama'), version: text, corsError: false };
    }
    return { running: false, corsError: false };
  } catch (e) {
    // Distinguish CORS errors from connection failures
    const isCors = e instanceof TypeError && e.message.includes('Failed to fetch');
    return { running: false, corsError: isCors };
  }
}

/**
 * Test connection to a specific URL — returns detailed result
 */
export async function testConnection(url) {
  const target = url || getOllamaBase();
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('Ollama')) {
        // Also try to list models
        const models = await listModels();
        return {
          success: true,
          message: `Connected to Ollama at ${target}`,
          modelCount: models.length,
          models,
        };
      }
    }
    return { success: false, message: `Server responded but is not Ollama`, corsError: false };
  } catch (e) {
    const isCors = e instanceof TypeError && e.message.includes('Failed to fetch');
    return {
      success: false,
      message: isCors
        ? 'Connection blocked by CORS. Set OLLAMA_ORIGINS=* and restart Ollama.'
        : `Cannot reach ${target}. Is Ollama running?`,
      corsError: isCors,
    };
  }
}

/**
 * Format model size from bytes to human readable
 */
export function formatModelSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * List all models installed on the Ollama server. Queries the /api/tags endpoint
 * with a 5-second timeout. Returns an empty array on connection failure.
 *
 * @returns {Promise<{name: string, size: number, digest: string, modified_at: string}[]>}
 *   Array of model objects, or empty array if unavailable
 */
export async function listModels() {
  try {
    const res = await fetch(`${getOllamaBase()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

/**
 * Pull (download) a model — returns a ReadableStream for progress
 */
export async function pullModel(modelName, onProgress) {
  const res = await fetch(`${getOllamaBase()}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const data = JSON.parse(line);
        if (onProgress) onProgress(data);
      } catch { /* skip partial JSON */ }
    }
  }
}

// Vision-capable models that support image input
export const VISION_MODELS = ['llava', 'llama3.2-vision', 'moondream', 'bakllava', 'minicpm-v'];

/**
 * Check if a model name indicates vision capability
 */
export function isVisionModel(modelName) {
  return VISION_MODELS.some(v => modelName.toLowerCase().includes(v));
}

/**
 * Chat with Ollama using streaming response. Sends messages to the local Ollama
 * server and streams tokens back via the onToken callback. Automatically prepends
 * the system prompt to the message history.
 *
 * @param {string} model - Model name (e.g. "qwen2.5:7b", "llama3.2-vision:11b")
 * @param {{role: string, content: string, images?: string[]}[]} messages - Chat history
 * @param {string} systemPrompt - System prompt to prepend to the conversation
 * @param {(token: string, fullContent: string) => void} onToken - Callback invoked per streamed token
 * @returns {Promise<{content: string, tokenStats: {promptTokens: number, completionTokens: number, totalDurationMs: number, model: string}|null}>}
 * @throws {Error} If the Ollama server returns a non-OK response
 */
export async function chat(model, messages, systemPrompt, onToken) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
  };

  const res = await fetch(`${getOllamaBase()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let tokenStats = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          fullContent += data.message.content;
          if (onToken) onToken(data.message.content, fullContent);
        }
        if (data.done) {
          tokenStats = {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalDurationMs: Math.round((data.total_duration || 0) / 1_000_000),
            model,
          };
        }
      } catch { /* skip partial JSON */ }
    }
  }

  return { content: fullContent, tokenStats };
}

/**
 * Get detailed info for a specific model
 */
export async function getModelInfo(modelName) {
  try {
    const res = await fetch(`${getOllamaBase()}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Stream chat with abort support — sends messages to Ollama or an OpenAI-compatible
 * cloud endpoint and streams tokens back. Supports both local Ollama format and
 * OpenAI SSE format (for cloud endpoints configured via setCloudEndpoint).
 * Includes API key authentication when configured.
 *
 * @param {string} model - Model name to use
 * @param {{role: string, content: string, images?: string[]}[]} messages - Chat history
 * @param {string} systemPrompt - System prompt to prepend
 * @param {(token: string, fullContent: string) => void} onToken - Per-token callback
 * @param {AbortSignal} [abortSignal] - Optional AbortSignal to cancel the request
 * @returns {Promise<{content: string, tokenStats: Object|null, aborted: boolean}>}
 * @throws {Error} If the server returns a non-OK response (unless aborted)
 */
export async function streamChat(model, messages, systemPrompt, onToken, abortSignal) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
  };

  const headers = { 'Content-Type': 'application/json' };
  const apiKey = getApiKey();
  const cloudEndpoint = getCloudEndpoint();
  const baseUrl = cloudEndpoint || getOllamaBase();

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const fetchOpts = {
    method: 'POST',
    headers,
    body: JSON.stringify(cloudEndpoint ? { ...body, model } : body),
  };
  if (abortSignal) fetchOpts.signal = abortSignal;

  const endpoint = cloudEndpoint
    ? `${cloudEndpoint}/chat/completions`
    : `${baseUrl}/api/chat`;

  const res = await fetch(endpoint, fetchOpts);

  if (!res.ok) {
    throw new Error(`LLM error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let tokenStats = null;
  let aborted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });

      if (cloudEndpoint) {
        // OpenAI-compatible SSE format
        for (const line of text.split('\n').filter(Boolean)) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                if (onToken) onToken(delta, fullContent);
              }
              if (parsed.usage) {
                tokenStats = {
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                  totalDurationMs: 0,
                  model,
                };
              }
            } catch { /* skip partial */ }
          }
        }
      } else {
        // Ollama format
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              if (onToken) onToken(data.message.content, fullContent);
            }
            if (data.done) {
              tokenStats = {
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
                totalDurationMs: Math.round((data.total_duration || 0) / 1_000_000),
                model,
              };
            }
          } catch { /* skip partial JSON */ }
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      aborted = true;
    } else {
      throw e;
    }
  }

  return { content: fullContent, tokenStats, aborted };
}

// ─── API Key / Cloud Endpoint Support ───────────────────

export function setApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

export function setCloudEndpoint(url) {
  if (url && url.trim()) {
    localStorage.setItem(CLOUD_ENDPOINT_KEY, url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem(CLOUD_ENDPOINT_KEY);
  }
}

export function getCloudEndpoint() {
  return localStorage.getItem(CLOUD_ENDPOINT_KEY) || '';
}

/**
 * Measure connection latency to Ollama
 */
export async function measureLatency() {
  const base = getOllamaBase();
  const start = performance.now();
  try {
    await fetch(base, { signal: AbortSignal.timeout(5000) });
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  }
}

/**
 * Get Ollama server version
 */
export async function getServerVersion() {
  try {
    const res = await fetch(`${getOllamaBase()}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}
