<script>
  /**
   * Props:
   *   athletes  — array of { id, first_name, last_name }
   *   selected  — Set<string> of selected athlete IDs (two-way bound via $bindable)
   */
  import { displayName, sortName } from '$lib/storage.js';

  let { athletes, selected = $bindable() } = $props();

  let search = $state('');
  let sortBy = $state('first'); // 'first' | 'last'

  function matches(a, term) {
    if (!term) return true;
    return displayName(a).toLowerCase().includes(term);
  }

  const filtered = $derived.by(() => {
    const term = search.trim().toLowerCase();
    let list = athletes.filter(a => matches(a, term));
    if (sortBy === 'first') {
      list = [...list].sort((a, b) => {
        const af = (a.first_name || '').toLowerCase();
        const bf = (b.first_name || '').toLowerCase();
        return af.localeCompare(bf) || (a.last_name || '').localeCompare(b.last_name || '');
      });
    } else {
      list = [...list].sort((a, b) => {
        const al = (a.last_name || '').toLowerCase();
        const bl = (b.last_name || '').toLowerCase();
        return al.localeCompare(bl) || (a.first_name || '').localeCompare(b.first_name || '');
      });
    }
    return list;
  });

  // When sorting by last name, render "Chen, Amelia" so the visual matches the sort.
  function renderName(a) {
    return sortBy === 'last' ? sortName(a) : displayName(a);
  }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = new Set(selected);
  }

  function selectAllVisible() {
    for (const a of filtered) selected.add(a.id);
    selected = new Set(selected);
  }
  function clearVisible() {
    for (const a of filtered) selected.delete(a.id);
    selected = new Set(selected);
  }
  function clearAll() {
    selected = new Set();
  }

  const visibleSelectedCount = $derived(filtered.filter(a => selected.has(a.id)).length);
  const allVisibleSelected = $derived(filtered.length > 0 && visibleSelectedCount === filtered.length);
</script>

<div class="picker">
  <div class="toolbar">
    <input type="search" placeholder="Search athletes…" bind:value={search} />
    <select bind:value={sortBy} aria-label="Sort by">
      <option value="first">First name</option>
      <option value="last">Last name</option>
    </select>
  </div>

  <div class="selection-bar">
    <div class="count">
      <strong>{selected.size}</strong> selected
      {#if search}<span class="muted small">· {filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>{/if}
    </div>
    <div class="bulk-actions">
      {#if allVisibleSelected && filtered.length > 0}
        <button type="button" onclick={clearVisible}>Deselect all{search ? ' visible' : ''}</button>
      {:else}
        <button type="button" onclick={selectAllVisible} disabled={filtered.length === 0}>
          Select all{search ? ' visible' : ''}
        </button>
      {/if}
      {#if selected.size > 0 && !search}
        <button type="button" onclick={clearAll}>Clear</button>
      {/if}
    </div>
  </div>

  {#if filtered.length === 0}
    <p class="muted small" style="padding: 12px 0; text-align: center;">
      {athletes.length === 0 ? 'No athletes yet — add some in the Athletes tab.' : 'No matches.'}
    </p>
  {:else}
    <div class="list" role="listbox" aria-multiselectable="true">
      {#each filtered as a (a.id)}
        {@const isSel = selected.has(a.id)}
        <button type="button" class="athlete-row" class:selected={isSel} role="option" aria-selected={isSel} onclick={() => toggle(a.id)}>
          <span class="checkbox" aria-hidden="true">
            {#if isSel}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {/if}
          </span>
          <span class="name">{renderName(a)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 10px; }
  .toolbar {
    display: grid;
    grid-template-columns: 1fr 140px;
    gap: 8px;
  }
  .toolbar input { width: 100%; }
  .selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 2px;
    flex-wrap: wrap;
  }
  .count { font-size: 13px; color: var(--text-2); }
  .count strong { color: var(--text); }
  .bulk-actions { display: flex; gap: 6px; }
  .bulk-actions button { padding: 6px 10px; min-height: 36px; font-size: 12px; }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    max-height: 50vh;
    overflow-y: auto;
  }
  .athlete-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--surface);
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    text-align: left;
    min-height: 52px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .athlete-row:last-child { border-bottom: none; }
  .athlete-row:hover { background: var(--surface-2); }
  .athlete-row.selected { background: var(--accent-soft); }
  .athlete-row.selected:hover { background: var(--accent-soft); }
  .checkbox {
    width: 22px;
    height: 22px;
    border: 1.5px solid var(--border-strong);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--surface);
  }
  .athlete-row.selected .checkbox {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .name { font-size: 15px; }
  .small { font-size: 12px; }
  @media (max-width: 480px) {
    .toolbar { grid-template-columns: 1fr 110px; }
  }
</style>
