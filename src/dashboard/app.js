// ── State ──────────────────────────────────────────

let state = { routes: [], resources: [], options: {} };
let selectedEndpoint = null; // { type: 'route'|'resource', key: number|string }

// ── DOM refs ───────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const serverInfo    = $('#server-info');
const endpointsList = $('#endpoints-list');
const tryitMethod   = $('#tryit-method');
const tryitUrl      = $('#tryit-url');
const tryitHeaders  = $('#tryit-headers');
const tryitBody     = $('#tryit-body');
const tryitSend     = $('#tryit-send');
const tryitResponse = $('#tryit-response');
const responseMeta  = $('#response-meta');
const responseBody  = $('#response-body');
const logEntries    = $('#log-entries');
const logClear      = $('#log-clear');
const logAutoscroll = $('#log-autoscroll');

// ── API client ─────────────────────────────────────

async function fetchState() {
  const res = await fetch('/__api/state');
  state = await res.json();
  renderServerInfo();
  renderEndpoints();
}

async function patchOverride(type, key, override) {
  const url = type === 'route' ? `/__api/routes/${key}` : `/__api/resources/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(override),
  });
}

// ── Render: server info ────────────────────────────

function renderServerInfo() {
  const { host, port } = state.options;
  serverInfo.textContent = `${host}:${port}`;
}

// ── Render: endpoints ──────────────────────────────

function renderEndpoints() {
  endpointsList.innerHTML = '';

  if (state.routes.length > 0) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Routes';
    endpointsList.appendChild(label);

    for (const route of state.routes) {
      endpointsList.appendChild(createRouteCard(route));
    }
  }

  if (state.resources.length > 0) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Resources';
    endpointsList.appendChild(label);

    for (const resource of state.resources) {
      endpointsList.appendChild(createResourceCard(resource));
    }
  }
}

function createRouteCard(route) {
  const card = document.createElement('div');
  card.className = 'endpoint-card';
  if (route.override?.disabled) card.classList.add('disabled');
  if (selectedEndpoint?.type === 'route' && selectedEndpoint.key === route.index) {
    card.classList.add('selected');
  }

  const effectiveDelay = route.override?.delay ?? route.delay ?? 0;
  const effectiveError = route.override?.error ?? route.error ?? 0;
  const enabled = !route.override?.disabled;

  card.innerHTML = `
    <div class="card-header">
      <span class="method-badge ${route.method.toLowerCase()}">${route.method}</span>
      <span class="card-path">${route.path}</span>
    </div>
    <div class="card-meta">Status ${route.status}</div>
    <div class="card-controls">
      <div class="control-group">
        <label>Delay</label>
        <input type="number" class="ctrl-delay" value="${effectiveDelay}" min="0" step="50" placeholder="0">
        <label>ms</label>
      </div>
      <div class="control-group">
        <label>Error</label>
        <input type="number" class="ctrl-error" value="${Math.round(effectiveError * 100)}" min="0" max="100" step="5">
        <label>%</label>
      </div>
      <label class="toggle-label">
        <input type="checkbox" class="ctrl-enabled" ${enabled ? 'checked' : ''}>
        Enabled
      </label>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-controls')) return;
    selectEndpoint('route', route.index, route.method, route.path);
  });

  bindCardControls(card, 'route', route.index);
  return card;
}

function createResourceCard(resource) {
  const card = document.createElement('div');
  card.className = 'endpoint-card';
  if (resource.override?.disabled) card.classList.add('disabled');
  if (selectedEndpoint?.type === 'resource' && selectedEndpoint.key === resource.name) {
    card.classList.add('selected');
  }

  const effectiveDelay = resource.override?.delay ?? resource.delay ?? 0;
  const effectiveError = resource.override?.error ?? resource.error ?? 0;
  const enabled = !resource.override?.disabled;

  card.innerHTML = `
    <div class="card-header">
      <span class="method-badge" style="color: var(--accent)">CRUD</span>
      <span class="card-path">${resource.basePath}</span>
    </div>
    <div class="card-meta">${resource.name} &middot; ${resource.itemCount} items</div>
    <div class="card-controls">
      <div class="control-group">
        <label>Delay</label>
        <input type="number" class="ctrl-delay" value="${effectiveDelay}" min="0" step="50" placeholder="0">
        <label>ms</label>
      </div>
      <div class="control-group">
        <label>Error</label>
        <input type="number" class="ctrl-error" value="${Math.round(effectiveError * 100)}" min="0" max="100" step="5">
        <label>%</label>
      </div>
      <label class="toggle-label">
        <input type="checkbox" class="ctrl-enabled" ${enabled ? 'checked' : ''}>
        Enabled
      </label>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-controls')) return;
    selectEndpoint('resource', resource.name, 'GET', resource.basePath);
  });

  bindCardControls(card, 'resource', resource.name);
  return card;
}

function bindCardControls(card, type, key) {
  const delayInput   = card.querySelector('.ctrl-delay');
  const errorInput   = card.querySelector('.ctrl-error');
  const enabledInput = card.querySelector('.ctrl-enabled');

  let debounceTimer;
  const debounce = (fn) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fn, 300); };

  delayInput.addEventListener('input', () => {
    debounce(() => patchOverride(type, key, { delay: parseInt(delayInput.value) || 0 }));
  });
  delayInput.addEventListener('click', (e) => e.stopPropagation());

  errorInput.addEventListener('input', () => {
    debounce(() => patchOverride(type, key, { error: (parseInt(errorInput.value) || 0) / 100 }));
  });
  errorInput.addEventListener('click', (e) => e.stopPropagation());

  enabledInput.addEventListener('change', () => {
    const disabled = !enabledInput.checked;
    patchOverride(type, key, { disabled });
    card.classList.toggle('disabled', disabled);
  });
  enabledInput.addEventListener('click', (e) => e.stopPropagation());
}

// ── Select endpoint → populate Try It ──────────────

function selectEndpoint(type, key, method, path) {
  selectedEndpoint = { type, key };
  tryitMethod.value = method;
  tryitUrl.value = path;
  tryitBody.value = '';
  tryitHeaders.value = '';
  tryitResponse.classList.add('hidden');
  renderEndpoints();
}

// ── Try It: send request ───────────────────────────

async function sendRequest() {
  const method = tryitMethod.value;
  const url = tryitUrl.value;
  if (!url) return;

  const opts = { method, headers: {} };

  // Parse custom headers
  const headersText = tryitHeaders.value.trim();
  if (headersText) {
    try {
      Object.assign(opts.headers, JSON.parse(headersText));
    } catch { /* ignore invalid headers */ }
  }

  // Attach body for non-GET
  if (method !== 'GET' && method !== 'DELETE') {
    const bodyText = tryitBody.value.trim();
    if (bodyText) {
      opts.body = bodyText;
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    }
  }

  const start = performance.now();
  try {
    const res = await fetch(url, opts);
    const ms = Math.round(performance.now() - start);
    const text = await res.text();

    let formatted;
    try { formatted = JSON.stringify(JSON.parse(text), null, 2); }
    catch { formatted = text; }

    const statusClass = res.status < 300 ? 'ok' : res.status < 400 ? 'redirect' : 'error';
    responseMeta.innerHTML = `
      <span class="status ${statusClass}">${res.status} ${res.statusText}</span>
      <span class="timing">${ms}ms</span>
    `;
    responseBody.textContent = formatted || '(empty response)';
    tryitResponse.classList.remove('hidden');
  } catch (err) {
    responseMeta.innerHTML = `<span class="status error">Error</span>`;
    responseBody.textContent = err.message;
    tryitResponse.classList.remove('hidden');
  }
}

tryitSend.addEventListener('click', sendRequest);
tryitUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendRequest(); });

// ── Live Log (SSE) ─────────────────────────────────

function connectLog() {
  const source = new EventSource('/__api/log');

  source.addEventListener('message', (e) => {
    const entry = JSON.parse(e.data);
    appendLogEntry(entry);
  });

  source.addEventListener('error', () => {
    setTimeout(connectLog, 2000);
    source.close();
  });
}

function appendLogEntry(entry) {
  const row = document.createElement('div');
  row.className = 'log-entry';

  const time = new Date(entry.timestamp).toLocaleTimeString();
  const methodClass = entry.method.toLowerCase();
  const statusClass = entry.status < 300 ? 'ok' : entry.status < 400 ? 'redirect' : 'error';

  row.innerHTML = `
    <span class="time">${time}</span>
    <span class="method ${methodClass}">${entry.method}</span>
    <span class="path">${entry.path}</span>
    <span class="status ${statusClass}">${entry.status}</span>
    <span class="ms">${entry.ms}ms</span>
  `;

  logEntries.appendChild(row);

  // Keep max 500 entries
  while (logEntries.children.length > 500) {
    logEntries.removeChild(logEntries.firstChild);
  }

  if (logAutoscroll.checked) {
    logEntries.scrollTop = logEntries.scrollHeight;
  }
}

logClear.addEventListener('click', () => { logEntries.innerHTML = ''; });

// ── Init ───────────────────────────────────────────

fetchState();
connectLog();
