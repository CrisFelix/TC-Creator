# TC Creator

A lightweight, browser-based test case manager. No build step, no server, no dependencies — just open and use.

## Features

- Create, edit, and delete test cases with ID, title, steps, expected result, type, and status
- Auto-number steps with one click
- Smart type suggestion (Automated vs Manual) based on keyword scoring
- Filter by type and status; search by ID, title, or steps
- Sort any column
- Full CSV export (respects active filter) and import with upsert support
- Data persisted in `localStorage` — nothing leaves your browser

## Installation & Setup

**Prerequisites:** A modern browser (Chrome, Firefox, Edge, Safari). No Node.js required for Option 1.

### Option 1 — Open directly (simplest)

1. Clone or download the repository:
   ```bash
   git clone https://github.com/CrisFelix/TC-Creator.git
   cd TC-Creator
   ```
2. Open `index.html` in your browser:
   - **Windows:** double-click `index.html`, or right-click → Open with → your browser
   - **Mac/Linux:** `open index.html` or drag it into a browser window

### Option 2 — Local server (recommended for Chromium-based browsers)

Some Chromium security policies block `localStorage` under `file://`. If the app loads but test cases don't save, use this instead:

1. Make sure [Node.js](https://nodejs.org) is installed.
2. Clone the repository and start a local server:
   ```bash
   git clone https://github.com/CrisFelix/TC-Creator.git
   cd TC-Creator
   npx serve .
   ```
3. Open `http://localhost:3000` in your browser.

## Data Model

| Field | Type | Description |
|---|---|---|
| `id` | string | e.g. `TC-001` |
| `title` | string | Short description |
| `steps` | string | Newline-separated steps |
| `expectedResult` | string | Expected outcome |
| `type` | `automated` \| `manual` | Classification |
| `status` | `Draft` \| `Ready` \| `Pass` \| `Fail` \| `Blocked` | Current state |
| `updatedAt` | ISO 8601 | Last modified timestamp |

## CSV Import / Export

- **Export**: downloads all visible test cases as a UTF-8 CSV (Excel-compatible BOM included). Steps are joined with ` | `.
- **Import**: maps headers case-insensitively. Missing ID → auto-generated. Existing ID → overwrite. Steps ` | ` → restored to newlines.

## Project Structure

```
index.html   — markup
styles.css   — theming and layout
app.js       — four IIFE modules: TCStore, Classifier, CSVExport, CSVImport, UI
```

## License

MIT
