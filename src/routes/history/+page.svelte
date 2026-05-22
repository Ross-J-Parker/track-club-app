<script>
  import { tick } from 'svelte';
  import { fmtTime } from '$lib/events.js';
  import Chart from 'chart.js/auto';

  let { data } = $props();

  let athletes = $derived(data.athletes);
  let results = $derived(data.results);

  let athleteId = $state('');
  let eventName = $state('');
  let chartCanvas;
  let chartInstance = null;

  const availableEvents = $derived(
    !athleteId ? [] : [...new Set(results.filter(r => r.athleteId === athleteId && !r.dnf).map(r => r.event))]
  );

  const filtered = $derived.by(() => {
    let rows = [...results].sort((a, b) => b.date.localeCompare(a.date));
    if (athleteId) rows = rows.filter(r => r.athleteId === athleteId);
    if (eventName) rows = rows.filter(r => r.event === eventName);
    return rows;
  });

  const progressionData = $derived.by(() => {
    if (!athleteId || !eventName) return null;
    const d = results
      .filter(r => r.athleteId === athleteId && r.event === eventName && !r.dnf)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (d.length < 2) return null;
    return d;
  });

  $effect(() => {
    const d = progressionData;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (!d || !chartCanvas) return;
    tick().then(() => {
      const isField = d[0].kind === 'field';
      const values = d.map(r => isField ? r.bestAttempt : r.finalTime / 1000);
      chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels: d.map(r => r.date),
          datasets: [{
            label: isField ? 'Distance (m)' : 'Time (s)',
            data: values,
            borderColor: '#0f5132',
            backgroundColor: 'rgba(15, 81, 50, 0.1)',
            tension: 0.2,
            pointRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              reverse: !isField,
              title: { display: true, text: isField ? 'Distance (m)' : 'Time (s) — lower is better' }
            }
          }
        }
      });
    });
  });

  function onAthleteChange() {
    eventName = '';
  }
</script>

<div class="filters">
  <select bind:value={athleteId} onchange={onAthleteChange}>
    <option value="">All athletes</option>
    {#each athletes as a}<option value={a.id}>{a.name}</option>{/each}
  </select>
  <select bind:value={eventName} disabled={!athleteId}>
    <option value="">All events</option>
    {#each availableEvents as e}<option value={e}>{e}</option>{/each}
  </select>
</div>

{#if progressionData}
  <div class="chart-wrap">
    <canvas bind:this={chartCanvas}></canvas>
  </div>
{:else if athleteId && eventName}
  <p class="muted small">Need at least 2 results at this event to show progression.</p>
{/if}

<div class="list">
  {#if filtered.length === 0}
    <p class="muted">No results yet.</p>
  {:else}
    {#each filtered as r (r.id)}
      <div class="result-row">
        <div>
          <div>{r.athleteName} · {r.event}{r.group ? ` · ${r.group}` : ''}</div>
          <div class="muted small">{r.date}</div>
        </div>
        <div class="mono">
          {r.dnf ? 'DNF' : (r.kind === 'field' ? `${r.bestAttempt.toFixed(2)} m` : fmtTime(r.finalTime))}
        </div>
      </div>
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
  .chart-wrap {
    height: 260px;
    margin-bottom: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
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
  }
  .small { font-size: 12px; }
</style>
