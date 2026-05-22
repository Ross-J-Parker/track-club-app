<script>
  import { storage } from '$lib/storage.js';
  import { uid } from '$lib/events.js';

  let { data } = $props();

  let athletes = $state(data.athletes);
  let inputValue = $state('');
  let toast = $state(null);
  let toastTimer = null;

  function persist() {
    storage.setAthletes(athletes);
  }

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
    const idx = athletes.indexOf(a);
    athletes = athletes.filter(x => x.id !== a.id);
    persist();
    showToast(`Removed ${a.name}`, () => {
      athletes.splice(idx, 0, a);
      athletes = [...athletes];
      persist();
    });
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
</script>

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
        <div>{a.name}</div>
        <button class="danger" onclick={() => deleteAthlete(a)}>Delete</button>
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
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
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
