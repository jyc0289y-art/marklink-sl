// OfficeLink SL — Ollama Client (Local LLM Integration)
// Adapted from T1.15wc security consultation agent architecture

const OLLAMA_DEFAULT = 'http://localhost:11434';
const OLLAMA_URL_KEY = 'marklink-ollama-url';

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
 * Check if Ollama is running
 */
export async function checkOllamaStatus() {
  try {
    const res = await fetch(getOllamaBase(), { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const text = await res.text();
      return { running: text.includes('Ollama'), version: text };
    }
    return { running: false };
  } catch {
    return { running: false };
  }
}

/**
 * List installed models
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
 * Chat with Ollama — streaming response
 * @param {string} model
 * @param {Array} messages - chat history [{role, content, images?}]
 * @param {string} systemPrompt
 * @param {Function} onToken
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
