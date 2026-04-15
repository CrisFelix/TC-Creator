/* ═══════════════════════════════════════════════════════════════
   TC Creator — app.js
   Modules: TCStore | Classifier | CSVExport | UI
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── TCStore ─────────────────────────────────────────────────── */
const TCStore = (() => {
  const KEY = 'tc_creator_v1';

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveAll(cases) {
    localStorage.setItem(KEY, JSON.stringify(cases));
  }

  function upsert(tc) {
    const cases = getAll();
    const idx = cases.findIndex(c => c.id === tc.id);
    if (idx >= 0) {
      cases[idx] = tc;
    } else {
      cases.push(tc);
    }
    saveAll(cases);
  }

  function remove(id) {
    saveAll(getAll().filter(c => c.id !== id));
  }

  function nextId() {
    const cases = getAll();
    if (!cases.length) return 'TC-001';
    const nums = cases
      .map(c => parseInt((c.id || '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `TC-${String(max + 1).padStart(3, '0')}`;
  }

  return { getAll, upsert, remove, nextId };
})();

/* ── Classifier ──────────────────────────────────────────────── */
const Classifier = (() => {
  /*
   * Classification rules
   * ─────────────────────────────────────────────────────────────
   * AUTOMATED if the test case:
   *   • runs repeatedly (regression, smoke, CI)
   *   • has deterministic, binary pass/fail criteria
   *   • tests an API endpoint, calculates a value, or validates a field
   *   • is data-driven or parameterised
   *
   * MANUAL if the test case:
   *   • requires human perception or judgement (visual, UX, feel)
   *   • is exploratory or ad-hoc
   *   • involves physical hardware or external devices
   *   • has a subjective or ambiguous outcome
   */
  const AUTO_KEYWORDS = [
    'regression', 'smoke', 'integration', 'unit', 'api', 'endpoint',
    'login', 'logout', 'validate', 'verify', 'calculate', 'submit',
    'crud', 'create', 'read', 'update', 'delete', 'status code',
    'response', 'json', 'xml', 'format', 'field', 'input', 'output',
    'data-driven', 'parameter', 'token', 'auth', 'sort', 'filter',
    'pagination', 'search', 'performance', 'load', 'stress', 'e2e',
  ];

  const MANUAL_KEYWORDS = [
    'usability', 'layout', 'visual', 'explore', 'feel', 'design',
    'intuitive', 'ad-hoc', 'one-time', 'hardware', 'print', 'device',
    'subjective', 'perception', 'accessibility', 'interview', 'survey',
    'user experience', 'ux', 'aesthetic', 'color', 'font', 'animation',
    'physical', 'observation',
  ];

  function suggest(title, steps) {
    const text = `${title} ${steps}`.toLowerCase();
    const autoScore  = AUTO_KEYWORDS.filter(k => text.includes(k)).length;
    const manualScore = MANUAL_KEYWORDS.filter(k => text.includes(k)).length;

    if (autoScore === 0 && manualScore === 0) return null;
    return autoScore >= manualScore ? 'automated' : 'manual';
  }

  return { suggest };
})();

/* ── CSVExport ───────────────────────────────────────────────── */
const CSVExport = (() => {
  const HEADERS = ['ID', 'Title', 'Steps', 'Expected Result', 'Type', 'Status'];

  function esc(val) {
    // RFC 4180: wrap in double-quotes, escape internal quotes by doubling
    return `"${String(val ?? '').replace(/"/g, '""')}"`;
  }

  function export_(cases) {
    if (!cases.length) {
      alert('No test cases to export.');
      return;
    }

    const rows = cases.map(tc => [
      tc.id,
      tc.title,
      (tc.steps || '').replace(/\n/g, ' | '),
      tc.expectedResult,
      tc.type,
      tc.status,
    ]);

    const csv = [HEADERS, ...rows]
      .map(row => row.map(esc).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `test_cases_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { export: export_ };
})();

/* ── CSVImport ───────────────────────────────────────────────── */
const CSVImport = (() => {

  /* RFC 4180 parser — handles quoted fields, embedded commas, doubled quotes */
  function parseCSV(raw) {
    const text = raw.replace(/^\uFEFF/, ''); // strip BOM
    const records = [];
    let i = 0;
    const n = text.length;

    while (i < n) {
      const record = [];

      while (i < n) {
        let field = '';

        if (text[i] === '"') {
          // quoted field
          i++;
          while (i < n) {
            if (text[i] === '"') {
              if (i + 1 < n && text[i + 1] === '"') {
                field += '"'; i += 2;           // escaped quote
              } else {
                i++; break;                     // closing quote
              }
            } else {
              field += text[i++];
            }
          }
        } else {
          // unquoted field — read until comma or line ending
          while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
            field += text[i++];
          }
          field = field.trim();
        }

        record.push(field);
        if (i < n && text[i] === ',') { i++; } // next field
        else { break; }                         // end of record
      }

      // consume line ending
      if (i < n && text[i] === '\r') i++;
      if (i < n && text[i] === '\n') i++;

      const meaningful = record.some(f => f !== '');
      if (meaningful) records.push(record);
    }

    return records;
  }

  /*
   * Map header names (case-insensitive, punctuation-stripped) to field keys.
   * Accepts both our own export format and common variations.
   */
  function mapHeaders(headers) {
    const map = {};
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    headers.forEach((h, i) => {
      switch (norm(h)) {
        case 'id':                                           map.id             = i; break;
        case 'title':
        case 'titledescription':
        case 'description':                                  map.title          = i; break;
        case 'steps':                                        map.steps          = i; break;
        case 'expectedresult':
        case 'expected':                                     map.expectedResult = i; break;
        case 'type':
        case 'automatedmanual':
        case 'automatedormanual':                            map.type           = i; break;
        case 'status':                                       map.status         = i; break;
      }
    });
    return map;
  }

  function normalizeType(val) {
    const v = (val || '').toLowerCase().trim();
    return v === 'automated' || v === 'auto' || v === 'automation' ? 'automated' : 'manual';
  }

  function normalizeStatus(val) {
    const VALID = ['Draft', 'Ready', 'Pass', 'Fail', 'Blocked'];
    const match = VALID.find(s => s.toLowerCase() === (val || '').trim().toLowerCase());
    return match || 'Draft';
  }

  /* Steps were exported with newlines collapsed to " | " — restore them */
  function normalizeSteps(val) {
    return (val || '').replace(/ \| /g, '\n');
  }

  function importFile(file, onDone) {
    const reader = new FileReader();

    reader.onerror = () => onDone({ error: 'Could not read file.' });

    reader.onload = e => {
      const records = parseCSV(e.target.result);

      if (records.length < 2) {
        onDone({ error: 'File is empty or has only a header row.' });
        return;
      }

      const colMap = mapHeaders(records[0]);

      if (colMap.title === undefined) {
        onDone({ error: 'Could not find a "Title" column. Check your CSV headers.' });
        return;
      }

      let imported = 0, overwritten = 0, skipped = 0;

      records.slice(1).forEach((row, rowIdx) => {
        const get = idx => (idx !== undefined ? (row[idx] || '').trim() : '');

        const title = get(colMap.title);
        if (!title) { skipped++; return; }  // title is the only hard requirement

        const existingIds = TCStore.getAll().map(c => c.id);
        let id = get(colMap.id);

        const isDuplicate = id && existingIds.includes(id);

        if (!id) {
          // no ID in CSV — auto-generate a fresh one
          id = TCStore.nextId();
        }

        const isNew = !existingIds.includes(id);

        TCStore.upsert({
          id,
          title,
          steps:          normalizeSteps(get(colMap.steps)),
          expectedResult: get(colMap.expectedResult),
          type:           normalizeType(get(colMap.type)),
          status:         normalizeStatus(get(colMap.status)),
          updatedAt:      new Date().toISOString(),
        });

        if (isDuplicate) { overwritten++; } else { imported++; }
      });

      onDone({ imported, overwritten, skipped });
    };

    reader.readAsText(file, 'utf-8');
  }

  return { importFile };
})();

/* ── UI ──────────────────────────────────────────────────────── */
const UI = (() => {
  /* DOM refs */
  const $ = id => document.getElementById(id);

  const overlay    = $('modal-overlay');
  const modalTitle = $('modal-title');
  const form       = $('tc-form');
  const editingId  = $('f-editing-id');
  const fId        = $('f-id');
  const fTitle     = $('f-title');
  const fSteps     = $('f-steps');
  const fExpected  = $('f-expected');
  const fStatus    = $('f-status');
  const suggestMsg = $('suggest-msg');
  const tbody      = $('tc-tbody');
  const emptyState = $('empty-state');
  const tcCount    = $('tc-count');
  const search     = $('search');
  const filterType = $('filter-type');
  const filterStatus = $('filter-status');

  let sortCol = 'id';
  let sortDir = 'asc';

  /* ── Helpers ─────────────────────────────────────────────── */
  function getTypeValue() {
    const checked = form.querySelector('input[name="f-type"]:checked');
    return checked ? checked.value : 'manual';
  }

  function setTypeValue(val) {
    const radio = form.querySelector(`input[name="f-type"][value="${val}"]`);
    if (radio) radio.checked = true;
  }

  function openModal(title) {
    modalTitle.textContent = title;
    overlay.classList.remove('hidden');
    fTitle.focus();
  }

  function closeModal() {
    overlay.classList.add('hidden');
    form.reset();
    editingId.value = '';
    suggestMsg.textContent = '';
    clearErrors();
  }

  function clearErrors() {
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  }

  function validateForm() {
    clearErrors();
    let ok = true;

    if (!fTitle.value.trim()) { fTitle.classList.add('error'); ok = false; }
    if (!fSteps.value.trim()) { fSteps.classList.add('error'); ok = false; }
    if (!fExpected.value.trim()) { fExpected.classList.add('error'); ok = false; }

    if (!ok) {
      const first = form.querySelector('.error');
      if (first) first.focus();
    }
    return ok;
  }

  /* ── Render ──────────────────────────────────────────────── */
  function getFilteredSorted() {
    let cases = TCStore.getAll();
    const q   = search.value.trim().toLowerCase();
    const ft  = filterType.value;
    const fs  = filterStatus.value;

    if (q)  cases = cases.filter(c =>
      c.id.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.steps || '').toLowerCase().includes(q)
    );
    if (ft) cases = cases.filter(c => c.type === ft);
    if (fs) cases = cases.filter(c => c.status === fs);

    cases.sort((a, b) => {
      const va = (a[sortCol] || '').toString().toLowerCase();
      const vb = (b[sortCol] || '').toString().toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return cases;
  }

  function stepsPreview(steps) {
    const first = (steps || '').split('\n')[0].trim();
    return first.length > 55 ? first.slice(0, 55) + '…' : first;
  }

  function render() {
    const cases = getFilteredSorted();
    const all   = TCStore.getAll();

    /* count badge always shows total */
    tcCount.textContent = `${all.length} case${all.length !== 1 ? 's' : ''}`;

    if (!cases.length) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    tbody.innerHTML = cases.map(tc => `
      <tr>
        <td><span class="tc-id">${esc(tc.id)}</span></td>
        <td><span class="tc-title">${esc(tc.title)}</span></td>
        <td><span class="tc-steps-preview" title="${attr(tc.steps)}">${esc(stepsPreview(tc.steps))}</span></td>
        <td><span class="badge ${esc(tc.type)}">${esc(tc.type)}</span></td>
        <td><span class="badge status-${esc(tc.status)}">${esc(tc.status)}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-steps"  data-id="${attr(tc.id)}">Steps</button>
            <button class="btn-edit"   data-id="${attr(tc.id)}">Edit</button>
            <button class="btn-delete" data-id="${attr(tc.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  /* Safe HTML escaping */
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function attr(s) { return esc(s); }

  /* ── Events ──────────────────────────────────────────────── */
  $('btn-new').addEventListener('click', () => {
    editingId.value = '';
    fId.value = TCStore.nextId();
    setTypeValue('manual');
    openModal('New Test Case');
  });

  $('btn-modal-close').addEventListener('click', closeModal);
  $('btn-cancel').addEventListener('click', closeModal);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!overlay.classList.contains('hidden'))       closeModal();
      if (!stepsOverlay.classList.contains('hidden'))  closeStepsViewer();
    }
  });

  /* ── Auto-number steps ───────────────────────────────────── */
  $('btn-autonumber').addEventListener('click', () => {
    const lines = fSteps.value.split('\n');
    let counter = 1;
    const result = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';                              // blank line — preserve, skip numbering
      const stripped = trimmed
        .replace(/^\d+[\.\)]\s*/, '')                      // strip existing "1. " or "1) "
        .replace(/^[-*•]\s*/, '');                         // strip "- " or "* " bullets
      return `${counter++}. ${stripped}`;
    });
    fSteps.value = result.join('\n').trim();
    fSteps.focus();
  });

  /* ── Steps viewer ────────────────────────────────────────── */
  const stepsOverlay = $('steps-overlay');

  function openStepsViewer(id) {
    const tc = TCStore.getAll().find(c => c.id === id);
    if (!tc) return;

    $('steps-viewer-title').textContent    = tc.id;
    $('steps-viewer-subtitle').textContent = tc.title;

    /* Normalize lines: strip any leading numbering/bullets, then re-render as <ol> */
    const lines = (tc.steps || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*•]\s*/, '').trim())
      .filter(l => l);

    const listHtml = lines.length
      ? lines.map(l => `<li>${esc(l)}</li>`).join('')
      : '<li class="empty-step">No steps recorded.</li>';

    let html = `<ol class="steps-list">${listHtml}</ol>`;

    if (tc.expectedResult) {
      html += `
        <div class="steps-expected">
          <div class="steps-expected-label">Expected Result</div>
          <p>${esc(tc.expectedResult)}</p>
        </div>`;
    }

    $('steps-viewer-body').innerHTML = html;
    stepsOverlay.classList.remove('hidden');
    $('btn-steps-close').focus();
  }

  function closeStepsViewer() {
    stepsOverlay.classList.add('hidden');
  }

  $('btn-steps-close').addEventListener('click', closeStepsViewer);
  stepsOverlay.addEventListener('click', e => {
    if (e.target === stepsOverlay) closeStepsViewer();
  });

  $('btn-suggest').addEventListener('click', () => {
    const suggestion = Classifier.suggest(fTitle.value, fSteps.value);
    if (!suggestion) {
      suggestMsg.textContent = 'No clear signal — please select manually.';
      return;
    }
    setTypeValue(suggestion);
    suggestMsg.textContent = `Suggested: ${suggestion}`;
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm()) return;

    const isEdit   = !!editingId.value;
    const recordId = isEdit ? editingId.value : fId.value.trim() || TCStore.nextId();

    /* Prevent duplicate IDs when creating a new TC */
    if (!isEdit) {
      const existing = TCStore.getAll().find(c => c.id === recordId);
      if (existing) {
        fId.classList.add('error');
        fId.focus();
        alert(`ID "${recordId}" already exists. Please choose a different ID.`);
        return;
      }
    }

    TCStore.upsert({
      id:             recordId,
      title:          fTitle.value.trim(),
      steps:          fSteps.value.trim(),
      expectedResult: fExpected.value.trim(),
      type:           getTypeValue(),
      status:         fStatus.value,
      updatedAt:      new Date().toISOString(),
    });

    closeModal();
    render();
  });

  /* Table delegation — Steps / Edit / Delete */
  tbody.addEventListener('click', e => {
    const stepsBtn  = e.target.closest('.btn-steps');
    const editBtn   = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');

    if (stepsBtn) {
      openStepsViewer(stepsBtn.dataset.id);
    }

    if (editBtn) {
      const id = editBtn.dataset.id;
      const tc = TCStore.getAll().find(c => c.id === id);
      if (!tc) return;

      editingId.value  = tc.id;
      fId.value        = tc.id;
      fTitle.value     = tc.title;
      fSteps.value     = tc.steps;
      fExpected.value  = tc.expectedResult;
      fStatus.value    = tc.status;
      setTypeValue(tc.type);
      suggestMsg.textContent = '';

      openModal(`Edit — ${tc.id}`);
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (confirm(`Delete test case "${id}"? This cannot be undone.`)) {
        TCStore.remove(id);
        render();
      }
    }
  });

  /* Sorting */
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      document.querySelectorAll('th.sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      render();
    });
  });

  /* Search & filter */
  search.addEventListener('input', render);
  filterType.addEventListener('change', render);
  filterStatus.addEventListener('change', render);

  /* CSV export */
  $('btn-export').addEventListener('click', () => {
    CSVExport.export(getFilteredSorted());
  });

  /* ── Toast ───────────────────────────────────────────────── */
  const toast = $('toast');
  let toastTimer;

  function showToast(msg, type /* 'success' | 'warning' | 'error' */) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className   = `toast-${type}`;   // replaces 'hidden' too
    toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 5000);
  }

  /* ── CSV import ──────────────────────────────────────────── */
  const csvFileInput = $('csv-file-input');

  /* clicking the label opens the file picker; reset value so the same
     file can be re-imported if needed */
  csvFileInput.addEventListener('click', () => { csvFileInput.value = ''; });

  csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (!file) return;

    CSVImport.importFile(file, result => {
      if (result.error) {
        showToast(`Import failed: ${result.error}`, 'error');
        return;
      }

      render();

      const { imported, overwritten, skipped } = result;
      const parts = [];
      if (imported)    parts.push(`${imported} added`);
      if (overwritten) parts.push(`${overwritten} overwritten`);
      if (skipped)     parts.push(`${skipped} skipped (no title)`);

      const type = imported || overwritten ? 'success' : 'warning';
      showToast(`Import complete — ${parts.join(', ')}.`, type);
    });
  });

  /* Initial render */
  render();
})();
