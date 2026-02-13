/**
 * QuickMock Recorder — Background Service Worker
 *
 * Manages per-domain recording state in chrome.storage.local, accumulates
 * captured request/response pairs, converts them to HAR format, and exports
 * to the QuickMock management API.
 */

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_QUICKMOCK_URL = 'http://localhost:3000';
const STORAGE_KEY_GLOBAL = 'quickmock:global';

// ── Storage helpers ───────────────────────────────────────────────────────

function domainKey(domain) {
  return `quickmock:domain:${domain}`;
}

async function getGlobalSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_GLOBAL);
  return result[STORAGE_KEY_GLOBAL] || { quickmockUrl: DEFAULT_QUICKMOCK_URL };
}

async function setGlobalSettings(settings) {
  const current = await getGlobalSettings();
  await chrome.storage.local.set({
    [STORAGE_KEY_GLOBAL]: { ...current, ...settings },
  });
}

async function getDomainState(domain) {
  const result = await chrome.storage.local.get(domainKey(domain));
  return result[domainKey(domain)] || null;
}

async function setDomainState(domain, state) {
  await chrome.storage.local.set({ [domainKey(domain)]: state });
}

async function removeDomainState(domain) {
  await chrome.storage.local.remove(domainKey(domain));
}

/** List all domains that have recording state. */
async function listActiveDomains() {
  const all = await chrome.storage.local.get(null);
  const domains = [];
  const prefix = 'quickmock:domain:';
  for (const key of Object.keys(all)) {
    if (key.startsWith(prefix)) {
      domains.push({ domain: key.slice(prefix.length), state: all[key] });
    }
  }
  return domains;
}

// ── Badge ─────────────────────────────────────────────────────────────────

async function updateBadge(tabId, domain) {
  try {
    const state = domain ? await getDomainState(domain) : null;
    if (state && state.active) {
      const count = (state.recordings || []).length;
      await chrome.action.setBadgeText({ tabId, text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch {
    // Tab may have been closed
  }
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Update badge when the active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = getDomainFromUrl(tab.url);
    await updateBadge(activeInfo.tabId, domain);
  } catch { /* ignore */ }
});

// Update badge when a tab navigates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const domain = getDomainFromUrl(tab.url);
    await updateBadge(tabId, domain);
  }
});

// ── HAR conversion ────────────────────────────────────────────────────────

/**
 * Convert captured recordings into the HAR format that QuickMock's
 * parseHar() accepts (see src/schema/har.ts).
 */
function recordingsToHar(recordings, baseUrl) {
  const entries = recordings
    .filter((r) => r.status >= 200)
    .map((r) => ({
      request: {
        method: r.method,
        url: `${baseUrl}${r.path}`,
        ...(r.requestBody
          ? { postData: { mimeType: 'application/json', text: r.requestBody } }
          : {}),
      },
      response: {
        status: r.status,
        content: {
          mimeType: 'application/json',
          text: r.body || '',
        },
      },
    }));

  return { log: { entries } };
}

// ── QuickMock API ─────────────────────────────────────────────────────────

async function exportToQuickMock(domain) {
  const state = await getDomainState(domain);
  if (!state || !state.recordings || state.recordings.length === 0) {
    throw new Error('No recordings to export');
  }

  const global = await getGlobalSettings();
  const quickmockUrl = state.quickmockUrl || global.quickmockUrl || DEFAULT_QUICKMOCK_URL;
  const serverName = state.serverName || domain;

  // 1. Convert recordings to HAR
  const baseUrl = `https://${domain}`;
  const har = recordingsToHar(state.recordings, baseUrl);

  // 2. Parse HAR through QuickMock's importer
  const importRes = await fetch(`${quickmockUrl}/__api/import/har`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ har, baseUrl }),
  });

  if (!importRes.ok) {
    const err = await importRes.text();
    throw new Error(`HAR import failed: ${err}`);
  }

  const { routes: parsedRoutes, resources: parsedResources } = await importRes.json();

  // 3. Build route configs and resource configs
  const routes = (parsedRoutes || []).map((r) => r.config);
  const resources = {};
  for (const r of parsedResources || []) {
    resources[r.name] = r.config;
  }

  // 4. Create server with routes and resources
  const createRes = await fetch(`${quickmockUrl}/__api/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: serverName,
      description: `Recorded from ${domain} on ${new Date().toLocaleDateString()}`,
      cors: true,
      proxyTarget: baseUrl,
      routes,
      resources,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Server creation failed: ${err}`);
  }

  const server = await createRes.json();

  // 5. Import raw recordings so they appear in the Recordings tab / Try It
  const recordings = state.recordings.map((r) => ({
    method: r.method,
    path: r.path,
    status: r.status,
    requestHeaders: r.requestHeaders,
    requestBody: r.requestBody,
    responseHeaders: r.responseHeaders,
    body: r.body,
    timestamp: r.timestamp,
  }));

  if (recordings.length > 0) {
    try {
      await fetch(`${quickmockUrl}/__api/servers/${server.id}/recordings/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordings),
      });
    } catch {
      // Non-critical — server was created, recordings import is best-effort
    }
  }

  return {
    serverId: server.id,
    serverName: server.name,
    dashboardUrl: `${quickmockUrl}/__dashboard/servers/${server.id}`,
    routeCount: routes.length,
    resourceCount: Object.keys(resources).length,
  };
}

// ── Message handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: err.message || String(err) });
  });
  return true; // Keep the channel open for async response
});

async function handleMessage(message, sender) {
  const { type, domain, ...data } = message;

  switch (type) {
    // ── State queries ───────────────────────────────

    case 'GET_STATE': {
      const state = await getDomainState(domain);
      const global = await getGlobalSettings();
      return { state, global };
    }

    case 'GET_GLOBAL_SETTINGS': {
      return await getGlobalSettings();
    }

    case 'SET_GLOBAL_SETTINGS': {
      await setGlobalSettings(data.settings);
      return { ok: true };
    }

    case 'LIST_ACTIVE_DOMAINS': {
      return await listActiveDomains();
    }

    // ── Recording lifecycle ─────────────────────────

    case 'START_RECORDING': {
      const global = await getGlobalSettings();
      const existing = await getDomainState(domain);
      const state = {
        active: true,
        serverName: data.serverName || existing?.serverName || domain,
        quickmockUrl: data.quickmockUrl || existing?.quickmockUrl || global.quickmockUrl,
        urlFilter: data.urlFilter ?? existing?.urlFilter ?? '',
        recordings: existing?.recordings || [],
        startedAt: existing?.startedAt || Date.now(),
      };
      await setDomainState(domain, state);

      // Update badge on the sender tab
      if (sender.tab?.id) {
        await updateBadge(sender.tab.id, domain);
      }

      return { ok: true, state };
    }

    case 'STOP_RECORDING': {
      const state = await getDomainState(domain);
      if (state) {
        state.active = false;
        await setDomainState(domain, state);
      }

      if (sender.tab?.id) {
        await updateBadge(sender.tab.id, domain);
      }

      return { ok: true, state };
    }

    case 'UPDATE_SETTINGS': {
      const state = await getDomainState(domain);
      if (state) {
        if (data.serverName !== undefined) state.serverName = data.serverName;
        if (data.urlFilter !== undefined) state.urlFilter = data.urlFilter;
        if (data.quickmockUrl !== undefined) state.quickmockUrl = data.quickmockUrl;
        await setDomainState(domain, state);
      }
      return { ok: true, state };
    }

    // ── Capture ─────────────────────────────────────

    case 'CAPTURE_REQUEST': {
      const state = await getDomainState(domain);
      if (!state || !state.active) return { ok: false };

      if (!state.recordings) state.recordings = [];
      state.recordings.push(data.entry);

      // Cap at 2000 recordings to prevent storage issues
      if (state.recordings.length > 2000) {
        state.recordings = state.recordings.slice(-2000);
      }

      await setDomainState(domain, state);

      // Update badge
      if (sender.tab?.id) {
        await updateBadge(sender.tab.id, domain);
      }

      return { ok: true, count: state.recordings.length };
    }

    // ── Export ───────────────────────────────────────

    case 'EXPORT_TO_QUICKMOCK': {
      const result = await exportToQuickMock(domain);
      return { ok: true, ...result };
    }

    // ── Clear ───────────────────────────────────────

    case 'CLEAR_RECORDINGS': {
      const state = await getDomainState(domain);
      if (state) {
        state.recordings = [];
        await setDomainState(domain, state);
      }

      if (sender.tab?.id) {
        await updateBadge(sender.tab.id, domain);
      }

      return { ok: true };
    }

    case 'DELETE_DOMAIN': {
      await removeDomainState(domain);

      if (sender.tab?.id) {
        await updateBadge(sender.tab.id, null);
      }

      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}
