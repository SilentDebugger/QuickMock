/**
 * QuickMock Recorder — Content Script (ISOLATED world)
 *
 * - Checks chrome.storage.local for the current domain's recording state
 * - Injects a floating button + panel via Shadow DOM (CSS-isolated)
 * - Bridges captured requests from the MAIN-world interceptor to the
 *   background service worker
 * - Sends QUICKMOCK_ACTIVATE / QUICKMOCK_DEACTIVATE to the interceptor
 */
(() => {
  'use strict';

  // Guard against double injection
  if (window.__quickmockContentInstalled) return;
  window.__quickmockContentInstalled = true;

  const domain = location.hostname;
  if (!domain) return;

  // ── State ────────────────────────────────────────────────────────────────

  let currentState = null;    // Domain recording state from storage
  let panelOpen = false;
  let shadowRoot = null;
  let els = {};               // Cached DOM elements inside the shadow

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE', domain });
    currentState = response?.state;

    if (currentState) {
      injectUI();
      if (currentState.active) {
        activateInterceptor();
      }
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Listen for messages from popup to inject UI on first activation ──────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DOMAIN_ACTIVATED' && message.domain === domain) {
      currentState = message.state;
      if (!shadowRoot) {
        injectUI();
      }
      updateUI();
      activateInterceptor();
    } else if (message.type === 'DOMAIN_DEACTIVATED' && message.domain === domain) {
      if (currentState) currentState.active = false;
      deactivateInterceptor();
      updateUI();
    }
  });

  // ── Interceptor control ──────────────────────────────────────────────────

  function activateInterceptor() {
    window.postMessage({
      type: 'QUICKMOCK_ACTIVATE',
      urlFilter: currentState?.urlFilter || '',
    }, '*');
  }

  function deactivateInterceptor() {
    window.postMessage({ type: 'QUICKMOCK_DEACTIVATE' }, '*');
  }

  // ── Bridge: interceptor → background ─────────────────────────────────────

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'QUICKMOCK_CAPTURED') return;
    if (!currentState?.active) return;

    const entry = event.data.payload;
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_REQUEST',
      domain,
      entry,
    });

    if (response?.ok) {
      updateCount(response.count);
    }
  });

  // ── UI injection (Shadow DOM) ────────────────────────────────────────────

  function injectUI() {
    const host = document.createElement('div');
    host.id = 'quickmock-recorder-host';
    host.style.cssText = 'all:initial; position:fixed; z-index:2147483647; bottom:0; right:0; font-family:system-ui,-apple-system,sans-serif;';
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getStyles();
    shadowRoot.appendChild(style);

    // Floating button
    const fab = document.createElement('button');
    fab.className = 'qm-fab';
    fab.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
      </svg>
      <span class="qm-fab-badge" style="display:none">0</span>
    `;
    fab.addEventListener('click', togglePanel);
    shadowRoot.appendChild(fab);
    els.fab = fab;
    els.badge = fab.querySelector('.qm-fab-badge');

    // Panel
    const panel = document.createElement('div');
    panel.className = 'qm-panel';
    panel.style.display = 'none';
    panel.innerHTML = getPanelHTML();
    shadowRoot.appendChild(panel);
    els.panel = panel;

    // Cache panel elements
    els.statusDot = panel.querySelector('.qm-status-dot');
    els.statusText = panel.querySelector('.qm-status-text');
    els.count = panel.querySelector('.qm-count');
    els.serverName = panel.querySelector('.qm-server-name');
    els.urlFilter = panel.querySelector('.qm-url-filter');
    els.quickmockUrl = panel.querySelector('.qm-quickmock-url');
    els.toggleBtn = panel.querySelector('.qm-toggle-btn');
    els.exportBtn = panel.querySelector('.qm-export-btn');
    els.clearBtn = panel.querySelector('.qm-clear-btn');
    els.closeBtn = panel.querySelector('.qm-close-btn');
    els.message = panel.querySelector('.qm-message');

    // Event listeners
    els.closeBtn.addEventListener('click', togglePanel);
    els.toggleBtn.addEventListener('click', handleToggleRecording);
    els.exportBtn.addEventListener('click', handleExport);
    els.clearBtn.addEventListener('click', handleClear);

    els.serverName.addEventListener('change', () => {
      sendSettings({ serverName: els.serverName.value });
    });
    els.urlFilter.addEventListener('change', () => {
      const filter = els.urlFilter.value;
      sendSettings({ urlFilter: filter });
      window.postMessage({ type: 'QUICKMOCK_UPDATE_FILTER', urlFilter: filter }, '*');
    });
    els.quickmockUrl.addEventListener('change', () => {
      sendSettings({ quickmockUrl: els.quickmockUrl.value });
    });

    document.body.appendChild(host);
    updateUI();
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    els.panel.style.display = panelOpen ? 'flex' : 'none';
    els.fab.classList.toggle('qm-fab-hidden', panelOpen);
  }

  // ── UI updates ───────────────────────────────────────────────────────────

  function updateUI() {
    if (!shadowRoot) return;

    const active = currentState?.active ?? false;
    const count = currentState?.recordings?.length ?? 0;

    // FAB
    els.fab.classList.toggle('qm-fab-recording', active);
    els.badge.textContent = String(count);
    els.badge.style.display = count > 0 ? 'flex' : 'none';

    // Status
    els.statusDot.className = `qm-status-dot ${active ? 'qm-dot-active' : 'qm-dot-idle'}`;
    els.statusText.textContent = active ? 'Recording' : (count > 0 ? 'Paused' : 'Idle');

    // Count
    els.count.textContent = `${count} request${count !== 1 ? 's' : ''} captured`;

    // Inputs
    els.serverName.value = currentState?.serverName || domain;
    els.urlFilter.value = currentState?.urlFilter || '';
    els.quickmockUrl.value = currentState?.quickmockUrl || 'http://localhost:3000';

    // Buttons
    els.toggleBtn.textContent = active ? 'Stop Recording' : 'Start Recording';
    els.toggleBtn.className = `qm-btn ${active ? 'qm-btn-danger' : 'qm-btn-primary'}`;
    els.exportBtn.disabled = count === 0;
    els.clearBtn.disabled = count === 0;
  }

  function updateCount(count) {
    if (!currentState) return;
    if (!currentState.recordings) currentState.recordings = [];
    // Keep a lightweight local count (don't store all data in memory)
    currentState.recordings.length = count;
    updateUI();
  }

  function showMessage(text, isError = false) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = `qm-message ${isError ? 'qm-message-error' : 'qm-message-success'}`;
    els.message.style.display = 'block';
    setTimeout(() => { els.message.style.display = 'none'; }, 4000);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleToggleRecording() {
    const active = currentState?.active ?? false;

    if (active) {
      // Stop
      const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING', domain });
      currentState = res.state;
      deactivateInterceptor();
    } else {
      // Start
      const res = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        domain,
        serverName: els.serverName.value,
        urlFilter: els.urlFilter.value,
        quickmockUrl: els.quickmockUrl.value,
      });
      currentState = res.state;
      activateInterceptor();
    }

    updateUI();
  }

  async function handleExport() {
    els.exportBtn.disabled = true;
    els.exportBtn.textContent = 'Exporting...';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'EXPORT_TO_QUICKMOCK', domain });
      if (res.error) throw new Error(res.error);
      showMessage(
        `Created "${res.serverName}" with ${res.routeCount} routes and ${res.resourceCount} resources. Opening dashboard...`
      );
      // Open dashboard in new tab
      if (res.dashboardUrl) {
        window.open(res.dashboardUrl, '_blank');
      }
    } catch (err) {
      showMessage(`Export failed: ${err.message}`, true);
    } finally {
      els.exportBtn.disabled = false;
      els.exportBtn.textContent = 'Export to QuickMock';
      updateUI();
    }
  }

  async function handleClear() {
    if (!confirm('Clear all captured requests?')) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_RECORDINGS', domain });
    if (currentState) {
      currentState.recordings = [];
    }
    updateUI();
    showMessage('Recordings cleared');
  }

  async function sendSettings(settings) {
    if (currentState) Object.assign(currentState, settings);
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', domain, ...settings });
  }

  // ── Panel HTML ───────────────────────────────────────────────────────────

  function getPanelHTML() {
    return `
      <div class="qm-panel-header">
        <div class="qm-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
          <span>QuickMock Recorder</span>
        </div>
        <button class="qm-close-btn" title="Close panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="qm-panel-status">
        <span class="qm-status-dot qm-dot-idle"></span>
        <span class="qm-status-text">Idle</span>
        <span class="qm-count-sep">&middot;</span>
        <span class="qm-count">0 requests captured</span>
      </div>

      <div class="qm-message" style="display:none"></div>

      <div class="qm-panel-body">
        <label class="qm-label">
          Server Name
          <input type="text" class="qm-input qm-server-name" placeholder="My API Mock" />
        </label>

        <label class="qm-label">
          URL Filter <span class="qm-hint">(only capture paths containing this)</span>
          <input type="text" class="qm-input qm-url-filter" placeholder="/api/" />
        </label>

        <label class="qm-label">
          QuickMock URL
          <input type="text" class="qm-input qm-quickmock-url" placeholder="http://localhost:3000" />
        </label>
      </div>

      <div class="qm-panel-actions">
        <button class="qm-btn qm-btn-primary qm-toggle-btn">Start Recording</button>
        <div class="qm-panel-actions-row">
          <button class="qm-btn qm-btn-secondary qm-export-btn" disabled>Export to QuickMock</button>
          <button class="qm-btn qm-btn-ghost qm-clear-btn" disabled>Clear</button>
        </div>
      </div>
    `;
  }

  // ── Styles ───────────────────────────────────────────────────────────────

  function getStyles() {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .qm-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        background: #18181b;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
        transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        z-index: 2147483647;
      }
      .qm-fab:hover {
        transform: scale(1.08);
        background: #27272a;
      }
      .qm-fab-recording {
        background: #dc2626;
        animation: qm-pulse 2s ease-in-out infinite;
      }
      .qm-fab-recording:hover {
        background: #ef4444;
      }
      .qm-fab-hidden {
        display: none;
      }

      @keyframes qm-pulse {
        0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 0px rgba(220,38,38,0.4); }
        50% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 8px rgba(220,38,38,0); }
      }

      .qm-fab-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        background: #ef4444;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
        line-height: 1;
        border: 2px solid #18181b;
      }

      .qm-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 340px;
        max-height: calc(100vh - 40px);
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
        color: #fafafa;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 2147483647;
      }

      .qm-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 12px;
        border-bottom: 1px solid #27272a;
      }
      .qm-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: #fafafa;
      }

      .qm-close-btn {
        background: none;
        border: none;
        color: #71717a;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background 0.15s;
      }
      .qm-close-btn:hover {
        color: #fafafa;
        background: #27272a;
      }

      .qm-panel-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        font-size: 12px;
        color: #a1a1aa;
        border-bottom: 1px solid #27272a;
      }

      .qm-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .qm-dot-active {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239,68,68,0.6);
        animation: qm-dot-blink 1.5s ease-in-out infinite;
      }
      .qm-dot-idle {
        background: #52525b;
      }

      @keyframes qm-dot-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .qm-count-sep {
        color: #52525b;
      }

      .qm-message {
        padding: 8px 16px;
        font-size: 12px;
        line-height: 1.4;
      }
      .qm-message-success {
        background: #052e16;
        color: #4ade80;
        border-bottom: 1px solid #14532d;
      }
      .qm-message-error {
        background: #450a0a;
        color: #fca5a5;
        border-bottom: 1px solid #7f1d1d;
      }

      .qm-panel-body {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
      }

      .qm-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        font-weight: 500;
        color: #a1a1aa;
      }
      .qm-hint {
        font-weight: 400;
        color: #52525b;
        font-size: 11px;
      }

      .qm-input {
        width: 100%;
        padding: 7px 10px;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 6px;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
      }
      .qm-input:focus {
        border-color: #3b82f6;
      }
      .qm-input::placeholder {
        color: #3f3f46;
      }

      .qm-panel-actions {
        padding: 12px 16px 14px;
        border-top: 1px solid #27272a;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .qm-panel-actions-row {
        display: flex;
        gap: 8px;
      }

      .qm-btn {
        padding: 8px 14px;
        border-radius: 6px;
        border: none;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
        text-align: center;
      }
      .qm-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .qm-btn-primary {
        background: #3b82f6;
        color: #fff;
        width: 100%;
      }
      .qm-btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }

      .qm-btn-danger {
        background: #dc2626;
        color: #fff;
        width: 100%;
      }
      .qm-btn-danger:hover:not(:disabled) {
        background: #ef4444;
      }

      .qm-btn-secondary {
        background: #27272a;
        color: #fafafa;
        flex: 1;
      }
      .qm-btn-secondary:hover:not(:disabled) {
        background: #3f3f46;
      }

      .qm-btn-ghost {
        background: transparent;
        color: #71717a;
        border: 1px solid #27272a;
      }
      .qm-btn-ghost:hover:not(:disabled) {
        color: #fafafa;
        border-color: #3f3f46;
      }
    `;
  }
})();
