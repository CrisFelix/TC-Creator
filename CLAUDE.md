# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

Open `index.html` directly in a browser — no build step, no server required.

If localStorage is blocked under `file://` (some Chromium security policies), serve locally:

```
npx serve .
```

Then open `http://localhost:3000`.

## Architecture

Single-page app: three files, no dependencies, no framework.

| File | Role |
|---|---|
| `index.html` | All markup: header, TC form modal, controls bar, table, classification guide |
| `styles.css` | CSS custom properties for theming; all layout, badge colours, and modal animations |
| `app.js` | Five IIFE modules loaded in order at bottom of `<body>` |

### Module layout in `app.js`

```
TCStore      — localStorage CRUD (key: "tc_creator_v1")
Classifier   — keyword-scoring suggest() for automated vs manual
CSVExport    — RFC 4180 CSV download with UTF-8 BOM
CSVImport    — RFC 4180 CSV parser + column-header mapper + FileReader import
UI           — all DOM wiring, render loop, modals, toast, sorting, filtering
```

Each module is a self-contained IIFE that exposes only its public API. `UI` depends on the other four; the others are independent of each other.

### Data model

Each test case stored in localStorage is a plain object:

```js
{
  id:             string,          // e.g. "TC-001"
  title:          string,
  steps:          string,          // newline-separated; "1. Step one\n2. Step two"
  expectedResult: string,
  priority:       number | null,   // positive integer, null = unset
  type:           "automated" | "manual",
  status:         "Draft" | "Ready" | "Pass" | "Fail" | "Blocked",
  attachments:    Array<{ name: string, type: string, size: number, data: string }>,
                                   // data is a base64 data URL; 2 MB per-file limit
  updatedAt:      ISO 8601 string
}
```

### Key behaviours to know

- **Auto-number**: strips existing `1.`/`1)`/`-`/`*` prefixes, renumbers non-empty lines; blank lines preserved but not counted.
- **CSV export**: steps newlines collapsed to ` | `; UTF-8 BOM prepended for Excel compatibility. Export respects active filter. Attachments are not exported to CSV.
- **CSV import**: robust RFC 4180 parser; maps headers case-insensitively (strips punctuation). Missing ID → auto-generated. Existing ID → overwrite (upsert). Steps ` | ` → restored to newlines. Imported rows receive empty `attachments: []`.
- **Classifier**: scores title+steps text against two keyword lists; auto-score ≥ manual-score → "automated", else "manual", tie → "automated", zero matches → no suggestion.
- **Attachments**: stored as base64 data URLs inside the TC object in localStorage. A 2 MB per-file limit is enforced with a toast warning. Downloads are triggered via a synthetic `<a download>` click using event delegation on `tbody`.
- **Priority sort**: numeric (not lexicographic); null priorities sort last (sentinel `Infinity`).
- **Expected Result column**: truncated to 80 chars in the table; full text in the `title` attribute tooltip.
