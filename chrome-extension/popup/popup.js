/**
 * QuickMock Recorder — Popup Script
 *
 * Controls the extension toolbar popup. Lets the user:
 * - Activate / deactivate recording for the current domain
 * - Configure the default QuickMock URL
 * - See which domains have active recordings
 * - Quick-link to the QuickMock dashboard
 */
document.addEventListener('DOMContentLoaded', async () => {
  const els = {
    domainName: document.getElementById('domain-name'),
    statusDot: document.getElementById('status-dot'),
    toggleBtn: document.getElementById('toggle-btn'),
    infoText: document.getElementById('info-text'),
    quickmockUrl: document.getElementById('quickmock-url'),
    activeSection: document.getElementById('active-section'),
    activeList: document.getElementById('active-list'),
    dashboardLink: document.getElementById('dashboard-link'),
  };

  let currentDomain = null;
  let currentState = null;
  let globalSettings = {};

  // ── Get current tab info ──────────────────────────────────

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      currentDomain = url.hostname;

      // Don't allow recording on chrome:// or extension pages
      if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'about:') {
        currentDomain = null;
      }
    }
  } catch {
    // Ignore
  }

  if (!currentDomain) {
    els.domainName.textContent = 'Not available';
    els.toggleBtn.disabled = true;
    els.toggleBtn.textContent = 'Cannot record this page';
  } else {
    els.domainName.textContent = currentDomain;
    els.toggleBtn.disabled = false;
  }

  // ── Load state ────────────────────────────────────────────

  async function loadState() {
    if (currentDomain) {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATE', domain: currentDomain });
      currentState = res?.state || null;
      globalSettings = res?.global || {};
    } else {
      const res = await chrome.runtime.sendMessage({ type: 'GET_GLOBAL_SETTINGS' });
      globalSettings = res || {};
    }

    // Fill QuickMock URL
    els.quickmockUrl.value = globalSettings.quickmockUrl || 'http://localhost:3000';

    // Update dashboard link
    const baseUrl = els.quickmockUrl.value;
    els.dashboardLink.href = `${baseUrl}/__dashboard`;

    updateToggleButton();
    await loadActiveDomains();
  }

  function updateToggleButton() {
    if (!currentDomain) return;

    const active = currentState?.active ?? false;
    const hasRecordings = (currentState?.recordings?.length ?? 0) > 0;

    els.statusDot.className = `status-dot ${active ? 'active' : ''}`;

    if (active) {
      els.toggleBtn.textContent = 'Deactivate recording';
      els.toggleBtn.className = 'btn btn-danger';
    } else if (hasRecordings) {
      els.toggleBtn.textContent = 'Resume recording';
      els.toggleBtn.className = 'btn btn-primary';
    } else {
      els.toggleBtn.textContent = 'Activate on this domain';
      els.toggleBtn.className = 'btn btn-primary';
    }
  }

  async function loadActiveDomains() {
    const domains = await chrome.runtime.sendMessage({ type: 'LIST_ACTIVE_DOMAINS' });

    if (!domains || domains.length === 0) {
      els.activeSection.style.display = 'none';
      return;
    }

    els.activeSection.style.display = 'block';
    els.activeList.innerHTML = '';

    for (const { domain, state } of domains) {
      const item = document.createElement('div');
      item.className = 'active-item';

      const count = state.recordings?.length ?? 0;
      const isActive = state.active;

      item.innerHTML = `
        <div class="active-item-left">
          <span class="active-item-dot ${isActive ? 'recording' : ''}"></span>
          <span class="active-item-domain">${escapeHtml(domain)}</span>
        </div>
        <span class="active-item-count">${count} req${count !== 1 ? 's' : ''}</span>
      `;

      els.activeList.appendChild(item);
    }
  }

  // ── Event listeners ───────────────────────────────────────

  els.toggleBtn.addEventListener('click', async () => {
    if (!currentDomain) return;

    const active = currentState?.active ?? false;

    if (active) {
      // Deactivate
      const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING', domain: currentDomain });
      currentState = res.state;

      // Tell content script to deactivate
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'DOMAIN_DEACTIVATED', domain: currentDomain });
      }
    } else {
      // Activate
      const res = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        domain: currentDomain,
        quickmockUrl: els.quickmockUrl.value,
      });
      currentState = res.state;

      // Tell content script to activate and inject UI
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'DOMAIN_ACTIVATED', domain: currentDomain, state: currentState });
      }

      showInfo('Recording activated! Use the floating button on the page to configure and export.', false);
    }

    updateToggleButton();
    await loadActiveDomains();
  });

  els.quickmockUrl.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'SET_GLOBAL_SETTINGS',
      settings: { quickmockUrl: els.quickmockUrl.value },
    });
    els.dashboardLink.href = `${els.quickmockUrl.value}/__dashboard`;
  });

  els.dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: els.dashboardLink.href });
  });

  // ── Helpers ───────────────────────────────────────────────

  function showInfo(text, isError) {
    els.infoText.textContent = text;
    els.infoText.className = `info ${isError ? 'error' : 'success'}`;
    els.infoText.style.display = 'block';
    setTimeout(() => { els.infoText.style.display = 'none'; }, 4000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──────────────────────────────────────────────────

  await loadState();
});
