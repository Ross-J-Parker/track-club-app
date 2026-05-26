<script>
  import { fmtValue } from '$lib/events.js';

  let { data } = $props();

  let athletes = $derived(data.athletes);
  let results = $derived(data.results);

  let athleteId = $state('');
  let eventName = $state('');

  // If an athlete is picked, show only their events. Otherwise show all events anyone has done.
  const availableEvents = $derived.by(() => {
    const subset = athleteId
      ? results.filter(r => r.athleteId === athleteId && !r.dnf)
      : results.filter(r => !r.dnf);
    return [...new Set(subset.map(r => r.event))];
  });

  // Reset event filter if it's no longer valid (e.g. you switched athlete)
  $effect(() => {
    if (eventName && !availableEvents.includes(eventName)) {
      eventName = '';
    }
  });

  const filtered = $derived.by(() => {
    let rows = [...results].sort((a, b) => b.date.localeCompare(a.date));
    if (athleteId) rows = rows.filter(r => r.athleteId === athleteId);
    if (eventName) rows = rows.filter(r => r.event === eventName);
    return rows;
  });
</script>

<div class="filters">
  <select bind:value={athleteId}>
    <option value="">All athletes</option>
    {#each athletes as a}<option value={a.id}>{a.name}</option>{/each}
  </select>
  <select bind:value={eventName}>
    <option value="">All events</option>
    {#each availableEvents as e}<option value={e}>{e}</option>{/each}
  </select>
</div>

<div class="list">
  {#if filtered.length === 0}
    <p class="muted">No results match these filters.</p>
  {:else}
    {#each filtered as r (r.id)}
      <a class="result-row" href={`/athletes/${r.athleteId}`}>
        <div>
          <div>{r.athleteName} · {r.event}{r.group ? ` · ${r.group}` : ''}</div>
          <div class="muted small">{r.date}</div>
        </div>
        <div class="mono">
          {fmtValue(r)}
        </div>
      </a>
    {/each}
  {/if}
</div>

<style>
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-decoration: none;
    color: var(--text);
  }
  .result-row:hover { background: var(--surface-2); }
  .small { font-size: 12px; }
</style>
