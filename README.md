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

## Getting Started

**Option 1 — Open directly:**
```
index.html  →  open in browser
```

**Option 2 — Local server** (if `file://` blocks localStorage):
```bash
npx serve .
# then open http://localhost:3000
```

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
