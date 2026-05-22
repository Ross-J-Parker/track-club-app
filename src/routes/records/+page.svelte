<script>
  import { EVENTS, TRACK_EVENTS, FIELD_EVENTS, GROUPS, fmtTime } from '$lib/events.js';

  let { data } = $props();
  const results = $derived(data.results.filter(r => !r.dnf));

  function bestFor(filterFn, kind) {
    const subset = results.filter(filterFn);
    if (subset.length === 0) return null;
    return kind === 'field'
      ? subset.reduce((best, r) => (r.bestAttempt > (best?.bestAttempt || 0) ? r : best), null)
      : subset.reduce((best, r) => (r.finalTime < (best?.finalTime || Infinity) ? r : best), null);
  }

  function valueFor(r, kind) {
    if (!r) return null;
    return kind === 'field' ? `${r.bestAttempt.toFixed(2)} m` : fmtTime(r.finalTime);
  }

  const allEvents = [...TRACK_EVENTS, ...FIELD_EVENTS];
</script>

<h3 style="font-size: 15px; margin-bottom: 10px;">Club records</h3>
<div class="card">
  {#each allEvents as e}
    {@const kind = EVENTS[e].kind}
    {@const rec = bestFor(r => r.event === e, kind)}
    <div class="record-row">
      <div>{e}</div>
      <div>
        {#if rec}
          <span class="mono">{valueFor(rec, kind)}</span>
          <span class="muted small">{rec.athleteName}</span>
        {:else}
          <span class="dim">—</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<h3 style="font-size: 15px; margin: 20px 0 10px;">Group records</h3>
{#each GROUPS as g}
  {@const anyForGroup = allEvents.some(e => bestFor(r => r.event === e && r.group === g, EVENTS[e].kind))}
  <div class="group-block">
    <div class="group-label">{g}</div>
    <div class="card">
      {#if !anyForGroup}
        <div class="dim small">No results yet in this group.</div>
      {:else}
        {#each allEvents as e}
          {@const kind = EVENTS[e].kind}
          {@const rec = bestFor(r => r.event === e && r.group === g, kind)}
          {#if rec}
            <div class="record-row">
              <div>{e}</div>
              <div>
                <span class="mono">{valueFor(rec, kind)}</span>
                <span class="muted small">{rec.athleteName}</span>
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
{/each}

<style>
  .record-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .record-row:last-child { border-bottom: none; }
  .group-block { margin-bottom: 16px; }
  .group-label {
    font-size: 13px;
    color: var(--text-2);
    margin-bottom: 6px;
    font-weight: 500;
  }
  .small { font-size: 12px; margin-left: 8px; }
</style>
