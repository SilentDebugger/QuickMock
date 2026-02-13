/**
 * QuickMock Interceptor — runs in MAIN world (page context).
 *
 * Patches window.fetch and XMLHttpRequest to capture API request/response
 * pairs, then forwards them to the ISOLATED content script via postMessage.
 *
 * Only activates when it receives a QUICKMOCK_ACTIVATE message from the
 * content script. Stays dormant otherwise so it adds zero overhead to pages
 * where recording is not enabled.
 */
(() => {
  'use strict';

  // Guard against double injection
  if (window.__quickmockInterceptorInstalled) return;
  window.__quickmockInterceptorInstalled = true;

  let active = false;
  let urlFilter = '';

  // ── Helpers ────────────────────────────────────────────────────────────

  const SKIP_PROTOCOLS = ['chrome-extension:', 'moz-extension:', 'blob:', 'data:', 'about:'];

  function shouldSkipUrl(url) {
    try {
      const u = new URL(url, location.origin);
      return SKIP_PROTOCOLS.some((p) => u.protocol === p);
    } catch {
      return true;
    }
  }

  function matchesFilter(url) {
    if (!urlFilter) return true;
    try {
      const u = new URL(url, location.origin);
      return u.pathname.includes(urlFilter);
    } catch {
      return false;
    }
  }

  function isJsonContentType(ct) {
    if (!ct) return false;
    return ct.includes('application/json') || ct.includes('text/json');
  }

  function safeStringify(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  function headersToObject(headers) {
    const obj = {};
    if (!headers) return obj;
    if (typeof headers.forEach === 'function') {
      headers.forEach((v, k) => { obj[k] = v; });
    } else if (typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        obj[k.toLowerCase()] = String(v);
      }
    }
    return obj;
  }

  function emit(entry) {
    window.postMessage({ type: 'QUICKMOCK_CAPTURED', payload: entry }, '*');
  }

  // ── Patch fetch ────────────────────────────────────────────────────────

  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(input, init) {
    // If not recording, pass through immediately
    if (!active) return originalFetch.call(this, input, init);

    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input?.url || '';

    if (shouldSkipUrl(url) || !matchesFilter(url)) {
      return originalFetch.call(this, input, init);
    }

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // Collect request headers
    let reqHeaders = {};
    if (init?.headers) {
      reqHeaders = headersToObject(init.headers instanceof Headers ? init.headers : new Headers(init.headers));
    } else if (input instanceof Request) {
      reqHeaders = headersToObject(input.headers);
    }

    // Collect request body
    let reqBody;
    if (init?.body !== undefined && init?.body !== null) {
      reqBody = typeof init.body === 'string' ? init.body : safeStringify(init.body);
    } else if (input instanceof Request && !['GET', 'HEAD'].includes(method)) {
      try { reqBody = await input.clone().text(); } catch { /* ignore */ }
    }

    let response;
    try {
      response = await originalFetch.call(this, input, init);
    } catch (err) {
      throw err;
    }

    // Only capture JSON responses
    const ct = response.headers.get('content-type') || '';
    if (!isJsonContentType(ct)) return response;

    // Clone so the page can still read the body
    const clone = response.clone();

    // Read body asynchronously — don't block the caller
    clone.text().then((body) => {
      const respHeaders = headersToObject(response.headers);
      try {
        const u = new URL(url, location.origin);
        emit({
          method,
          path: u.pathname + u.search,
          status: response.status,
          requestHeaders: reqHeaders,
          requestBody: reqBody,
          responseHeaders: respHeaders,
          body,
          timestamp: Date.now(),
        });
      } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });

    return response;
  };

  // ── Patch XMLHttpRequest ───────────────────────────────────────────────

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__qm = { method: (method || 'GET').toUpperCase(), url: String(url), headers: {} };
    return xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__qm) {
      this.__qm.headers[name.toLowerCase()] = value;
    }
    return xhrSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (!active || !this.__qm) return xhrSend.call(this, body);

    const { method, url, headers } = this.__qm;

    if (shouldSkipUrl(url) || !matchesFilter(url)) {
      return xhrSend.call(this, body);
    }

    const reqBody = safeStringify(body);

    this.addEventListener('load', function () {
      const ct = this.getResponseHeader('content-type') || '';
      if (!isJsonContentType(ct)) return;

      try {
        const u = new URL(url, location.origin);
        const respHeaders = {};
        const raw = this.getAllResponseHeaders().trim();
        if (raw) {
          raw.split(/\r?\n/).forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) {
              respHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
            }
          });
        }

        emit({
          method,
          path: u.pathname + u.search,
          status: this.status,
          requestHeaders: headers,
          requestBody: reqBody,
          responseHeaders: respHeaders,
          body: this.responseText,
          timestamp: Date.now(),
        });
      } catch { /* ignore */ }
    });

    return xhrSend.call(this, body);
  };

  // ── Control channel ────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'QUICKMOCK_ACTIVATE') {
      active = true;
      urlFilter = msg.urlFilter || '';
    } else if (msg.type === 'QUICKMOCK_DEACTIVATE') {
      active = false;
    } else if (msg.type === 'QUICKMOCK_UPDATE_FILTER') {
      urlFilter = msg.urlFilter || '';
    }
  });
})();
