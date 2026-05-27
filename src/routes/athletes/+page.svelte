<script>
  import { storage } from '$lib/storage.js';
  import { uid } from '$lib/events.js';

  let { data } = $props();

  let athletes = $state(data.athletes);
  let inputValue = $state('');
  let toast = $state(null);
  let toastTimer = null;
  let menuOpenFor = $state(null);
  let editingId = $state(null);
  let editingName = $state('');

  // CSV upload state
  let fileInput;
  let csvPreview = $state(null); // { fresh: [], duplicates: [] }

  function persist() { storage.setAthletes(athletes); }

  function handleFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        parseCSVPreview(text);
      } catch (err) {
        alert('Could not read that file.');
      }
    };
    reader.readAsText(file);
    // Reset the input so picking the same file again triggers onchange
    e.target.value = '';
  }

  function parseCSVPreview(text) {
    // Lenient parser: split on newlines, then on first comma per line.
    // Take the first column as the name. Strip surrounding quotes/whitespace.
    // Skip blank rows. Detect and skip a header row ("name", "athlete name", etc.).
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const names = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const firstField = line.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (!firstField) continue;
      // Skip a likely header on the first line
      if (i === 0 && /^(name|athlete|first ?name|full ?name)$/i.test(firstField)) continue;
      names.push(firstField);
    }
    // De-duplicate within the file itself
    const seenInFile = new Set();
    const uniq = [];
    for (const n of names) {
      const key = n.toLowerCase();
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      uniq.push(n);
    }
    // Split into fresh vs duplicates of existing athletes
    const existingNames = new Set(athletes.map(a => a.name.toLowerCase()));
    const fresh = [];
    const duplicates = [];
    for (const n of uniq) {
      if (existingNames.has(n.toLowerCase())) duplicates.push(n);
      else fresh.push(n);
    }
    if (fresh.length === 0 && duplicates.length === 0) {
      alert('No athlete names found in that file.');
      return;
    }
    csvPreview = { fresh, duplicates };
  }

  function commitCSVImport() {
    if (!csvPreview) return;
    const added = csvPreview.fresh.map(name => ({ id: uid('a'), name }));
    athletes = [...athletes, ...added];
    persist();
    const count = added.length;
    csvPreview = null;
    showToast(`Imported ${count} athlete${count === 1 ? '' : 's'}`, () => {
      const ids = new Set(added.map(a => a.id));
      athletes = athletes.filter(a => !ids.has(a.id));
      persist();
    });
  }

  function cancelCSVImport() { csvPreview = null; }

  function addAthletes() {
    const names = inputValue.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const added = names.map(name => ({ id: uid('a'), name }));
    athletes = [...athletes, ...added];
    persist();
    inputValue = '';
    showToast(
      added.length === 1 ? `Added ${added[0].name}` : `Added ${added.length} athletes`,
      () => {
        const ids = new Set(added.map(a => a.id));
        athletes = athletes.filter(a => !ids.has(a.id));
        persist();
      }
    );
  }

  function deleteAthlete(a) {
    menuOpenFor = null;
    const idx = athletes.indexOf(a);
    athletes = athletes.filter(x => x.id !== a.id);
    persist();
    showToast(`Removed ${a.name}`, () => {
      athletes.splice(idx, 0, a);
      athletes = [...athletes];
      persist();
    });
  }

  function startEdit(a) {
    menuOpenFor = null;
    editingId = a.id;
    editingName = a.name;
  }

  function saveEdit() {
    const trimmed = editingName.trim();
    if (!trimmed) { cancelEdit(); return; }
    athletes = athletes.map(a => a.id === editingId ? { ...a, name: trimmed } : a);
    persist();
    editingId = null;
    editingName = '';
  }

  function cancelEdit() {
    editingId = null;
    editingName = '';
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
      addAthletes();
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
    placeholder="Name, or comma-separated for multiple"
    bind:value={inputValue}
    onkeydown={onKey}
  />
  <button class="primary" onclick={addAthletes}>Add</button>
</div>
<div class="add-actions">
  <span class="dim small">Separate multiple names with commas or new lines.</span>
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
          <input
            class="edit-input"
            type="text"
            bind:value={editingName}
            onkeydown={onEditKey}
            onblur={saveEdit}
            autofocus
          />
          <button class="primary" onclick={saveEdit}>Save</button>
        {:else}
          <a class="row-link" href={`/athletes/${a.id}`}>
            <div>{a.name}</div>
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
                <button type="button" class="menu-danger" onclick={() => deleteAthlete(a)}>Delete</button>
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
            {#each csvPreview.fresh as name}
              <div class="preview-row">{name}</div>
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
        <button class="primary" onclick={commitCSVImport} disabled={csvPreview.fresh.length === 0}>
          Import {csvPreview.fresh.length}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast" role="status">
    <span>{toast.message}</span>
    {#if toast.undoFn}
      <button onclick={handleUndo}>Undo</button>
    {/if}
  </div>
{/if}

<style>
  .add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  .add-row input { flex: 1; }
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

  /* CSV preview overlay (shares pattern with team picker on bleep page) */
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
  .athlete-row {
    display: flex;
    align-items: center;
    padding: 6px 6px 6px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    gap: 8px;
    min-height: 56px;
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
  .row-chev { color: var(--text-3); font-size: 20px; line-height: 1; padding-right: 4px; }
  .menu-wrap { position: relative; }
  .menu-trigger {
    background: transparent;
    border: 1px solid transparent;
    padding: 8px;
    min-height: 40px;
    width: 40px;
    color: var(--text-2);
  }
  .menu-trigger:hover { background: var(--surface-2); }
  .menu-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    min-width: 140px;
    padding: 4px;
    z-index: 10;
    display: flex;
    flex-direction: column;
  }
  .menu-pop button {
    background: transparent;
    border: none;
    text-align: left;
    padding: 8px 12px;
    border-radius: 4px;
    min-height: 36px;
    font-size: 14px;
  }
  .menu-pop button:hover { background: var(--surface-2); }
  .menu-pop .menu-danger { color: var(--danger); }
  .menu-pop .menu-danger:hover { background: var(--danger-soft); }
  .edit-input { flex: 1; }
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
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
</style>
