<script>
  import { storage, displayName, splitFullName } from '$lib/storage.js';

  let { data } = $props();

  let athletes = $state(data.athletes);
  let firstInput = $state('');
  let lastInput = $state('');
  let toast = $state(null);
  let toastTimer = null;
  let menuOpenFor = $state(null);
  let editingId = $state(null);
  let editingFirst = $state('');
  let editingLast = $state('');
  let working = $state(false);

  // CSV upload state
  let fileInput;
  let csvPreview = $state(null); // { fresh: [{first_name, last_name}], duplicates: ["full name"] }

  function sortAthletes(list) {
    return [...list].sort((a, b) => {
      const af = (a.first_name || '').toLowerCase();
      const bf = (b.first_name || '').toLowerCase();
      return af.localeCompare(bf) || (a.last_name || '').localeCompare(b.last_name || '');
    });
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        parseCSVPreview(reader.result);
      } catch {
        alert('Could not read that file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function parseCSVPreview(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Determine if file is one column or two by inspecting the first non-header row.
    // Header detection: skip line 1 if it looks like "name", "first name", "last name", etc.
    let startIdx = 0;
    if (lines.length > 0) {
      const headerCandidate = lines[0].toLowerCase();
      if (/^(name|athlete|full ?name|first ?name|first ?name,\s*last ?name|first,\s*last)$/i.test(headerCandidate)) {
        startIdx = 1;
      }
    }

    const parsed = []; // [{first_name, last_name}]
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const cells = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length >= 2 && cells[0] && cells[1]) {
        // Two-column format
        parsed.push({ first_name: cells[0], last_name: cells[1] });
      } else if (cells.length >= 1 && cells[0]) {
        // One-column — split on last whitespace
        parsed.push(splitFullName(cells[0]));
      }
    }

    // De-duplicate within the file (case-insensitive full-name comparison)
    const seenInFile = new Set();
    const uniq = [];
    for (const p of parsed) {
      const key = `${p.first_name}|${p.last_name}`.toLowerCase();
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      uniq.push(p);
    }

    // Compare against existing athletes
    const existing = new Set(athletes.map(a => `${a.first_name}|${a.last_name}`.toLowerCase()));
    const fresh = [];
    const duplicates = [];
    for (const p of uniq) {
      const key = `${p.first_name}|${p.last_name}`.toLowerCase();
      if (existing.has(key)) {
        duplicates.push(displayName(p));
      } else {
        fresh.push(p);
      }
    }

    if (fresh.length === 0 && duplicates.length === 0) {
      alert('No athlete names found in that file.');
      return;
    }
    csvPreview = { fresh, duplicates };
  }

  async function commitCSVImport() {
    if (!csvPreview || working) return;
    working = true;
    try {
      const added = await storage.addAthletes(csvPreview.fresh);
      if (added.length === 0) {
        alert('Import failed — see browser console for details.');
        return;
      }
      athletes = sortAthletes([...athletes, ...added]);
      const count = added.length;
      csvPreview = null;
      showToast(`Imported ${count} athlete${count === 1 ? '' : 's'}`, async () => {
        for (const a of added) await storage.deleteAthlete(a.id);
        athletes = athletes.filter(x => !added.some(a => a.id === x.id));
      });
    } finally {
      working = false;
    }
  }

  function cancelCSVImport() { csvPreview = null; }

  async function addOne() {
    const first = firstInput.trim();
    const last = lastInput.trim();
    if (!first || working) return;
    working = true;
    try {
      const added = await storage.addAthlete(first, last);
      if (!added) {
        alert('Could not add athlete — see browser console for details.');
        return;
      }
      athletes = sortAthletes([...athletes, added]);
      firstInput = '';
      lastInput = '';
      showToast(`Added ${displayName(added)}`, async () => {
        await storage.deleteAthlete(added.id);
        athletes = athletes.filter(x => x.id !== added.id);
      });
    } finally {
      working = false;
    }
  }

  async function deleteAthlete(a) {
    menuOpenFor = null;
    if (working) return;
    working = true;
    try {
      const ok = await storage.deleteAthlete(a.id);
      if (!ok) {
        alert('Could not delete — see browser console for details.');
        return;
      }
      athletes = athletes.filter(x => x.id !== a.id);
      showToast(`Removed ${displayName(a)}`, async () => {
        const restored = await storage.addAthlete(a.first_name, a.last_name);
        if (restored) athletes = sortAthletes([...athletes, restored]);
      });
    } finally {
      working = false;
    }
  }

  function startEdit(a) {
    menuOpenFor = null;
    editingId = a.id;
    editingFirst = a.first_name || '';
    editingLast = a.last_name || '';
  }

  async function saveEdit() {
    const first = editingFirst.trim();
    const last = editingLast.trim();
    if (!first) { cancelEdit(); return; }
    if (working) return;
    working = true;
    try {
      const ok = await storage.updateAthlete(editingId, { first_name: first, last_name: last });
      if (!ok) {
        alert('Could not save — see browser console for details.');
        return;
      }
      athletes = sortAthletes(athletes.map(a =>
        a.id === editingId ? { ...a, first_name: first, last_name: last } : a
      ));
      editingId = null;
      editingFirst = '';
      editingLast = '';
    } finally {
      working = false;
    }
  }

  function cancelEdit() {
    editingId = null;
    editingFirst = '';
    editingLast = '';
  }

  function showToast(message, undoFn) {
    toast = { message, undoFn };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; }, 5000);
  }
  function handleUndo() {
    if (toast?.undoFn) toast.undoFn();
    toast = null;
    clearTimeout(toastTimer);
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addOne();
    }
  }
  function onEditKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }
  function closeMenuOnOutsideClick(e) {
    if (!e.target.closest('.menu-trigger') && !e.target.closest('.menu-pop')) {
      menuOpenFor = null;
    }
  }
</script>

<svelte:window onclick={closeMenuOnOutsideClick} />

<div class="add-row">
  <input
    type="text"
    placeholder="First name"
    bind:value={firstInput}
    onkeydown={onKey}
    autocomplete="off"
  />
  <input
    type="text"
    placeholder="Last name"
    bind:value={lastInput}
    onkeydown={onKey}
    autocomplete="off"
  />
  <button class="primary" onclick={addOne} disabled={working || !firstInput.trim()}>Add</button>
</div>
<div class="add-actions">
  <span class="dim small">For bulk imports, use the CSV upload — auto-detects one or two columns.</span>
  <input
    type="file"
    accept=".csv,text/csv,text/plain"
    style="display: none;"
    bind:this={fileInput}
    onchange={handleFileChosen}
  />
  <button class="csv-btn" onclick={() => fileInput?.click()}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
    Upload CSV
  </button>
</div>

<div class="list">
  {#if athletes.length === 0}
    <p class="muted">No athletes yet.</p>
  {:else}
    {#each athletes as a (a.id)}
      <div class="athlete-row">
        {#if editingId === a.id}
          <input class="edit-input" type="text" placeholder="First name" bind:value={editingFirst} onkeydown={onEditKey} autofocus />
          <input class="edit-input" type="text" placeholder="Last name" bind:value={editingLast} onkeydown={onEditKey} />
          <button class="primary" onclick={saveEdit}>Save</button>
        {:else}
          <a class="row-link" href={`/athletes/${a.id}`}>
            <div>{displayName(a)}</div>
            <div class="row-chev" aria-hidden="true">›</div>
          </a>
          <div class="menu-wrap">
            <button
              type="button"
              class="menu-trigger"
              aria-label="Open athlete menu"
              onclick={(e) => { e.stopPropagation(); menuOpenFor = menuOpenFor === a.id ? null : a.id; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            {#if menuOpenFor === a.id}
              <div class="menu-pop">
                <button type="button" onclick={() => startEdit(a)}>Edit name</button>
                <button type="button" class="danger" onclick={() => deleteAthlete(a)}>Delete</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

{#if csvPreview}
  <div class="picker-overlay" onclick={cancelCSVImport}>
    <div class="picker-card csv-card" onclick={(e) => e.stopPropagation()}>
      <h3 class="picker-title">Import preview</h3>
      <p class="muted small" style="margin: 0 0 12px;">
        {csvPreview.fresh.length} new · {csvPreview.duplicates.length} duplicate{csvPreview.duplicates.length === 1 ? '' : 's'} (will be skipped)
      </p>
      {#if csvPreview.fresh.length > 0}
        <div class="preview-section">
          <div class="preview-label">Will be added</div>
          <div class="preview-list">
            {#each csvPreview.fresh as p}
              <div class="preview-row">{displayName(p)}</div>
            {/each}
          </div>
        </div>
      {/if}
      {#if csvPreview.duplicates.length > 0}
        <div class="preview-section">
          <div class="preview-label">Already exist</div>
          <div class="preview-list dim">
            {#each csvPreview.duplicates as name}
              <div class="preview-row">{name}</div>
            {/each}
          </div>
        </div>
      {/if}
      <div class="row" style="margin-top: 16px; justify-content: flex-end;">
        <button onclick={cancelCSVImport}>Cancel</button>
        <button class="primary" onclick={commitCSVImport} disabled={csvPreview.fresh.length === 0 || working}>
          Import {csvPreview.fresh.length}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" role="status">
    <span>{toast.message}</span>
    {#if toast.undoFn}<button onclick={handleUndo}>Undo</button>{/if}
  </div>
{/if}

<style>
  .add-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    margin-bottom: 6px;
  }
  .add-row input { width: 100%; }
  .add-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }
  .add-actions .small { margin-bottom: 0; }
  .csv-btn {
    padding: 6px 12px;
    font-size: 13px;
    min-height: 36px;
  }
  .small { font-size: 12px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .athlete-row {
    display: flex;
    align-items: center;
    padding: 6px 6px 6px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-height: 56px;
    gap: 8px;
  }
  .row-link {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-decoration: none;
    color: var(--text);
    padding: 8px 0;
  }
  .row-chev { color: var(--text-3); font-size: 22px; line-height: 1; padding-right: 4px; }
  .edit-input {
    flex: 1;
    min-width: 0;
  }
  .menu-wrap { position: relative; }
  .menu-trigger {
    background: transparent;
    border: none;
    padding: 8px;
    color: var(--text-2);
    min-height: 40px;
  }
  .menu-trigger:hover { color: var(--text); background: var(--surface-2); }
  .menu-pop {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 4px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    z-index: 100;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    padding: 4px;
  }
  .menu-pop button {
    text-align: left;
    padding: 8px 12px;
    background: transparent;
    border: none;
    font-size: 14px;
    border-radius: 4px;
  }
  .menu-pop button:hover { background: var(--surface-2); }
  .menu-pop button.danger { color: var(--warning); }

  /* CSV preview overlay */
  .picker-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 16px;
  }
  .picker-card {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    overflow-y: auto;
  }
  .picker-title { font-weight: 600; margin: 0 0 4px; font-size: 16px; }
  .preview-section { margin-bottom: 14px; }
  .preview-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
    font-weight: 600;
    margin-bottom: 6px;
  }
  .preview-list {
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    max-height: 160px;
    overflow-y: auto;
    font-size: 13px;
  }
  .preview-row { padding: 3px 0; }
  .row {
    display: flex;
    gap: 8px;
  }

  /* Toast */
  .toast {
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    padding: 10px 14px;
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    z-index: 100;
  }

  @media (max-width: 480px) {
    .add-row { grid-template-columns: 1fr 1fr; }
    .add-row button { grid-column: span 2; }
  }
</style>
