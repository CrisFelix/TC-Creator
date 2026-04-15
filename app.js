/* ═══════════════════════════════════════════════════════════════
   TC Creator — app.js
   Modules: TCStore | Classifier | CSVExport | CSVImport | UI
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

  function clearAll() {
    saveAll([]);
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

  return { getAll, upsert, remove, clearAll, nextId };
})();

/* ── Classifier ──────────────────────────────────────────────── */
const Classifier = (() => {
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
    const autoScore   = AUTO_KEYWORDS.filter(k => text.includes(k)).length;
    const manualScore = MANUAL_KEYWORDS.filter(k => text.includes(k)).length;

    if (autoScore === 0 && manualScore === 0) return null;
    return autoScore >= manualScore ? 'automated' : 'manual';
  }

  return { suggest };
})();

/* ── CSVExport ───────────────────────────────────────────────── */
const CSVExport = (() => {
  const HEADERS = ['ID', 'Title', 'Steps', 'Expected Result', 'Priority', 'Type', 'Status', 'Technology'];

  function esc(val) {
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
      tc.priority ?? '',
      tc.type,
      tc.status,
      tc.technology ?? '',
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
    const text = raw.replace(/^\uFEFF/, '');
    const records = [];
    let i = 0;
    const n = text.length;

    while (i < n) {
      const record = [];

      while (i < n) {
        let field = '';

        if (text[i] === '"') {
          i++;
          while (i < n) {
            if (text[i] === '"') {
              if (i + 1 < n && text[i + 1] === '"') {
                field += '"'; i += 2;
              } else {
                i++; break;
              }
            } else {
              field += text[i++];
            }
          }
        } else {
          while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
            field += text[i++];
          }
          field = field.trim();
        }

        record.push(field);
        if (i < n && text[i] === ',') { i++; }
        else { break; }
      }

      if (i < n && text[i] === '\r') i++;
      if (i < n && text[i] === '\n') i++;

      const meaningful = record.some(f => f !== '');
      if (meaningful) records.push(record);
    }

    return records;
  }

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
        case 'priority':                                     map.priority       = i; break;
        case 'type':
        case 'automatedmanual':
        case 'automatedormanual':                            map.type           = i; break;
        case 'status':                                       map.status         = i; break;
        case 'technology':
        case 'tech':                                         map.technology     = i; break;
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

  function normalizeSteps(val) {
    return (val || '').replace(/ \| /g, '\n');
  }

  function normalizePriority(val) {
    const n = parseInt(val, 10);
    return isNaN(n) || n < 1 ? null : n;
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

      records.slice(1).forEach(row => {
        const get = idx => (idx !== undefined ? (row[idx] || '').trim() : '');

        const title = get(colMap.title);
        if (!title) { skipped++; return; }

        const existingIds = TCStore.getAll().map(c => c.id);
        let id = get(colMap.id);

        const isDuplicate = id && existingIds.includes(id);

        if (!id) {
          id = TCStore.nextId();
        }

        TCStore.upsert({
          id,
          title,
          steps:          normalizeSteps(get(colMap.steps)),
          expectedResult: get(colMap.expectedResult),
          priority:       normalizePriority(get(colMap.priority)),
          type:           normalizeType(get(colMap.type)),
          status:         normalizeStatus(get(colMap.status)),
          technology:     get(colMap.technology),
          attachments:    [],
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
  const $ = id => document.getElementById(id);

  const overlay      = $('modal-overlay');
  const modalTitle   = $('modal-title');
  const form         = $('tc-form');
  const editingId    = $('f-editing-id');
  const fId          = $('f-id');
  const fTitle       = $('f-title');
  const fSteps       = $('f-steps');
  const fExpected    = $('f-expected');
  const fStatus      = $('f-status');
  const fPriority    = $('f-priority');
  const fTechnology  = $('f-technology');
  const suggestMsg   = $('suggest-msg');
  const tbody        = $('tc-tbody');
  const emptyState   = $('empty-state');
  const tcCount      = $('tc-count');
  const search       = $('search');
  const filterType   = $('filter-type');
  const filterStatus     = $('filter-status');
  const filterTechnology = $('filter-technology');

  let sortCol = 'id';
  let sortDir = 'asc';
  let groupByTech = false;
  let currentAttachments = [];  // { name, type, size, data } objects for the open form

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
    currentAttachments = [];
    renderAttachmentsList();
    clearErrors();
  }

  function clearErrors() {
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  }

  function validateForm() {
    clearErrors();
    let ok = true;

    if (!fTitle.value.trim())    { fTitle.classList.add('error');    ok = false; }
    if (!fSteps.value.trim())    { fSteps.classList.add('error');    ok = false; }
    if (!fExpected.value.trim()) { fExpected.classList.add('error'); ok = false; }

    if (!ok) {
      const first = form.querySelector('.error');
      if (first) first.focus();
    }
    return ok;
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderAttachmentsList() {
    const list = $('f-attachments-list');
    if (!list) return;
    if (!currentAttachments.length) {
      list.innerHTML = '<span class="no-attachments">No attachments added.</span>';
      return;
    }
    list.innerHTML = currentAttachments.map((att, i) => `
      <div class="attachment-item">
        <span class="attachment-name" title="${esc(att.name)}">${esc(att.name)}</span>
        <span class="attachment-size">${formatSize(att.size)}</span>
        <button type="button" class="btn-remove-attachment" data-idx="${i}" title="Remove">&times;</button>
      </div>
    `).join('');
  }

  function expectedPreview(text) {
    const t = (text || '').trim().replace(/\n/g, ' ');
    return t.length > 80 ? t.slice(0, 80) + '…' : t;
  }

  /* ── Safe HTML escaping ──────────────────────────────────── */
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function attr(s) { return esc(s); }

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
    const filterTech = filterTechnology.value;
    if (ft) cases = cases.filter(c => c.type === ft);
    if (fs) cases = cases.filter(c => c.status === fs);
    if (filterTech) cases = cases.filter(c => (c.technology || '').trim() === filterTech);

    cases.sort((a, b) => {
      if (sortCol === 'priority') {
        const va = (a.priority == null) ? Infinity : Number(a.priority);
        const vb = (b.priority == null) ? Infinity : Number(b.priority);
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
      }
      const va = (a[sortCol] || '').toString().toLowerCase();
      const vb = (b[sortCol] || '').toString().toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return cases;
  }

  function populateTechFilter() {
    const techs = [...new Set(
      TCStore.getAll().map(tc => (tc.technology || '').trim()).filter(Boolean)
    )].sort();
    const current = filterTechnology.value;
    filterTechnology.innerHTML = '<option value="">All Technologies</option>' +
      techs.map(t => `<option value="${attr(t)}"${t === current ? ' selected' : ''}>${esc(t)}</option>`).join('');
  }

  function renderRow(tc) {
    const priorityHtml = (tc.priority != null)
      ? `<span class="priority-badge">${esc(String(tc.priority))}</span>`
      : '<span class="cell-muted">—</span>';

    const techHtml = (tc.technology && tc.technology.trim())
      ? `<span class="tech-badge">${esc(tc.technology.trim())}</span>`
      : '<span class="cell-muted">—</span>';

    const attHtml = (tc.attachments && tc.attachments.length)
      ? tc.attachments.map((att, i) =>
          `<a class="attachment-link" data-id="${attr(tc.id)}" data-idx="${i}" href="#">${esc(att.name)}</a>`
        ).join('')
      : '<span class="cell-muted">—</span>';

    return `
      <tr>
        <td><span class="tc-id">${esc(tc.id)}</span></td>
        <td><span class="tc-title">${esc(tc.title)}</span></td>
        <td><span class="tc-expected" title="${attr(tc.expectedResult)}">${esc(expectedPreview(tc.expectedResult))}</span></td>
        <td>${priorityHtml}</td>
        <td><span class="badge ${esc(tc.type)}">${esc(tc.type)}</span></td>
        <td><span class="badge status-${esc(tc.status)}">${esc(tc.status)}</span></td>
        <td>${techHtml}</td>
        <td class="attachment-cell">${attHtml}</td>
        <td>
          <div class="row-actions">
            <button class="btn-edit"   data-id="${attr(tc.id)}">Edit</button>
            <button class="btn-delete" data-id="${attr(tc.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function render() {
    const cases = getFilteredSorted();
    const all   = TCStore.getAll();

    tcCount.textContent = `${all.length} case${all.length !== 1 ? 's' : ''}`;
    populateTechFilter();

    if (!cases.length) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    if (groupByTech) {
      const groups = new Map();
      cases.forEach(tc => {
        const key = (tc.technology || '').trim() || '(No Technology)';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tc);
      });

      const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === '(No Technology)') return 1;
        if (b === '(No Technology)') return -1;
        return a.localeCompare(b);
      });

      tbody.innerHTML = sortedKeys.map(key => {
        const rows = groups.get(key).map(tc => renderRow(tc)).join('');
        return `<tr class="group-header"><td colspan="9"><span class="group-label">${esc(key)}</span></td></tr>${rows}`;
      }).join('');
    } else {
      tbody.innerHTML = cases.map(tc => renderRow(tc)).join('');
    }
  }

  /* ── Events ──────────────────────────────────────────────── */
  $('btn-new').addEventListener('click', () => {
    editingId.value = '';
    fId.value = TCStore.nextId();
    setTypeValue('manual');
    currentAttachments = [];
    renderAttachmentsList();
    openModal('New Test Case');
  });

  $('btn-modal-close').addEventListener('click', closeModal);
  $('btn-cancel').addEventListener('click', closeModal);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
  });

  /* ── Auto-number steps ───────────────────────────────────── */
  $('btn-autonumber').addEventListener('click', () => {
    const lines = fSteps.value.split('\n');
    let counter = 1;
    const result = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const stripped = trimmed
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^[-*•]\s*/, '');
      return `${counter++}. ${stripped}`;
    });
    fSteps.value = result.join('\n').trim();
    fSteps.focus();
  });

  /* ── Attachments (form) ──────────────────────────────────── */
  const attachmentsInput = $('f-attachments-input');

  $('btn-add-attachments').addEventListener('click', () => {
    attachmentsInput.click();
  });

  attachmentsInput.addEventListener('change', () => {
    const files = Array.from(attachmentsInput.files);
    let pending = files.length;
    if (!pending) return;

    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) {
        showToast(`"${file.name}" exceeds 2 MB limit and was skipped.`, 'warning');
        pending--;
        if (!pending) renderAttachmentsList();
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        currentAttachments.push({ name: file.name, type: file.type, size: file.size, data: ev.target.result });
        pending--;
        if (!pending) renderAttachmentsList();
      };
      reader.readAsDataURL(file);
    });

    attachmentsInput.value = '';
  });

  $('f-attachments-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove-attachment');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    currentAttachments.splice(idx, 1);
    renderAttachmentsList();
  });

  /* ── Suggest ─────────────────────────────────────────────── */
  $('btn-suggest').addEventListener('click', () => {
    const suggestion = Classifier.suggest(fTitle.value, fSteps.value);
    if (!suggestion) {
      suggestMsg.textContent = 'No clear signal — please select manually.';
      return;
    }
    setTypeValue(suggestion);
    suggestMsg.textContent = `Suggested: ${suggestion}`;
  });

  /* ── Form submit ─────────────────────────────────────────── */
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm()) return;

    const isEdit   = !!editingId.value;
    const recordId = isEdit ? editingId.value : fId.value.trim() || TCStore.nextId();

    if (!isEdit) {
      const existing = TCStore.getAll().find(c => c.id === recordId);
      if (existing) {
        fId.classList.add('error');
        fId.focus();
        alert(`ID "${recordId}" already exists. Please choose a different ID.`);
        return;
      }
    }

    const priorityVal = parseInt(fPriority.value, 10);

    TCStore.upsert({
      id:             recordId,
      title:          fTitle.value.trim(),
      steps:          fSteps.value.trim(),
      expectedResult: fExpected.value.trim(),
      priority:       isNaN(priorityVal) || priorityVal < 1 ? null : priorityVal,
      type:           getTypeValue(),
      status:         fStatus.value,
      technology:     fTechnology.value.trim(),
      attachments:    currentAttachments,
      updatedAt:      new Date().toISOString(),
    });

    closeModal();
    render();
  });

  /* ── Table delegation — Edit / Delete / Attachment download ── */
  tbody.addEventListener('click', e => {
    const editBtn    = e.target.closest('.btn-edit');
    const deleteBtn  = e.target.closest('.btn-delete');
    const attachLink = e.target.closest('.attachment-link');

    if (attachLink) {
      e.preventDefault();
      const id  = attachLink.dataset.id;
      const idx = parseInt(attachLink.dataset.idx, 10);
      const tc  = TCStore.getAll().find(c => c.id === id);
      if (!tc || !tc.attachments || !tc.attachments[idx]) return;
      const att = tc.attachments[idx];
      const a   = document.createElement('a');
      a.href    = att.data;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
      fPriority.value   = tc.priority != null ? tc.priority : '';
      fTechnology.value = tc.technology || '';
      setTypeValue(tc.type);
      suggestMsg.textContent = '';
      currentAttachments = (tc.attachments || []).slice();
      renderAttachmentsList();

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

  /* ── Sorting ─────────────────────────────────────────────── */
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

  /* ── Search & filter ─────────────────────────────────────── */
  search.addEventListener('input', render);
  filterType.addEventListener('change', render);
  filterStatus.addEventListener('change', render);

  /* ── Clear all ───────────────────────────────────────────── */
  $('btn-clear-all').addEventListener('click', () => {
    const count = TCStore.getAll().length;
    if (!count) { showToast('There are no test cases to remove.', 'warning'); return; }
    if (!confirm(`Delete all ${count} test case${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    TCStore.clearAll();
    render();
    showToast(`All ${count} test case${count !== 1 ? 's' : ''} deleted.`, 'success');
  });

  /* ── CSV export ──────────────────────────────────────────── */
  $('btn-export').addEventListener('click', () => {
    CSVExport.export(getFilteredSorted());
  });

  /* ── Toast ───────────────────────────────────────────────── */
  const toast = $('toast');
  let toastTimer;

  function showToast(msg, type /* 'success' | 'warning' | 'error' */) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className   = `toast-${type}`;
    toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 5000);
  }

  /* ── CSV import ──────────────────────────────────────────── */
  const csvFileInput = $('csv-file-input');

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

  /* ── Technology filter & group toggle ───────────────────────── */
  filterTechnology.addEventListener('change', render);

  $('btn-group-tech').addEventListener('click', () => {
    groupByTech = !groupByTech;
    $('btn-group-tech').classList.toggle('active', groupByTech);
    render();
  });

  /* ── Initial render ──────────────────────────────────────── */
  renderAttachmentsList();
  render();
})();
