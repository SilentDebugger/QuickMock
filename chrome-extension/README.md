# QuickMock Recorder — Chrome Extension

Record API requests from any website and export them to QuickMock as a fully configured mock server.

## Install

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select this `chrome-extension/` directory

The QuickMock Recorder icon appears in the toolbar.

## Usage

1. **Activate** — Click the extension icon and press "Activate on this domain"
2. **Configure** — A floating button appears in the bottom-right corner of the page. Click it to open the panel:
   - **Server Name** — name for the mock server that will be created
   - **URL Filter** — only capture requests whose path contains this string (e.g. `/api/`)
   - **QuickMock URL** — where your QuickMock management server is running (default `http://localhost:3000`)
3. **Record** — Click "Start Recording" and browse the site normally. All JSON API requests are captured automatically.
4. **Export** — Click "Export to QuickMock" to create a mock server with all captured routes and resources. The QuickMock dashboard opens in a new tab.

## How It Works

- **interceptor.js** runs in the page context (MAIN world) and patches `fetch()` and `XMLHttpRequest` to capture request/response pairs
- **content.js** runs in Chrome's isolated world, creates the floating UI via Shadow DOM, and bridges data to the background worker
- **background.js** is a Manifest V3 service worker that stores recordings in `chrome.storage.local` and handles the QuickMock API export

### Persistence

Recordings and activation state are stored in `chrome.storage.local`, which persists across:
- Page reloads
- Tab closes and re-opens
- Browser restarts

The extension uses `unlimitedStorage` permission so there's no cap on recording size.

### Export Flow

When you click "Export to QuickMock", the extension:
1. Converts captured requests into HAR format
2. Sends the HAR to QuickMock's `/__api/import/har` endpoint (which handles path parameterization, CRUD detection, and faker template generation)
3. Creates a new mock server with the parsed routes and resources
4. Opens the QuickMock dashboard for the new server

## Requirements

- Chrome 110+ (Manifest V3 support)
- QuickMock running locally (`quickmock` command) for export
