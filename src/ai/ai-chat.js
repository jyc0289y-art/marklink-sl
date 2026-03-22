// OfficeLink SL — AI Chat Panel (Local LLM powered office assistant)
// Architecture adapted from T1.15wc security consultation agent

import {
  checkOllamaStatus, listModels, pullModel, chat,
  MODEL_TIERS, getRecommendedTier, isVisionModel,
  setOllamaUrl, getOllamaUrl
} from './ollama-client.js';
import { t } from '../ui/i18n.js';

let panelEl, chatListEl, chatInputEl, modelSelectEl, statusDotEl;
let fullChatAreaEl, fullStatusDotEl, fullStatusTextEl, fullModelSelectEl;
let isOpen = false;
let isFullscreenMode = false; // true when AI tab is active
let history = [];
let selectedModel = '';
let ollamaReady = false;
let isSending = false; // prevent duplicate sends
let pendingImages = []; // base64 images to attach to next message (for vision models)

// ─── Office context providers (set by app.js) ──────────
let contextProviders = {};
export function setContextProviders(providers) {
  contextProviders = providers;
}

// ─── System prompt for office assistant ─────────────────
function getSystemPrompt() {
  return `You are OfficeLink AI, a helpful office assistant built into OfficeLink SL — a free web office suite.
You help users with:
- Writing, editing, and formatting documents
- Creating spreadsheet formulas and data analysis
- Designing presentations
- Translating text
- Summarizing content
- General writing assistance

When the user shares document content, analyze it and provide helpful suggestions.
When asked to generate content, provide it in a format suitable for the active editor.
For spreadsheet tasks, suggest formulas using standard Excel-compatible syntax.
Respond in the same language the user writes in.
Keep responses concise and actionable.`;
}

/**
 * Initialize AI Chat Panel
 */
export function initAiChat() {
  panelEl = document.getElementById('ai-panel');
  chatListEl = document.getElementById('ai-chat-list');
  chatInputEl = document.getElementById('ai-chat-input');
  modelSelectEl = document.getElementById('ai-model-select');
  statusDotEl = document.getElementById('ai-status-dot');
  if (!panelEl) return;

  // Toggle button
  document.getElementById('btn-ai')?.addEventListener('click', togglePanel);
  document.getElementById('ai-panel-close')?.addEventListener('click', togglePanel);

  // Send
  document.getElementById('ai-send-btn')?.addEventListener('click', sendMessage);
  chatInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Context buttons
  document.getElementById('ai-ctx-doc')?.addEventListener('click', () => insertContext('document'));
  document.getElementById('ai-ctx-sheet')?.addEventListener('click', () => insertContext('sheet'));
  document.getElementById('ai-ctx-pdf')?.addEventListener('click', () => insertContext('pdf'));
  document.getElementById('ai-ctx-selection')?.addEventListener('click', () => insertContext('selection'));

  // Insert AI response into editor
  document.getElementById('ai-insert-btn')?.addEventListener('click', insertLastResponse);

  // Setup button
  document.getElementById('ai-setup-btn')?.addEventListener('click', showSetupModal);

  // Model select
  modelSelectEl?.addEventListener('change', () => {
    selectedModel = modelSelectEl.value;
    localStorage.setItem('marklink-ai-model', selectedModel);
  });

  // Clear
  document.getElementById('ai-clear-btn')?.addEventListener('click', () => {
    history = [];
    if (chatListEl) chatListEl.innerHTML = '';
    currentSessionId = '';
    addSystemMessage('Chat cleared.');
  });

  // Sessions
  document.getElementById('ai-sessions-btn')?.addEventListener('click', showSessionsModal);

  // Restore saved model
  selectedModel = localStorage.getItem('marklink-ai-model') || '';

  // Full-screen AI tab elements
  fullChatAreaEl = document.getElementById('ai-full-chat-area');
  fullStatusDotEl = document.getElementById('ai-full-status-dot');
  fullStatusTextEl = document.getElementById('ai-full-status-text');
  fullModelSelectEl = document.getElementById('ai-full-model-select');

  // Full-screen buttons
  document.getElementById('ai-full-setup-btn')?.addEventListener('click', showSetupModal);
  document.getElementById('ai-full-sessions-btn')?.addEventListener('click', showSessionsModal);

  // Sync full-screen model select
  if (fullModelSelectEl) {
    fullModelSelectEl.addEventListener('change', () => {
      selectedModel = fullModelSelectEl.value;
      localStorage.setItem('marklink-ai-model', selectedModel);
      if (modelSelectEl) modelSelectEl.value = selectedModel;
    });
  }

  // ─── URL Settings Panel ───────────────────────────────
  initUrlSettings();

  // Check Ollama status & restore session
  checkStatus().then(() => restoreLastSession());
}

// ─── URL Settings ────────────────────────────────────────

function initUrlSettings() {
  const settingsBtn = document.getElementById('ai-url-settings-btn');
  const settingsPanel = document.getElementById('ai-url-settings');
  const urlInput = document.getElementById('ai-ollama-url-input');
  const saveBtn = document.getElementById('ai-url-save-btn');
  const resetBtn = document.getElementById('ai-url-reset-btn');

  if (!settingsBtn || !settingsPanel) return;

  // Populate current URL
  if (urlInput) urlInput.value = getOllamaUrl();

  // Toggle settings panel
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    if (!settingsPanel.classList.contains('hidden') && urlInput) {
      urlInput.value = getOllamaUrl();
      updateUrlStatusDot();
    }
  });

  // Save URL
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newUrl = urlInput?.value?.trim();
      if (!newUrl) return;
      setOllamaUrl(newUrl);
      addSystemMessage(`Ollama URL set to: ${newUrl}`);
      // Re-check connection with new URL
      await checkStatus();
      updateUrlStatusDot();
    });
  }

  // Reset to default
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      setOllamaUrl('');
      if (urlInput) urlInput.value = 'http://localhost:11434';
      addSystemMessage('Ollama URL reset to localhost:11434');
      await checkStatus();
      updateUrlStatusDot();
    });
  }
}

function updateUrlStatusDot() {
  const dot = document.getElementById('ai-url-status-dot');
  if (dot) {
    dot.className = `ai-url-dot ${ollamaReady ? 'online' : 'offline'}`;
    dot.title = ollamaReady ? 'Connected' : 'Not connected';
  }
}

async function checkStatus() {
  const status = await checkOllamaStatus();
  ollamaReady = status.running;
  updateStatusUI(status.running);
  updateUrlStatusDot();

  if (status.running) {
    const models = await listModels();
    populateModelSelect(models);
  }
}

function updateStatusUI(running) {
  if (statusDotEl) {
    statusDotEl.className = `ai-status-dot ${running ? 'online' : 'offline'}`;
    statusDotEl.title = running ? 'Ollama is running' : 'Ollama is not running — click AI Setup';
  }
  // Sync full-screen status
  if (fullStatusDotEl) {
    fullStatusDotEl.className = `ai-status-dot ${running ? 'online' : 'offline'}`;
  }
  if (fullStatusTextEl) {
    fullStatusTextEl.textContent = running ? 'Ollama is running' : 'Ollama is not running';
  }
}

function populateModelSelect(models) {
  if (!modelSelectEl) return;
  modelSelectEl.innerHTML = '';

  if (models.length === 0) {
    modelSelectEl.innerHTML = '<option value="">No models installed</option>';
    return;
  }

  const recommended = getRecommendedTier();
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    modelSelectEl.appendChild(opt);
  }

  // Try to restore saved model or pick first
  if (selectedModel && models.find(m => m.name === selectedModel)) {
    modelSelectEl.value = selectedModel;
  } else if (models.length > 0) {
    selectedModel = models[0].name;
    modelSelectEl.value = selectedModel;
  }

  // Sync full-screen model select
  if (fullModelSelectEl) {
    fullModelSelectEl.innerHTML = modelSelectEl.innerHTML;
    fullModelSelectEl.value = modelSelectEl.value;
  }
}

function togglePanel() {
  isOpen = !isOpen;
  panelEl?.classList.toggle('open', isOpen);
  if (isOpen && !ollamaReady) {
    checkStatus();
  }
}

// ─── Messages ───────────────────────────────────────────

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-user';
  div.textContent = text;
  chatListEl?.appendChild(div);
  scrollToBottom();
}

function addAiMessage(text) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-ai';
  div.innerHTML = renderMarkdown(text);
  chatListEl?.appendChild(div);
  scrollToBottom();
  return div;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-system';
  div.textContent = text;
  chatListEl?.appendChild(div);
  scrollToBottom();
}

function createStreamingMessage() {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-ai streaming';
  div.innerHTML = '<span class="ai-typing"></span>';
  chatListEl?.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  if (chatListEl) chatListEl.scrollTop = chatListEl.scrollHeight;
}

function renderMarkdown(text) {
  // Basic markdown rendering for chat
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ─── Send Message ───────────────────────────────────────

async function sendMessage() {
  if (isSending) return; // prevent duplicate sends
  const text = chatInputEl?.value?.trim();
  if (!text) return;

  if (!ollamaReady) {
    addSystemMessage('Ollama is not running. Click "AI Setup" to install and start.');
    return;
  }
  if (!selectedModel) {
    addSystemMessage('No model selected. Please install a model first.');
    return;
  }

  isSending = true;
  chatInputEl.value = '';
  addUserMessage(text);

  // Attach pending images (from PDF vision context) to this message
  const msg = { role: 'user', content: text };
  if (pendingImages.length > 0 && isVisionModel(selectedModel)) {
    msg.images = pendingImages;
    pendingImages = [];
  }
  history.push(msg);

  // Save session
  saveSession();

  const streamDiv = createStreamingMessage();

  try {
    const result = await chat(selectedModel, history, getSystemPrompt(), (token, full) => {
      streamDiv.innerHTML = renderMarkdown(full);
      streamDiv.classList.remove('streaming');
      scrollToBottom();
    });

    history.push({ role: 'assistant', content: result.content });

    // Show token stats
    if (result.tokenStats) {
      const stats = result.tokenStats;
      const statsEl = document.createElement('div');
      statsEl.className = 'ai-token-stats';
      statsEl.textContent = `${stats.promptTokens + stats.completionTokens} tokens · ${stats.totalDurationMs}ms · ${stats.model}`;
      streamDiv.appendChild(statsEl);
    }

    // Save session after AI response
    saveSession();
  } catch (e) {
    streamDiv.innerHTML = `<span class="ai-error">Error: ${e.message}</span>`;
    streamDiv.classList.remove('streaming');
  } finally {
    isSending = false;
  }
}

// ─── Context Injection ──────────────────────────────────

async function insertContext(type) {
  if (!chatInputEl) return;

  let content = '';
  if (type === 'document' && contextProviders.getDocContent) {
    content = contextProviders.getDocContent();
    if (content) {
      // Strip HTML tags for clean text
      const tmp = document.createElement('div');
      tmp.innerHTML = content;
      content = tmp.textContent || tmp.innerText;
    }
  } else if (type === 'sheet' && contextProviders.getSheetText) {
    content = contextProviders.getSheetText();
  } else if (type === 'pdf') {
    // Vision model: attach PDF pages as images for formula/table/image recognition
    if (isVisionModel(selectedModel) && contextProviders.getPdfImages) {
      const images = await contextProviders.getPdfImages();
      if (images.length > 0) {
        // Store images to attach to the next message
        pendingImages = images.map(img => img.base64);
        const textContent = contextProviders.getPdfText ? await contextProviders.getPdfText() : '';
        if (textContent) {
          chatInputEl.value += `\n---\n[PDF text]:\n${textContent.substring(0, 3000)}\n---\n`;
        }
        addSystemMessage(`PDF attached as ${images.length} page image(s) + text. Vision model will analyze formulas/tables/images.`);
        chatInputEl.focus();
        return;
      }
    }
    // Fallback: text-only extraction
    if (contextProviders.getPdfText) {
      content = await contextProviders.getPdfText();
      if (!content) {
        addSystemMessage('No text extracted from PDF. For formulas/images, use a vision model (llava, llama3.2-vision). Install via AI Setup.');
        return;
      }
    }
  } else if (type === 'selection') {
    const sel = window.getSelection();
    content = sel ? sel.toString() : '';
  }

  if (!content) {
    addSystemMessage(`No ${type} content to attach.`);
    return;
  }

  // Truncate if too long
  if (content.length > 5000) {
    content = content.substring(0, 5000) + '\n...(truncated)';
  }

  chatInputEl.value += `\n---\n[${type} content]:\n${content}\n---\n`;
  chatInputEl.focus();
  addSystemMessage(`${type} content attached (${content.length} chars).`);
}

function insertLastResponse() {
  if (history.length === 0) return;
  const lastAi = [...history].reverse().find(m => m.role === 'assistant');
  if (!lastAi) return;

  if (contextProviders.insertContent) {
    contextProviders.insertContent(lastAi.content);
    addSystemMessage('Response inserted into editor.');
  }
}

// ─── Setup Modal ────────────────────────────────────────

function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'win';
  return 'linux';
}

async function showSetupModal() {
  // Remove existing
  document.querySelector('.ai-setup-modal')?.remove();

  const status = await checkOllamaStatus();
  const models = status.running ? await listModels() : [];
  const recommended = getRecommendedTier();
  const ram = navigator.deviceMemory || '(unknown)';
  const detectedOS = detectOS();

  const modal = document.createElement('div');
  modal.className = 'ai-setup-modal';

  const installedNames = models.map(m => m.name);

  modal.innerHTML = `
    <div class="ai-setup-content">
      <div class="ai-setup-header">
        <h3>AI Setup</h3>
        <button class="ai-setup-close">&times;</button>
      </div>

      <div class="ai-setup-body">
        <div class="ai-setup-status ${status.running ? 'online' : 'offline'}">
          <span class="ai-status-icon">${status.running ? '✅' : '❌'}</span>
          <span>${status.running ? 'Ollama is running' : 'Ollama is not running'}</span>
        </div>

        ${!status.running ? `
        <div class="ai-install-section">
          <h4 style="font-size:16px;margin-bottom:4px">AI 설치 가이드</h4>
          <p class="ai-install-desc" style="margin-bottom:16px">
            내 PC에서 무료로 동작하는 AI를 설치합니다. <strong>약 5분</strong>이면 완료됩니다.
          </p>

          <!-- OS Detection -->
          <div class="ai-os-tabs">
            <button class="ai-os-tab ${detectedOS === 'mac' ? 'active' : ''}" data-os="mac">macOS</button>
            <button class="ai-os-tab ${detectedOS === 'win' ? 'active' : ''}" data-os="win">Windows</button>
            <button class="ai-os-tab ${detectedOS === 'linux' ? 'active' : ''}" data-os="linux">Linux</button>
          </div>

          <!-- Wizard Steps -->
          <div class="ai-wizard-steps">
            <!-- Step 1: Download -->
            <div class="ai-wizard-step active">
              <div class="ai-step-num">1</div>
              <div class="ai-step-body">
                <div class="ai-step-title">Ollama 다운로드</div>
                <div class="ai-step-desc">
                  Ollama는 AI를 내 PC에서 실행하는 무료 프로그램입니다.<br>
                  설치 파일 크기: 약 300MB (1회만 다운로드)
                </div>
                <div class="ai-step-action">
                  <a href="https://ollama.com/download" target="_blank" rel="noopener" class="ai-install-btn"
                     id="ai-download-link"
                     style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;font-size:14px">
                    <span style="font-size:20px">⬇</span> 무료 다운로드
                  </a>
                </div>
              </div>
            </div>

            <!-- Step 2: Install -->
            <div class="ai-wizard-step">
              <div class="ai-step-num">2</div>
              <div class="ai-step-body">
                <div class="ai-step-title">설치하기</div>
                <div class="ai-step-desc ai-os-content" data-os="mac">
                  <strong>1.</strong> 다운로드된 <code>Ollama-darwin.zip</code> 파일을 더블 클릭<br>
                  <strong>2.</strong> <code>Ollama.app</code>을 <strong>응용 프로그램</strong> 폴더로 드래그<br>
                  <strong>3.</strong> Ollama 앱을 실행하면 메뉴바에 아이콘이 나타납니다<br>
                  <span style="color:#4caf50">→ macOS는 설치 후 자동으로 실행됩니다!</span>
                </div>
                <div class="ai-step-desc ai-os-content" data-os="win" style="display:none">
                  <strong>1.</strong> 다운로드된 <code>OllamaSetup.exe</code>를 더블 클릭<br>
                  <strong>2.</strong> "Install" 버튼 클릭 (약 1분 소요)<br>
                  <strong>3.</strong> 설치 완료 후 시스템 트레이에 아이콘이 나타납니다<br>
                  <span style="color:#4caf50">→ Windows는 설치 후 자동으로 실행됩니다!</span>
                </div>
                <div class="ai-step-desc ai-os-content" data-os="linux" style="display:none">
                  터미널에서 아래 명령어를 실행하세요:<br>
                  <code style="display:block;margin:6px 0;padding:8px;background:var(--pane-header-bg);border-radius:6px;font-size:12px">curl -fsSL https://ollama.com/install.sh | sh</code>
                  설치 후 <code>ollama serve</code>로 실행합니다.
                </div>
              </div>
            </div>

            <!-- Step 3: Connect -->
            <div class="ai-wizard-step">
              <div class="ai-step-num">3</div>
              <div class="ai-step-body">
                <div class="ai-step-title">연결 확인</div>
                <div class="ai-step-desc">
                  설치와 실행이 완료되면 아래 버튼을 눌러 연결 상태를 확인하세요.
                </div>
                <div class="ai-step-action">
                  <button class="ai-install-btn" id="ai-check-connection"
                    style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;font-size:13px;border:none;cursor:pointer">
                    <span style="font-size:16px">🔍</span> 연결 확인하기
                  </button>
                </div>
                <div id="ai-check-result" style="margin-top:8px"></div>
                <div id="ai-auto-scan" style="display:none;margin-top:8px">
                  <span class="ai-scanning">
                    <span class="ai-scanning-dot"></span>
                    Ollama 연결을 자동으로 감지하고 있습니다...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Comparison -->
          <details style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px">
            <summary style="font-size:13px;cursor:pointer;color:var(--text-primary);font-weight:500">
              유료 AI(ChatGPT, Claude)와 무엇이 다른가요?
            </summary>
            <table class="ai-compare-table">
              <tr>
                <th style="text-align:left"></th>
                <th>OfficeLink AI<br><span style="font-size:10px;color:#4caf50">내 PC</span></th>
                <th>ChatGPT / Claude<br><span style="font-size:10px">클라우드</span></th>
              </tr>
              <tr><td>월 비용</td><td class="win" style="text-align:center">무료</td><td style="text-align:center">$20~25/월</td></tr>
              <tr><td>내 데이터</td><td class="win" style="text-align:center">PC에서만 처리</td><td style="text-align:center">서버로 전송</td></tr>
              <tr><td>오프라인 사용</td><td class="win" style="text-align:center">가능</td><td style="text-align:center">불가</td></tr>
              <tr><td>속도</td><td style="text-align:center">PC에 따라 다름</td><td class="win" style="text-align:center">빠름</td></tr>
              <tr><td>문서 분석</td><td class="win" style="text-align:center">가능</td><td class="win" style="text-align:center">가능</td></tr>
              <tr><td>시작하기</td><td style="text-align:center">5분 설치</td><td style="text-align:center">가입 + 결제</td></tr>
            </table>
          </details>
        </div>
        ` : ''}

        <div class="ai-model-section">
          <h4>AI 모델 선택 — PC 사양에 맞게 선택하세요</h4>
          <p class="ai-ram-info">감지된 RAM: <strong>${ram}GB</strong> · 추천 모델: <strong>${MODEL_TIERS.find(t => t.id === recommended)?.label || 'Standard'}</strong></p>

          <div class="ai-model-list">
            ${MODEL_TIERS.map(tier => {
              const installed = installedNames.some(n => n.startsWith(tier.model.split(':')[0]) && n.includes(tier.model.split(':')[1]));
              const isRec = tier.id === recommended;
              return `
              <div class="ai-model-card ${isRec ? 'recommended' : ''} ${installed ? 'installed' : ''}"
                title="${tier.capabilities ? '가능: ' + tier.capabilities.join(', ') + '\\n제한: ' + tier.limitations.join(', ') : ''}">
                <div class="ai-model-info">
                  <strong>${tier.label}</strong> ${isRec ? '<span class="ai-badge">Recommended</span>' : ''}
                  ${installed ? '<span class="ai-badge installed">Installed</span>' : ''}
                  ${tier.isVision ? '<span class="ai-badge" style="background:#9c27b0">Vision</span>' : ''}
                  <br><code>${tier.model}</code> · ${tier.size}
                  <br><small>${tier.desc}</small>
                  <br><small>최소 RAM: ${tier.minRAM}GB</small>
                  ${tier.capabilities ? `<br><small style="color:#4caf50">✓ ${tier.capabilities.join(' · ')}</small>` : ''}
                  ${tier.limitations ? `<br><small style="color:var(--text-secondary)">✗ ${tier.limitations.join(' · ')}</small>` : ''}
                </div>
                <div class="ai-model-actions">
                  ${!installed && status.running ? `
                    <button class="ai-pull-btn" data-model="${tier.model}"
                      title="이 모델을 다운로드합니다.&#10;용량: ${tier.size} (최초 1회)&#10;다운로드 후 영구 무료 사용">
                      Install
                    </button>
                  ` : installed ? '<span class="ai-check">✓</span>' : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="ai-progress-section hidden" id="ai-pull-progress">
          <div class="ai-progress-label" id="ai-pull-label">Downloading...</div>
          <div class="ai-progress-bar">
            <div class="ai-progress-fill" id="ai-pull-fill" style="width:0%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close
  modal.querySelector('.ai-setup-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // OS tab switching
  modal.querySelectorAll('.ai-os-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.ai-os-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const os = tab.dataset.os;
      modal.querySelectorAll('.ai-os-content').forEach(el => {
        el.style.display = el.dataset.os === os ? '' : 'none';
      });
    });
  });

  // Download link click — start auto-scan
  const downloadLink = modal.querySelector('#ai-download-link');
  if (downloadLink) {
    downloadLink.addEventListener('click', () => {
      // Mark step 1 as done, activate step 2
      const steps = modal.querySelectorAll('.ai-wizard-step');
      if (steps[0]) { steps[0].classList.add('done'); steps[0].classList.remove('active'); }
      if (steps[1]) steps[1].classList.add('active');

      // Start auto-scanning after a delay
      const autoScan = modal.querySelector('#ai-auto-scan');
      if (autoScan) autoScan.style.display = '';

      let scanCount = 0;
      const scanInterval = setInterval(async () => {
        scanCount++;
        const s = await checkOllamaStatus();
        if (s.running) {
          clearInterval(scanInterval);
          ollamaReady = true;
          updateStatusUI(true);
          modal.remove();
          showSetupModal();
        }
        if (scanCount > 60) clearInterval(scanInterval); // stop after 5 min
      }, 5000);
    });
  }

  // Connection check button
  const checkBtn = modal.querySelector('#ai-check-connection');
  const checkResult = modal.querySelector('#ai-check-result');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.innerHTML = '<span class="ai-scanning"><span class="ai-scanning-dot"></span> 확인 중...</span>';
      checkBtn.disabled = true;
      const s = await checkOllamaStatus();
      if (s.running) {
        // Mark all steps done
        modal.querySelectorAll('.ai-wizard-step').forEach(st => {
          st.classList.add('done');
          st.classList.remove('active');
        });
        checkResult.innerHTML = `
          <div style="background:rgba(76,175,80,0.1);padding:12px;border-radius:8px;margin-top:8px">
            <span style="font-size:24px">🎉</span>
            <strong style="color:#4caf50;font-size:14px"> 연결 성공!</strong><br>
            <span style="font-size:12px;color:var(--text-secondary)">아래에서 AI 모델을 선택하고 설치하면 바로 사용할 수 있습니다.</span>
          </div>`;
        ollamaReady = true;
        updateStatusUI(true);
        // Refresh after short delay to show install buttons
        setTimeout(() => { modal.remove(); showSetupModal(); }, 2000);
      } else {
        checkResult.innerHTML = `
          <div style="background:rgba(244,67,54,0.1);padding:12px;border-radius:8px;margin-top:8px">
            <strong style="color:#f44336">연결할 수 없습니다</strong><br>
            <span style="font-size:12px;line-height:1.8">
              아래 사항을 확인해주세요:<br>
              <strong>1.</strong> 위 1단계에서 Ollama를 다운로드했나요?<br>
              <strong>2.</strong> 다운로드된 파일을 실행(설치)했나요?<br>
              <strong>3.</strong> 설치 후 Ollama 앱이 실행되고 있나요?<br>
              <span style="color:var(--text-secondary)">macOS: 메뉴바에 라마 아이콘 확인<br>
              Windows: 시스템 트레이(우측 하단)에 아이콘 확인</span>
            </span>
          </div>`;
        checkBtn.innerHTML = '🔍 다시 확인하기';
        checkBtn.disabled = false;
      }
    });
  }

  // Pull buttons
  modal.querySelectorAll('.ai-pull-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modelName = btn.dataset.model;
      btn.disabled = true;
      btn.textContent = 'Downloading...';

      const progressSection = document.getElementById('ai-pull-progress');
      const progressLabel = document.getElementById('ai-pull-label');
      const progressFill = document.getElementById('ai-pull-fill');
      progressSection?.classList.remove('hidden');

      try {
        await pullModel(modelName, (data) => {
          if (data.total && data.completed) {
            const pct = Math.round((data.completed / data.total) * 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressLabel) progressLabel.textContent = `${data.status || 'Downloading'} — ${pct}%`;
          } else if (data.status) {
            if (progressLabel) progressLabel.textContent = data.status;
          }
        });

        btn.textContent = '✓ Installed';
        if (progressLabel) progressLabel.textContent = 'Download complete!';

        // Refresh model list
        const newModels = await listModels();
        populateModelSelect(newModels);
        ollamaReady = true;
        updateStatusUI(true);
      } catch (e) {
        btn.textContent = 'Error';
        if (progressLabel) progressLabel.textContent = `Error: ${e.message}`;
      }
    });
  });
}

// ─── Session Management ─────────────────────────────────
// Adapted from T1.15wc: localStorage-based chat sessions
// with context preservation across sessions and fork capability

const SESSION_STORAGE_KEY = 'marklink-ai-sessions';
const CURRENT_SESSION_KEY = 'marklink-ai-current-session';

let currentSessionId = '';

function generateSessionId() {
  const now = new Date();
  return `S${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
}

function getAllSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveSession() {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
    localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
  }
  const sessions = getAllSessions();
  sessions[currentSessionId] = {
    id: currentSessionId,
    model: selectedModel,
    history: history,
    createdAt: sessions[currentSessionId]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: history.length,
    forkedFrom: sessions[currentSessionId]?.forkedFrom || null,
    title: history.find(m => m.role === 'user')?.content?.substring(0, 50) || 'New Chat',
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

function loadSession(sessionId) {
  const sessions = getAllSessions();
  const session = sessions[sessionId];
  if (!session) return false;

  currentSessionId = sessionId;
  localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
  history = session.history || [];
  selectedModel = session.model || selectedModel;

  // Rebuild chat UI
  if (chatListEl) chatListEl.innerHTML = '';
  addSystemMessage(`Session loaded: ${session.title} (${session.messageCount} messages)`);

  for (const msg of history) {
    if (msg.role === 'user') addUserMessage(msg.content);
    else if (msg.role === 'assistant') addAiMessage(msg.content);
  }

  if (modelSelectEl && session.model) modelSelectEl.value = session.model;
  return true;
}

function forkSession(sourceSessionId) {
  const sessions = getAllSessions();
  const source = sessions[sourceSessionId];
  if (!source) return null;

  const newId = generateSessionId();
  currentSessionId = newId;
  history = [...source.history];
  selectedModel = source.model || selectedModel;

  sessions[newId] = {
    id: newId,
    model: selectedModel,
    history: history,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: history.length,
    forkedFrom: sourceSessionId,
    title: `Fork of ${source.title}`,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  localStorage.setItem(CURRENT_SESSION_KEY, newId);

  // Rebuild chat UI
  if (chatListEl) chatListEl.innerHTML = '';
  addSystemMessage(`Forked from session "${source.title}". Context preserved (${history.length} messages).`);

  for (const msg of history) {
    if (msg.role === 'user') addUserMessage(msg.content);
    else if (msg.role === 'assistant') addAiMessage(msg.content);
  }

  return newId;
}

function deleteSession(sessionId) {
  const sessions = getAllSessions();
  delete sessions[sessionId];
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  if (currentSessionId === sessionId) {
    currentSessionId = '';
    history = [];
    if (chatListEl) chatListEl.innerHTML = '';
    addSystemMessage('Session deleted. New chat started.');
  }
}

function showSessionsModal() {
  document.querySelector('.ai-sessions-modal')?.remove();

  const sessions = getAllSessions();
  const sessionList = Object.values(sessions).sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const modal = document.createElement('div');
  modal.className = 'ai-setup-modal ai-sessions-modal';
  modal.innerHTML = `
    <div class="ai-setup-content">
      <div class="ai-setup-header">
        <h3>Chat Sessions</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="ai-pull-btn" id="ai-new-session">+ New Session</button>
        </div>
        ${sessionList.length === 0 ? '<p style="color:var(--text-secondary)">No saved sessions.</p>' : ''}
        <div class="ai-model-list">
          ${sessionList.map(s => `
            <div class="ai-model-card ${s.id === currentSessionId ? 'recommended' : ''}">
              <div class="ai-model-info">
                <strong>${escapeHtml(s.title)}</strong>
                ${s.forkedFrom ? `<span class="ai-badge">Forked</span>` : ''}
                ${s.id === currentSessionId ? '<span class="ai-badge installed">Current</span>' : ''}
                <br><small>${s.messageCount} messages · ${s.model || 'unknown model'}</small>
                <br><small>${new Date(s.updatedAt).toLocaleString()}</small>
                ${s.forkedFrom ? `<br><small>Forked from: ${s.forkedFrom}</small>` : ''}
              </div>
              <div class="ai-model-actions" style="display:flex;gap:4px;flex-direction:column">
                <button class="ai-pull-btn ai-load-session" data-sid="${s.id}"
                  title="${t('session.load')}">Load</button>
                <button class="ai-pull-btn ai-fork-session" data-sid="${s.id}" style="font-size:11px"
                  title="${t('session.fork')}">Fork</button>
                <button class="ai-pull-btn ai-delete-session" data-sid="${s.id}" style="font-size:11px;color:#f44336;border-color:#f44336"
                  title="${t('session.delete')}">Del</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.ai-setup-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#ai-new-session')?.addEventListener('click', () => {
    currentSessionId = '';
    history = [];
    if (chatListEl) chatListEl.innerHTML = '';
    addSystemMessage('New chat session started.');
    modal.remove();
  });

  modal.querySelectorAll('.ai-load-session').forEach(btn => {
    btn.addEventListener('click', () => {
      loadSession(btn.dataset.sid);
      modal.remove();
    });
  });

  modal.querySelectorAll('.ai-fork-session').forEach(btn => {
    btn.addEventListener('click', () => {
      forkSession(btn.dataset.sid);
      modal.remove();
    });
  });

  modal.querySelectorAll('.ai-delete-session').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this session?')) {
        deleteSession(btn.dataset.sid);
        modal.remove();
        showSessionsModal(); // refresh
      }
    });
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Auto-restore last session on init
function restoreLastSession() {
  const lastId = localStorage.getItem(CURRENT_SESSION_KEY);
  if (lastId) {
    const sessions = getAllSessions();
    if (sessions[lastId]) {
      loadSession(lastId);
      return;
    }
  }
}

// ─── Fullscreen AI Tab Mode ─────────────────────────────

/**
 * Enter fullscreen mode — move chat elements into the AI tab view
 */
function enterAiFullscreen() {
  if (isFullscreenMode) return;
  isFullscreenMode = true;

  // Close sidebar panel if open
  if (isOpen) {
    isOpen = false;
    panelEl?.classList.remove('open');
  }

  if (!fullChatAreaEl || !panelEl) return;

  // Clone chat content into fullscreen area
  // Move the actual panel elements for state preservation
  const chatContent = panelEl.querySelector('.ai-chat-list');
  const inputArea = panelEl.querySelector('.ai-input-area');
  const bottomActions = panelEl.querySelector('.ai-bottom-actions');

  if (chatContent && inputArea) {
    fullChatAreaEl.innerHTML = '';
    // Create fullscreen chat wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-full-chat-wrapper';
    wrapper.id = 'ai-full-wrapper';

    // Move elements
    wrapper.appendChild(chatContent);
    wrapper.appendChild(inputArea);
    if (bottomActions) wrapper.appendChild(bottomActions);
    fullChatAreaEl.appendChild(wrapper);
  }

  // Refresh status
  if (!ollamaReady) checkStatus();
}

/**
 * Exit fullscreen mode — move chat elements back to sidebar panel
 */
function exitAiFullscreen() {
  if (!isFullscreenMode) return;
  isFullscreenMode = false;

  if (!fullChatAreaEl || !panelEl) return;

  // Move elements back to sidebar panel
  const chatContent = fullChatAreaEl.querySelector('.ai-chat-list');
  const inputArea = fullChatAreaEl.querySelector('.ai-input-area');
  const bottomActions = fullChatAreaEl.querySelector('.ai-bottom-actions');
  const header = panelEl.querySelector('.ai-panel-header');

  if (chatContent && inputArea) {
    // Insert after header
    if (header) {
      header.after(chatContent);
      chatContent.after(inputArea);
      if (bottomActions) inputArea.after(bottomActions);
    } else {
      panelEl.appendChild(chatContent);
      panelEl.appendChild(inputArea);
      if (bottomActions) panelEl.appendChild(bottomActions);
    }
  }

  // Clear fullscreen area
  fullChatAreaEl.innerHTML = '';
}

// Export for external use
export { togglePanel as toggleAiPanel, showSessionsModal, enterAiFullscreen, exitAiFullscreen };
