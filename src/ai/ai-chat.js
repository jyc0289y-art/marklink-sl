// OfficeLink SL — AI Chat Panel (Local LLM powered office assistant)
// Architecture adapted from T1.15wc security consultation agent

import {
  checkOllamaStatus, listModels, pullModel, chat, testConnection,
  MODEL_TIERS, getRecommendedTier, isVisionModel, formatModelSize,
  setOllamaUrl, getOllamaUrl, saveSelectedModel, getSavedModel,
  setApiKey, getApiKey, setCloudEndpoint, getCloudEndpoint,
  measureLatency, getServerVersion, getModelInfo, streamChat
} from './ollama-client.js';
import { t } from '../ui/i18n.js';
import { escapeHtml as _escapeHtml, sanitizeAiResponse } from '../utils/sanitize.js';

let panelEl, chatListEl, chatInputEl, modelSelectEl, statusDotEl;
let fullChatAreaEl, fullStatusDotEl, fullStatusTextEl, fullModelSelectEl;
let isOpen = false;
let isFullscreenMode = false; // true when AI tab is active
let history = [];
let selectedModel = '';
let ollamaReady = false;
let isSending = false; // prevent duplicate sends
let pendingImages = []; // base64 images to attach to next message (for vision models)
let isOffline = false; // offline mode tracking
let offlineQueue = []; // queued messages when offline
let lastLatencyMs = -1; // last measured latency for health indicator
let healthCheckInterval = null; // periodic health check timer

// ─── Office context providers (set by app.js) ──────────
let contextProviders = {};
export function setContextProviders(providers) {
  contextProviders = providers;
}

// ─── System prompt for office assistant ─────────────────
const SYSTEM_PROMPT_KEY = 'marklink-ai-system-prompt';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant integrated into OfficeLink SL, a document editing suite.';

function getSystemPrompt() {
  const custom = localStorage.getItem(SYSTEM_PROMPT_KEY);
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_SYSTEM_PROMPT;
}

function setCustomSystemPrompt(prompt) {
  if (prompt && prompt.trim() && prompt.trim() !== DEFAULT_SYSTEM_PROMPT) {
    localStorage.setItem(SYSTEM_PROMPT_KEY, prompt.trim());
  } else {
    localStorage.removeItem(SYSTEM_PROMPT_KEY);
  }
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
    saveSelectedModel(selectedModel);
  });

  // Clear
  document.getElementById('ai-clear-btn')?.addEventListener('click', () => {
    history = [];
    if (chatListEl) chatListEl.innerHTML = '';
    currentSessionId = '';
    addSystemMessage('Chat cleared.');
  });

  // Export chat history as Markdown
  document.getElementById('ai-export-btn')?.addEventListener('click', () => exportChatAsMarkdown());

  // System prompt settings (collapsible)
  initSystemPromptSettings();

  // Sessions
  document.getElementById('ai-sessions-btn')?.addEventListener('click', showSessionsModal);

  // Restore saved model
  selectedModel = getSavedModel();

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
      saveSelectedModel(selectedModel);
      if (modelSelectEl) modelSelectEl.value = selectedModel;
    });
  }

  // ─── URL Settings Panel ───────────────────────────────
  initUrlSettings();

  // ─── API Key / Cloud Endpoint Settings ─────────────────
  initApiKeySettings();

  // ─── Offline Mode Detection ────────────────────────────
  initOfflineDetection();

  // ─── Diagnostics Panel ─────────────────────────────────
  document.getElementById('ai-diagnostics-btn')?.addEventListener('click', () => showDiagnosticsPanel());

  // Check Ollama status & restore session
  checkStatus().then(() => restoreLastSession());

  // Start periodic health check for connection indicator
  startHealthCheck();
}

// ─── URL Settings ────────────────────────────────────────

let connectionRetryInterval = null;

function initUrlSettings() {
  const settingsBtn = document.getElementById('ai-url-settings-btn');
  const settingsPanel = document.getElementById('ai-url-settings');
  const urlInput = document.getElementById('ai-ollama-url-input');
  const saveBtn = document.getElementById('ai-url-save-btn');
  const resetBtn = document.getElementById('ai-url-reset-btn');
  const testBtn = document.getElementById('ai-url-test-btn');

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

  // Test Connection button
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const resultEl = document.getElementById('ai-url-test-result');
      testBtn.disabled = true;
      testBtn.textContent = t('settings.testing');
      const urlToTest = urlInput?.value?.trim() || getOllamaUrl();
      const result = await testConnection(urlToTest);
      testBtn.disabled = false;
      testBtn.textContent = t('ai.test');
      if (resultEl) {
        if (result.success) {
          resultEl.innerHTML = `<span style="color:#4caf50">Connected — ${result.modelCount} model(s) found</span>`;
        } else if (result.corsError) {
          resultEl.innerHTML = `<span style="color:#f44336">CORS blocked.</span> <a href="#" class="ai-cors-help-link" style="color:var(--brand-color);font-size:11px">Fix CORS</a>`;
          resultEl.querySelector('.ai-cors-help-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            showCorsHelp();
          });
        } else {
          resultEl.innerHTML = `<span style="color:#f44336">${_escapeHtml(result.message || 'Connection failed')}</span>`;
        }
      }
    });
  }

  // Save URL
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newUrl = urlInput?.value?.trim();
      if (!newUrl) return;
      setOllamaUrl(newUrl);
      addSystemMessage(`Ollama URL set to: ${newUrl}`);
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

  // Start auto-retry when disconnected
  startConnectionRetry();
}

function updateUrlStatusDot() {
  const dot = document.getElementById('ai-url-status-dot');
  if (dot) {
    dot.className = `ai-url-dot ${ollamaReady ? 'online' : 'offline'}`;
    dot.title = ollamaReady ? 'Connected' : 'Not connected';
  }
}

/**
 * Auto-retry connection every 30 seconds when disconnected
 */
function startConnectionRetry() {
  if (connectionRetryInterval) clearInterval(connectionRetryInterval);
  connectionRetryInterval = setInterval(async () => {
    if (!ollamaReady) {
      await checkStatus();
    }
  }, 30000);
}

/**
 * Show CORS troubleshooting help
 */
function showCorsHelp() {
  document.querySelector('.ai-cors-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'ai-setup-modal ai-cors-modal';
  modal.innerHTML = `
    <div class="ai-setup-content" style="max-width:480px">
      <div class="ai-setup-header">
        <h3>CORS Fix Guide</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <p style="font-size:13px;margin:0 0 12px;color:var(--text-secondary)">
          Ollama blocks web browser requests by default. You need to allow this app to connect.
        </p>

        <div class="ai-cors-os-section">
          <h4 style="font-size:13px;margin:0 0 8px">macOS</h4>
          <div class="ai-step-desc" style="margin-bottom:8px">
            <strong>Option A — One-time (Terminal):</strong>
          </div>
          <div class="ai-copy-cmd" style="margin-bottom:8px">
            <code id="cors-mac-cmd1">OLLAMA_ORIGINS="*" ollama serve</code>
            <button class="ai-copy-btn" data-copy="cors-mac-cmd1" title="Copy">Copy</button>
          </div>
          <div class="ai-step-desc" style="margin-bottom:8px">
            <strong>Option B — Permanent:</strong>
          </div>
          <div class="ai-copy-cmd" style="margin-bottom:4px">
            <code id="cors-mac-cmd2">launchctl setenv OLLAMA_ORIGINS "*"</code>
            <button class="ai-copy-btn" data-copy="cors-mac-cmd2" title="Copy">Copy</button>
          </div>
          <div class="ai-step-desc" style="font-size:11px;color:var(--text-secondary)">
            Then restart Ollama (quit from menu bar and reopen).
          </div>
        </div>

        <div class="ai-cors-os-section" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color)">
          <h4 style="font-size:13px;margin:0 0 8px">Windows</h4>
          <div class="ai-step-desc" style="margin-bottom:8px">
            Set system environment variable, then restart Ollama:
          </div>
          <div class="ai-copy-cmd" style="margin-bottom:4px">
            <code id="cors-win-cmd">setx OLLAMA_ORIGINS "*"</code>
            <button class="ai-copy-btn" data-copy="cors-win-cmd" title="Copy">Copy</button>
          </div>
          <div class="ai-step-desc" style="font-size:11px;color:var(--text-secondary)">
            Run in Command Prompt (cmd), then restart Ollama from system tray.
          </div>
        </div>

        <div class="ai-cors-os-section" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color)">
          <h4 style="font-size:13px;margin:0 0 8px">Linux</h4>
          <div class="ai-copy-cmd" style="margin-bottom:4px">
            <code id="cors-linux-cmd">OLLAMA_ORIGINS="*" ollama serve</code>
            <button class="ai-copy-btn" data-copy="cors-linux-cmd" title="Copy">Copy</button>
          </div>
          <div class="ai-step-desc" style="font-size:11px;color:var(--text-secondary)">
            Or add <code>OLLAMA_ORIGINS=*</code> to <code>/etc/systemd/system/ollama.service</code> then <code>systemctl restart ollama</code>
          </div>
        </div>

        <div style="margin-top:16px;padding:10px;background:rgba(255,152,0,0.1);border-radius:8px">
          <strong style="font-size:12px">After setting CORS:</strong>
          <ol style="margin:4px 0 0;padding-left:20px;font-size:12px;color:var(--text-secondary)">
            <li>Restart Ollama completely</li>
            <li>Come back here and click "Test Connection"</li>
          </ol>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.ai-setup-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Copy buttons
  modal.querySelectorAll('.ai-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codeEl = document.getElementById(btn.dataset.copy);
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent).then(() => {
          btn.textContent = t('ai.copied');
          setTimeout(() => { btn.textContent = t('ai.copy'); }, 1500);
        });
      }
    });
  });
}

// ─── API Key / Cloud Endpoint Settings ────────────────────

function initApiKeySettings() {
  const apiKeyInput = document.getElementById('ai-apikey-input');
  const cloudInput = document.getElementById('ai-cloud-endpoint-input');
  const saveApiBtn = document.getElementById('ai-apikey-save-btn');
  const clearApiBtn = document.getElementById('ai-apikey-clear-btn');

  if (apiKeyInput) apiKeyInput.value = getApiKey() ? '••••••••' : '';
  if (cloudInput) cloudInput.value = getCloudEndpoint();

  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const key = apiKeyInput?.value?.trim();
      const endpoint = cloudInput?.value?.trim();
      if (key && key !== '••••••••') setApiKey(key);
      if (endpoint) setCloudEndpoint(endpoint);
      addSystemMessage('Cloud LLM settings saved.');
      showToast('API key and endpoint saved');
    });
  }

  if (clearApiBtn) {
    clearApiBtn.addEventListener('click', () => {
      setApiKey('');
      setCloudEndpoint('');
      if (apiKeyInput) apiKeyInput.value = '';
      if (cloudInput) cloudInput.value = '';
      addSystemMessage('Cloud LLM settings cleared. Using local Ollama.');
      showToast('Cloud settings cleared');
    });
  }
}

// ─── Offline Mode Detection ──────────────────────────────

function initOfflineDetection() {
  const updateOfflineStatus = () => {
    isOffline = !navigator.onLine && !ollamaReady;
    updateOfflineIndicator();
  };

  window.addEventListener('online', () => {
    isOffline = false;
    updateOfflineIndicator();
    // Try to send queued messages
    if (offlineQueue.length > 0) {
      addSystemMessage(`Back online. ${offlineQueue.length} queued message(s) will be sent.`);
      processOfflineQueue();
    }
    checkStatus();
  });

  window.addEventListener('offline', () => {
    if (!ollamaReady) {
      isOffline = true;
      updateOfflineIndicator();
    }
  });

  updateOfflineStatus();
}

function updateOfflineIndicator() {
  let indicator = document.getElementById('ai-offline-indicator');
  if (isOffline) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'ai-offline-indicator';
      indicator.className = 'ai-offline-indicator';
      indicator.innerHTML = `<span class="ai-offline-dot"></span> Offline${offlineQueue.length > 0 ? ` (${offlineQueue.length} queued)` : ''}`;
      const header = document.querySelector('.ai-panel-header');
      if (header) header.after(indicator);
    } else {
      indicator.innerHTML = `<span class="ai-offline-dot"></span> Offline${offlineQueue.length > 0 ? ` (${offlineQueue.length} queued)` : ''}`;
    }
  } else {
    indicator?.remove();
  }
}

const processOfflineQueue = async () => {
  while (offlineQueue.length > 0) {
    const msg = offlineQueue.shift();
    updateOfflineIndicator();
    chatInputEl.value = msg;
    await sendMessage();
  }
};

// ─── Diagnostics Panel ───────────────────────────────────

async function showDiagnosticsPanel() {
  document.querySelector('.ai-diagnostics-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'ai-setup-modal ai-diagnostics-modal';
  modal.innerHTML = `
    <div class="ai-setup-content" style="max-width:480px">
      <div class="ai-setup-header">
        <h3>AI Connection Diagnostics</h3>
        <button class="ai-setup-close">&times;</button>
      </div>
      <div class="ai-setup-body">
        <div class="ai-diag-section">
          <h4 style="font-size:13px;margin:0 0 8px">System</h4>
          <div class="ai-diag-row"><span>Platform</span><span id="diag-platform">Detecting...</span></div>
          <div class="ai-diag-row"><span>Browser</span><span id="diag-browser">${navigator.userAgent.split(' ').pop()}</span></div>
          <div class="ai-diag-row"><span>Online</span><span id="diag-online">${navigator.onLine ? 'Yes' : 'No'}</span></div>
        </div>
        <div class="ai-diag-section">
          <h4 style="font-size:13px;margin:0 0 8px">Ollama Connection</h4>
          <div class="ai-diag-row"><span>URL</span><span id="diag-url">${getOllamaUrl()}</span></div>
          <div class="ai-diag-row"><span>Status</span><span id="diag-status">Testing...</span></div>
          <div class="ai-diag-row"><span>Latency</span><span id="diag-latency">Measuring...</span></div>
          <div class="ai-diag-row"><span>Version</span><span id="diag-version">Checking...</span></div>
        </div>
        <div class="ai-diag-section">
          <h4 style="font-size:13px;margin:0 0 8px">Models</h4>
          <div id="diag-models" style="font-size:12px;color:var(--text-secondary)">Loading...</div>
        </div>
        <div class="ai-diag-section">
          <h4 style="font-size:13px;margin:0 0 8px">Cloud Endpoint</h4>
          <div class="ai-diag-row"><span>Endpoint</span><span id="diag-cloud">${getCloudEndpoint() || 'Not configured'}</span></div>
          <div class="ai-diag-row"><span>API Key</span><span id="diag-apikey">${getApiKey() ? 'Set' : 'Not set'}</span></div>
        </div>
        <button class="ai-pull-btn" id="diag-refresh" style="margin-top:12px;width:100%">Refresh Diagnostics</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('.ai-setup-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  const runDiagnostics = async () => {
    // Platform
    const platform = detectPlatform();
    const platformEl = modal.querySelector('#diag-platform');
    if (platformEl) platformEl.textContent = `${platform.os} (${platform.arch})`;

    // Status
    const status = await checkOllamaStatus();
    const statusEl = modal.querySelector('#diag-status');
    if (statusEl) {
      statusEl.textContent = status.running ? 'Connected' : (status.corsError ? 'CORS Error' : 'Not Connected');
      statusEl.style.color = status.running ? '#4caf50' : '#f44336';
    }

    // Latency
    const latency = await measureLatency();
    const latencyEl = modal.querySelector('#diag-latency');
    if (latencyEl) {
      latencyEl.textContent = latency >= 0 ? `${latency}ms` : 'Unreachable';
      latencyEl.style.color = latency >= 0 ? (latency < 100 ? '#4caf50' : latency < 500 ? '#ff9800' : '#f44336') : '#f44336';
    }

    // Version
    const version = await getServerVersion();
    const versionEl = modal.querySelector('#diag-version');
    if (versionEl) versionEl.textContent = version || 'Unknown';

    // Models
    if (status.running) {
      const models = await listModels();
      const modelsEl = modal.querySelector('#diag-models');
      if (modelsEl) {
        modelsEl.innerHTML = models.length === 0
          ? 'No models installed'
          : models.map((m) => `<div style="padding:2px 0"><strong>${m.name}</strong> <span style="opacity:0.6">${formatModelSize(m.size)}</span></div>`).join('');
      }
    }
  };

  runDiagnostics();
  modal.querySelector('#diag-refresh')?.addEventListener('click', () => runDiagnostics());
}

// ─── Enhanced Platform Detection ─────────────────────────

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  let os = 'Unknown';
  if (ua.includes('mac') || platform.includes('mac')) os = 'macOS';
  else if (ua.includes('win') || platform.includes('win')) os = 'Windows';
  else if (ua.includes('linux') || platform.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  let arch = 'x86_64';
  if (ua.includes('arm') || ua.includes('aarch64') || (os === 'macOS' && !ua.includes('intel'))) arch = 'ARM64';

  return { os, arch, ua };
}

function getInstallCommands() {
  const { os } = detectPlatform();
  const commands = {
    macOS: {
      download: 'https://ollama.com/download/Ollama-darwin.zip',
      install: 'Open Ollama.app from Applications',
      pull: 'ollama pull qwen2.5:7b',
      cors: 'launchctl setenv OLLAMA_ORIGINS "*"',
      terminal: 'Press Cmd+Space, type "Terminal", press Enter',
    },
    Windows: {
      download: 'https://ollama.com/download/OllamaSetup.exe',
      install: 'Double-click OllamaSetup.exe and follow prompts',
      pull: 'ollama pull qwen2.5:7b',
      cors: 'setx OLLAMA_ORIGINS "*"',
      terminal: 'Press Win+R, type "cmd", press Enter',
    },
    Linux: {
      download: 'curl -fsSL https://ollama.com/install.sh | sh',
      install: 'Run the install script above, then: ollama serve',
      pull: 'ollama pull qwen2.5:7b',
      cors: 'OLLAMA_ORIGINS="*" ollama serve',
      terminal: 'Open your terminal emulator',
    },
  };
  return commands[os] || commands.Linux;
}

async function checkStatus() {
  const status = await checkOllamaStatus();
  ollamaReady = status.running;
  updateStatusUI(status.running, status.corsError);
  updateUrlStatusDot();
  updateStatusBarWidget(status.running);

  // Check if cloud endpoint is configured as fallback
  if (!status.running && getCloudEndpoint() && getApiKey()) {
    ollamaReady = true;
    updateStatusUI(true, false);
    updateStatusBarWidget(true);
    addSystemMessage('Using cloud LLM endpoint.');
  }

  if (status.running) {
    const models = await listModels();
    populateModelSelect(models);
  }

  // Update health indicator alongside status
  updateHealthIndicator();
}

function updateStatusUI(running, corsError) {
  if (statusDotEl) {
    statusDotEl.className = `ai-status-dot ${running ? 'online' : 'offline'}`;
    statusDotEl.title = running ? 'Ollama connected' : (corsError ? 'CORS error — click gear icon' : 'Ollama not connected — click Setup');
  }
  // Sync full-screen status
  if (fullStatusDotEl) {
    fullStatusDotEl.className = `ai-status-dot ${running ? 'online' : 'offline'}`;
  }
  if (fullStatusTextEl) {
    if (running) {
      fullStatusTextEl.textContent = t('ai.connected');
      fullStatusTextEl.style.color = '#4caf50';
    } else if (corsError) {
      fullStatusTextEl.textContent = t('ai.corsError');
      fullStatusTextEl.style.color = '#ff9800';
    } else {
      fullStatusTextEl.textContent = t('ai.notConnected');
      fullStatusTextEl.style.color = '#f44336';
    }
  }
}

/**
 * Update the persistent status bar AI widget
 */
function updateStatusBarWidget(running) {
  let widget = document.getElementById('ai-statusbar-widget');
  if (!widget) {
    // Create the widget in the status bar
    const statusRight = document.getElementById('status-right');
    if (!statusRight) return;
    widget = document.createElement('span');
    widget.id = 'ai-statusbar-widget';
    widget.className = 'ai-statusbar-widget';
    widget.title = t('ai.connectionStatus');
    widget.addEventListener('click', () => {
      // Open the settings panel
      const settingsPanel = document.getElementById('ai-url-settings');
      if (settingsPanel) {
        settingsPanel.classList.remove('hidden');
        // Also open the AI panel if not in fullscreen mode
        if (!isFullscreenMode && !isOpen) togglePanel();
      }
    });
    statusRight.appendChild(widget);
  }
  widget.innerHTML = `<span class="ai-statusbar-dot ${running ? 'online' : 'offline'}"></span> AI`;
  widget.title = running ? 'AI: Connected' : 'AI: Disconnected — click to configure';
}

// ─── Connection Health Indicator ─────────────────────────

/**
 * Start periodic health checks to update the connection health dot.
 * Green = connected & fast (<2s), Yellow = connected but slow (>=2s), Red = disconnected.
 */
const startHealthCheck = () => {
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  // Run immediately
  updateHealthIndicator();
  // Then every 15 seconds
  healthCheckInterval = setInterval(() => updateHealthIndicator(), 15000);
};

const updateHealthIndicator = async () => {
  const latency = await measureLatency();
  lastLatencyMs = latency;

  let healthClass = 'health-red';
  let healthTitle = 'Disconnected';
  if (latency >= 0 && latency < 2000) {
    healthClass = 'health-green';
    healthTitle = `Connected (${latency}ms)`;
  } else if (latency >= 2000) {
    healthClass = 'health-yellow';
    healthTitle = `Slow connection (${latency}ms)`;
  }

  // Update all health dots (sidebar + fullscreen)
  document.querySelectorAll('.ai-health-dot').forEach((dot) => {
    dot.className = `ai-health-dot ${healthClass}`;
    dot.title = healthTitle;
  });
};

// ─── System Prompt Settings ─────────────────────────────

const initSystemPromptSettings = () => {
  const container = document.getElementById('ai-system-prompt-settings');
  if (!container) return;

  const textarea = container.querySelector('#ai-system-prompt-input');
  const saveBtn = container.querySelector('#ai-sysprompt-save-btn');
  const resetBtn = container.querySelector('#ai-sysprompt-reset-btn');
  const toggle = container.querySelector('.ai-sysprompt-toggle');

  if (textarea) textarea.value = getSystemPrompt();

  if (toggle) {
    toggle.addEventListener('click', () => {
      container.classList.toggle('expanded');
      if (textarea && container.classList.contains('expanded')) {
        textarea.value = getSystemPrompt();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = textarea?.value || '';
      setCustomSystemPrompt(val);
      addSystemMessage('System prompt updated.');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem(SYSTEM_PROMPT_KEY);
      if (textarea) textarea.value = DEFAULT_SYSTEM_PROMPT;
      addSystemMessage('System prompt reset to default.');
    });
  }
};

// ─── Chat Export ─────────────────────────────────────────

const exportChatAsMarkdown = () => {
  if (history.length === 0) {
    addSystemMessage('No messages to export.');
    return;
  }

  const lines = ['# Chat Export', ''];
  const timestamp = new Date().toLocaleString();
  lines.push(`*Exported: ${timestamp}*`, `*Model: ${selectedModel || 'unknown'}*`, '');

  for (const msg of history) {
    if (msg.role === 'user') {
      lines.push('## User', '', msg.content, '');
    } else if (msg.role === 'assistant') {
      lines.push('## Assistant', '', msg.content, '');
    }
  }

  const markdown = lines.join('\n');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  a.download = `chat-export-${dateStr}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addSystemMessage('Chat exported as Markdown file.');
};

function populateModelSelect(models) {
  if (!modelSelectEl) return;
  modelSelectEl.innerHTML = '';

  if (models.length === 0) {
    modelSelectEl.innerHTML = '<option value="">No models installed</option>';
    if (fullModelSelectEl) fullModelSelectEl.innerHTML = modelSelectEl.innerHTML;
    return;
  }

  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.name;
    const sizeStr = m.size ? ` (${formatModelSize(m.size)})` : '';
    opt.textContent = `${m.name}${sizeStr}`;
    modelSelectEl.appendChild(opt);
  }

  // Try to restore saved model or pick first
  const saved = getSavedModel();
  if (saved && models.find(m => m.name === saved)) {
    selectedModel = saved;
    modelSelectEl.value = saved;
  } else if (selectedModel && models.find(m => m.name === selectedModel)) {
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

function addUserMessage(text, historyIndex) {
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-user';

  const textSpan = document.createElement('span');
  textSpan.className = 'ai-msg-text';
  textSpan.textContent = text;
  div.appendChild(textSpan);

  // Edit icon (visible on hover)
  const editBtn = document.createElement('button');
  editBtn.className = 'ai-msg-edit-btn';
  editBtn.innerHTML = '&#9998;'; // pencil
  editBtn.title = 'Edit & resend';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = typeof historyIndex === 'number' ? historyIndex : findUserMsgHistoryIndex(div);
    startEditMessage(div, idx);
  });
  div.appendChild(editBtn);

  chatListEl?.appendChild(div);
  scrollToBottom();
}

/**
 * Find the history index for a user message DOM element.
 */
const findUserMsgHistoryIndex = (msgEl) => {
  if (!chatListEl) return -1;
  const userMsgs = chatListEl.querySelectorAll('.ai-msg-user');
  let userIdx = 0;
  for (const el of userMsgs) {
    if (el === msgEl) break;
    userIdx++;
  }
  // Map to history array: find the Nth user message
  let count = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === 'user') {
      if (count === userIdx) return i;
      count++;
    }
  }
  return -1;
};

/**
 * Start editing a user message. Shows an inline textarea.
 * On submit, removes all subsequent messages and re-sends.
 */
const startEditMessage = (msgEl, historyIdx) => {
  if (isSending || historyIdx < 0) return;

  const currentText = history[historyIdx]?.content || '';
  const textSpan = msgEl.querySelector('.ai-msg-text');
  const editBtn = msgEl.querySelector('.ai-msg-edit-btn');
  if (!textSpan) return;

  // Hide edit btn during editing
  if (editBtn) editBtn.style.display = 'none';

  // Replace text with textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'ai-msg-edit-textarea';
  textarea.value = currentText;
  textarea.rows = Math.min(6, currentText.split('\n').length + 1);

  const actions = document.createElement('div');
  actions.className = 'ai-msg-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Send';
  saveBtn.className = 'ai-msg-edit-save';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'ai-msg-edit-cancel';

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  textSpan.style.display = 'none';
  msgEl.appendChild(textarea);
  msgEl.appendChild(actions);
  textarea.focus();

  const cleanup = () => {
    textarea.remove();
    actions.remove();
    textSpan.style.display = '';
    if (editBtn) editBtn.style.display = '';
  };

  cancelBtn.addEventListener('click', () => cleanup());

  saveBtn.addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) { cleanup(); return; }

    // Remove all messages after this one from history
    history = history.slice(0, historyIdx);

    // Remove all DOM elements after this message
    const allMsgs = Array.from(chatListEl.querySelectorAll('.ai-msg'));
    const msgIndex = allMsgs.indexOf(msgEl);
    for (let i = allMsgs.length - 1; i > msgIndex; i--) {
      allMsgs[i].remove();
    }
    // Remove the current user message too (will be re-added by sendMessage)
    msgEl.remove();

    // Set the input and send
    chatInputEl.value = newText;
    sendMessage();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === 'Escape') {
      cleanup();
    }
  });
};

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

  if (isOffline) {
    offlineQueue.push(text);
    chatInputEl.value = '';
    addUserMessage(text);
    addSystemMessage(`Message queued (${offlineQueue.length} pending). Will send when back online.`);
    updateOfflineIndicator();
    return;
  }

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
    streamDiv.innerHTML = `<span class="ai-error">Error: ${_escapeHtml(e.message)}</span>`;
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
  const recTier = MODEL_TIERS.find(t => t.id === recommended);
  const recModel = recTier ? recTier.model : 'qwen2.5-coder:7b';

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
          <span class="ai-status-icon">${status.running ? '✅' : (status.corsError ? '⚠️' : '❌')}</span>
          <span>${status.running ? 'Ollama connected' : (status.corsError ? 'CORS error — see Step 4 below' : 'Ollama not connected')}</span>
          ${status.running ? `<span style="margin-left:auto;font-size:11px;color:var(--text-secondary)">${models.length} model(s) installed</span>` : ''}
        </div>

        ${!status.running ? `
        <div class="ai-install-section">
          <h4 style="font-size:16px;margin-bottom:4px">AI Setup Guide</h4>
          <p class="ai-install-desc" style="margin-bottom:16px">
            Set up a free AI that runs on your PC. Takes about <strong>5 minutes</strong>.
          </p>

          <!-- OS Detection -->
          <div class="ai-os-tabs">
            <button class="ai-os-tab ${detectedOS === 'mac' ? 'active' : ''}" data-os="mac">macOS</button>
            <button class="ai-os-tab ${detectedOS === 'win' ? 'active' : ''}" data-os="win">Windows</button>
            <button class="ai-os-tab ${detectedOS === 'linux' ? 'active' : ''}" data-os="linux">Linux</button>
          </div>

          <!-- Wizard Steps -->
          <div class="ai-wizard-steps">
            <!-- Step 1: Download Ollama -->
            <div class="ai-wizard-step active">
              <div class="ai-step-num">1</div>
              <div class="ai-step-body">
                <div class="ai-step-title">Download Ollama</div>
                <div class="ai-step-desc">
                  Ollama is a free program that runs AI models on your PC.<br>
                  Download size: ~300MB (one-time only)
                </div>
                <div class="ai-step-action">
                  <a href="https://ollama.com/download" target="_blank" rel="noopener" class="ai-install-btn"
                     id="ai-download-link"
                     style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;font-size:14px">
                    <span style="font-size:20px">⬇</span> Free Download
                  </a>
                </div>
              </div>
            </div>

            <!-- Step 2: Install & Run -->
            <div class="ai-wizard-step">
              <div class="ai-step-num">2</div>
              <div class="ai-step-body">
                <div class="ai-step-title">Install & Run</div>
                <div class="ai-step-desc ai-os-content" data-os="mac">
                  <strong>1.</strong> Open the downloaded <code>Ollama-darwin.zip</code> file<br>
                  <strong>2.</strong> Drag <code>Ollama.app</code> to your <strong>Applications</strong> folder<br>
                  <strong>3.</strong> Open Ollama — a llama icon appears in the menu bar<br>
                  <span style="color:#4caf50">It starts automatically after installation.</span>
                </div>
                <div class="ai-step-desc ai-os-content" data-os="win" style="display:none">
                  <strong>1.</strong> Double-click <code>OllamaSetup.exe</code><br>
                  <strong>2.</strong> Click "Install" (takes about 1 minute)<br>
                  <strong>3.</strong> A llama icon appears in the system tray (bottom right)<br>
                  <span style="color:#4caf50">It starts automatically after installation.</span>
                </div>
                <div class="ai-step-desc ai-os-content" data-os="linux" style="display:none">
                  Run this in your terminal:<br>
                  <div class="ai-copy-cmd">
                    <code id="linux-install-cmd">curl -fsSL https://ollama.com/install.sh | sh</code>
                    <button class="ai-copy-btn" data-copy="linux-install-cmd" title="Copy">Copy</button>
                  </div>
                  Then start with <code>ollama serve</code>
                </div>
              </div>
            </div>

            <!-- Step 3: Download an AI Model -->
            <div class="ai-wizard-step">
              <div class="ai-step-num">3</div>
              <div class="ai-step-body">
                <div class="ai-step-title">Download an AI Model</div>
                <div class="ai-step-desc">
                  Open <strong>Terminal</strong> (macOS/Linux) or <strong>Command Prompt</strong> (Windows) and run:
                </div>
                <div class="ai-copy-cmd">
                  <code id="pull-model-cmd">ollama pull qwen2.5-coder:7b</code>
                  <button class="ai-copy-btn" data-copy="pull-model-cmd" title="Copy to clipboard">Copy</button>
                </div>
                <div class="ai-step-desc" style="margin-top:8px">
                  <span style="color:var(--text-secondary)">This downloads a ~4.5GB AI model (one-time). Wait until it says "success".</span><br>
                  <span style="color:var(--text-secondary);font-size:11px">
                    How to open Terminal:<br>
                    <strong>macOS:</strong> Press <kbd>Cmd</kbd>+<kbd>Space</kbd>, type "Terminal", press Enter<br>
                    <strong>Windows:</strong> Press <kbd>Win</kbd>+<kbd>R</kbd>, type "cmd", press Enter
                  </span>
                </div>
              </div>
            </div>

            <!-- Step 4: Test Connection -->
            <div class="ai-wizard-step">
              <div class="ai-step-num">4</div>
              <div class="ai-step-body">
                <div class="ai-step-title">Test Connection</div>
                <div class="ai-step-desc">
                  Once Ollama is running and a model is downloaded, click below to verify:
                </div>
                <div class="ai-step-action">
                  <button class="ai-install-btn" id="ai-check-connection"
                    style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;font-size:13px;border:none;cursor:pointer">
                    Test Connection
                  </button>
                </div>
                <div id="ai-check-result" style="margin-top:8px"></div>
                <div id="ai-auto-scan" style="display:none;margin-top:8px">
                  <span class="ai-scanning">
                    <span class="ai-scanning-dot"></span>
                    Auto-detecting Ollama...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Comparison -->
          <details style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px">
            <summary style="font-size:13px;cursor:pointer;color:var(--text-primary);font-weight:500">
              How is this different from ChatGPT/Claude?
            </summary>
            <table class="ai-compare-table">
              <tr>
                <th style="text-align:left"></th>
                <th>OfficeLink AI<br><span style="font-size:10px;color:#4caf50">Your PC</span></th>
                <th>ChatGPT / Claude<br><span style="font-size:10px">Cloud</span></th>
              </tr>
              <tr><td>Monthly cost</td><td class="win" style="text-align:center">Free</td><td style="text-align:center">$20~25/mo</td></tr>
              <tr><td>Your data</td><td class="win" style="text-align:center">Stays on PC</td><td style="text-align:center">Sent to servers</td></tr>
              <tr><td>Offline use</td><td class="win" style="text-align:center">Yes</td><td style="text-align:center">No</td></tr>
              <tr><td>Speed</td><td style="text-align:center">Depends on PC</td><td class="win" style="text-align:center">Fast</td></tr>
              <tr><td>Document analysis</td><td class="win" style="text-align:center">Yes</td><td class="win" style="text-align:center">Yes</td></tr>
              <tr><td>Get started</td><td style="text-align:center">5 min install</td><td style="text-align:center">Sign up + pay</td></tr>
            </table>
          </details>
        </div>
        ` : ''}

        <div class="ai-model-section">
          <h4>AI Models ${status.running ? '' : '(connect first)'}</h4>
          <p class="ai-ram-info">Detected RAM: <strong>${ram}GB</strong> · Recommended: <strong>${recTier?.label || 'Standard'}</strong></p>

          ${status.running ? `
          <!-- Installed models from Ollama -->
          ${models.length > 0 ? `
          <div style="margin-bottom:12px">
            <h5 style="font-size:12px;color:var(--text-secondary);margin:0 0 6px">Installed Models (auto-detected)</h5>
            <div class="ai-model-list">
              ${models.map(m => `
                <div class="ai-model-card installed" style="padding:8px 12px">
                  <div class="ai-model-info">
                    <strong>${m.name}</strong>
                    <span class="ai-badge installed">Ready</span>
                    ${isVisionModel(m.name) ? '<span class="ai-badge" style="background:#9c27b0">Vision</span>' : ''}
                    <br><small>${formatModelSize(m.size)} · Modified: ${new Date(m.modified_at).toLocaleDateString()}</small>
                  </div>
                  <span class="ai-check">✓</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">No models installed. Install one below or run <code>ollama pull qwen2.5-coder:7b</code> in terminal.</p>'}
          ` : ''}

          <details ${!status.running || models.length === 0 ? 'open' : ''}>
            <summary style="font-size:13px;cursor:pointer;color:var(--text-primary);font-weight:500;margin-bottom:8px">
              ${status.running ? 'Install More Models' : 'Available Models'}
            </summary>
            <div class="ai-model-list">
              ${MODEL_TIERS.map(tier => {
                const installed = installedNames.some(n => n.startsWith(tier.model.split(':')[0]) && n.includes(tier.model.split(':')[1]));
                const isRec = tier.id === recommended;
                return `
                <div class="ai-model-card ${isRec ? 'recommended' : ''} ${installed ? 'installed' : ''}"
                  title="${tier.capabilities ? 'Can do: ' + tier.capabilities.join(', ') + '\\nLimitations: ' + tier.limitations.join(', ') : ''}">
                  <div class="ai-model-info">
                    <strong>${tier.label}</strong> ${isRec ? '<span class="ai-badge">Recommended</span>' : ''}
                    ${installed ? '<span class="ai-badge installed">Installed</span>' : ''}
                    ${tier.isVision ? '<span class="ai-badge" style="background:#9c27b0">Vision</span>' : ''}
                    <br><code>${tier.model}</code> · ${tier.size}
                    <br><small>${tier.desc}</small>
                    <br><small>Min RAM: ${tier.minRAM}GB</small>
                    ${tier.capabilities ? `<br><small style="color:#4caf50">+ ${tier.capabilities.join(' · ')}</small>` : ''}
                  </div>
                  <div class="ai-model-actions" style="display:flex;flex-direction:column;gap:4px;align-items:center">
                    ${!installed && status.running ? `
                      <button class="ai-pull-btn" data-model="${tier.model}"
                        title="Download this model.&#10;Size: ${tier.size} (one-time)&#10;Free forever after download">
                        Install
                      </button>
                    ` : installed ? '<span class="ai-check">✓</span>' : ''}
                    ${!installed ? `
                      <div class="ai-copy-cmd-inline">
                        <code style="font-size:10px">ollama pull ${tier.model}</code>
                      </div>
                    ` : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </details>
        </div>

        <div class="ai-progress-section hidden" id="ai-pull-progress">
          <div class="ai-progress-label" id="ai-pull-label">Downloading...</div>
          <div class="ai-progress-bar">
            <div class="ai-progress-fill" id="ai-pull-fill" style="width:0%"></div>
          </div>
        </div>

        <!-- Cloudflare Tunnel (Remote Access) -->
        <details style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:12px">
          <summary style="font-size:13px;cursor:pointer;color:var(--text-primary);font-weight:500">
            Remote Access (use from phone/other devices)
          </summary>
          <div style="padding:8px 0;font-size:12px;color:var(--text-secondary);line-height:1.6">
            <p style="margin:0 0 8px">To access Ollama from another device, use Cloudflare Tunnel:</p>
            <ol style="margin:0;padding-left:20px">
              <li>Install cloudflared: <code>brew install cloudflare/cloudflare/cloudflared</code></li>
              <li>Run: <div class="ai-copy-cmd" style="margin:4px 0"><code id="cf-tunnel-cmd">cloudflared tunnel --url http://localhost:11434</code><button class="ai-copy-btn" data-copy="cf-tunnel-cmd">Copy</button></div></li>
              <li>Copy the generated <code>https://xxx.trycloudflare.com</code> URL</li>
              <li>Enter that URL in the Ollama URL field (gear icon) on your other device</li>
            </ol>
            <p style="margin:8px 0 0;color:#ff9800">Note: Set <code>OLLAMA_ORIGINS=*</code> on the host PC first.</p>
          </div>
        </details>
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

  // Copy buttons
  modal.querySelectorAll('.ai-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codeEl = document.getElementById(btn.dataset.copy);
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent).then(() => {
          btn.textContent = t('ai.copied');
          setTimeout(() => { btn.textContent = t('ai.copy'); }, 1500);
        });
      }
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
          updateStatusUI(true, false);
          updateStatusBarWidget(true);
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
      checkBtn.innerHTML = '<span class="ai-scanning"><span class="ai-scanning-dot"></span> Testing...</span>';
      checkBtn.disabled = true;
      const result = await testConnection();
      if (result.success) {
        // Mark all steps done
        modal.querySelectorAll('.ai-wizard-step').forEach(st => {
          st.classList.add('done');
          st.classList.remove('active');
        });
        checkResult.innerHTML = `
          <div style="background:rgba(76,175,80,0.1);padding:12px;border-radius:8px;margin-top:8px">
            <strong style="color:#4caf50;font-size:14px">Connection successful!</strong><br>
            <span style="font-size:12px;color:var(--text-secondary)">${result.modelCount} model(s) found. ${result.modelCount === 0 ? 'Install a model above to get started.' : 'You are ready to use AI!'}</span>
          </div>`;
        ollamaReady = true;
        updateStatusUI(true, false);
        updateStatusBarWidget(true);
        // Refresh after short delay to show install buttons
        setTimeout(() => { modal.remove(); showSetupModal(); }, 2000);
      } else if (result.corsError) {
        checkResult.innerHTML = `
          <div style="background:rgba(255,152,0,0.1);padding:12px;border-radius:8px;margin-top:8px">
            <strong style="color:#ff9800">CORS Error</strong><br>
            <span style="font-size:12px;line-height:1.8">
              Ollama is running but blocking browser requests.<br>
              <strong>Fix:</strong> Set <code>OLLAMA_ORIGINS=*</code> and restart Ollama.
            </span>
            <div style="margin-top:8px">
              <button class="ai-pull-btn" id="ai-cors-fix-btn" style="font-size:11px">Show Fix Instructions</button>
            </div>
          </div>`;
        checkResult.querySelector('#ai-cors-fix-btn')?.addEventListener('click', () => showCorsHelp());
        checkBtn.innerHTML = 'Test Connection';
        checkBtn.disabled = false;
      } else {
        checkResult.innerHTML = `
          <div style="background:rgba(244,67,54,0.1);padding:12px;border-radius:8px;margin-top:8px">
            <strong style="color:#f44336">Cannot connect</strong><br>
            <span style="font-size:12px;line-height:1.8">
              Please check:<br>
              <strong>1.</strong> Did you download Ollama from Step 1?<br>
              <strong>2.</strong> Did you install and open it?<br>
              <strong>3.</strong> Is the Ollama app running?<br>
              <span style="color:var(--text-secondary)">macOS: Look for llama icon in the menu bar<br>
              Windows: Look for icon in the system tray (bottom right)</span>
            </span>
          </div>`;
        checkBtn.innerHTML = 'Test Connection';
        checkBtn.disabled = false;
      }
    });
  }

  // Pull buttons
  modal.querySelectorAll('.ai-pull-btn[data-model]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modelName = btn.dataset.model;
      if (!modelName) return;
      btn.disabled = true;
      btn.textContent = t('ai.downloading');

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

        btn.textContent = t('ai.installed');
        if (progressLabel) progressLabel.textContent = t('ai.downloadComplete');

        // Refresh model list
        const newModels = await listModels();
        populateModelSelect(newModels);
        ollamaReady = true;
        updateStatusUI(true, false);
        updateStatusBarWidget(true);
      } catch (e) {
        btn.textContent = 'Error';
        if (progressLabel) progressLabel.textContent = `Error: ${e.message}`;
        btn.disabled = false;
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

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'user') addUserMessage(msg.content, i);
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

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'user') addUserMessage(msg.content, i);
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
  return _escapeHtml(s);
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
export {
  togglePanel as toggleAiPanel, showSessionsModal,
  enterAiFullscreen, exitAiFullscreen,
  showDiagnosticsPanel, detectPlatform, getInstallCommands,
  exportChatAsMarkdown
};
