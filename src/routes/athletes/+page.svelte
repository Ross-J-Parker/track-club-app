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

  function persist() { storage.setAthletes(athletes); }

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
<div class="dim small">Separate multiple names with commas or new lines.</div>

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
  .small { font-size: 12px; margin-bottom: 18px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
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
