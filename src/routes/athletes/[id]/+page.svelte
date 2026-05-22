<script>
  import { fmtTime, pbsForAthlete, fmtValue, EVENTS } from '$lib/events.js';
  import { replayBadgesForAthlete } from '$lib/badges.js';

  let { data } = $props();

  const { athlete, results, customBadges } = $derived(data);

  const athleteResults = $derived(
    results
      .filter(r => r.athleteId === athlete.id)
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  const pbs = $derived(
    pbsForAthlete(athlete.id, results).sort((a, b) => {
      // Order: track events first, then field, both alphabetical-ish by Object.keys order
      const order = Object.keys(EVENTS);
      return order.indexOf(a.event) - order.indexOf(b.event);
    })
  );

  const badges = $derived(replayBadgesForAthlete({
    athleteId: athlete.id,
    allResults: results,
    customBadges
  }));

  function classifyBadge(name) {
    if (name === 'Personal best') return { code: 'PB', label: 'Personal best', tone: 'pb' };
    if (name === 'Club record') return { code: 'CR', label: 'Club record', tone: 'cr' };
    if (name === 'Local hero') return { code: '★', label: 'Local hero', tone: 'hero' };
    if (name === 'First time at this event') return { code: '1st', label: 'First time at event', tone: 'first' };
    const groupMatch = name.match(/^(.+) record$/);
    if (groupMatch && groupMatch[1] !== 'Club') {
      const group = groupMatch[1];
      const short = group === 'Middle distance' ? 'MD' : group === 'U11' ? 'U11' : group.slice(0, 3);
      return { code: short, label: `${group} record`, tone: 'group' };
    }
    if (name.endsWith('maintained')) return { code: '↻', label: name, tone: 'maintained' };
    return { code: '★', label: name, tone: 'custom' };
  }

  function fmtPbValue(pb) {
    return pb.kind === 'field' ? `${pb.value.toFixed(2)} m` : fmtTime(pb.value);
  }
</script>

<a href="/athletes" class="back-link">‹ Back to athletes</a>

<h1 class="profile-name">{athlete.name}</h1>
<div class="muted small" style="margin-bottom: 24px;">
  {athleteResults.length} {athleteResults.length === 1 ? 'result' : 'results'} ·
  {badges.length} {badges.length === 1 ? 'badge' : 'badges'} earned
</div>

<!-- PBs -->
<h2 class="section-title">Personal bests</h2>
{#if pbs.length === 0}
  <p class="muted small">No results yet.</p>
{:else}
  <div class="card pb-table">
    {#each pbs as pb}
      <div class="pb-row">
        <div>{pb.event}</div>
        <div class="mono">{fmtPbValue(pb)}</div>
        <div class="muted small">{pb.date}</div>
      </div>
    {/each}
  </div>
{/if}

<!-- Badges -->
<h2 class="section-title" style="margin-top: 28px;">Badges</h2>
{#if badges.length === 0}
  <p class="muted small">No badges earned yet.</p>
{:else}
  <div class="badge-list">
    {#each badges as b}
      {@const cls = classifyBadge(b.badge)}
      <div class="badge-row">
        <span class="pill pill-{cls.tone} large">{cls.code}</span>
        <div class="badge-text">
          <div class="badge-name">{cls.label}</div>
          {#if b.detail}<div class="muted small">{b.detail}</div>{/if}
        </div>
        <div class="muted small badge-date">{b.date}</div>
      </div>
    {/each}
  </div>
{/if}

<!-- Recent results -->
<h2 class="section-title" style="margin-top: 28px;">Recent results</h2>
{#if athleteResults.length === 0}
  <p class="muted small">No results yet.</p>
{:else}
  <div class="results-list">
    {#each athleteResults.slice(0, 20) as r (r.id)}
      <div class="result-row">
        <div>
          <div>{r.event}{r.group ? ` · ${r.group}` : ''}</div>
          <div class="muted small">{r.date}</div>
        </div>
        <div class="mono">{fmtValue(r)}</div>
      </div>
    {/each}
    {#if athleteResults.length > 20}
      <p class="muted small" style="text-align: center; padding: 12px;">Showing 20 most recent of {athleteResults.length}.</p>
    {/if}
  </div>
{/if}

<style>
  .back-link {
    display: inline-block;
    color: var(--text-2);
    text-decoration: none;
    font-size: 13px;
    margin-bottom: 12px;
  }
  .back-link:hover { color: var(--text); }
  .profile-name { font-size: 28px; margin-bottom: 4px; }
  .section-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
  .small { font-size: 12px; }
  .pb-table { padding: 0; }
  .pb-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .pb-row:last-child { border-bottom: none; }
  .badge-list { display: flex; flex-direction: column; gap: 6px; }
  .badge-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .badge-name { font-size: 14px; font-weight: 500; }
  .badge-date { white-space: nowrap; }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
  }
  .pill.large {
    padding: 6px 12px;
    font-size: 13px;
    min-width: 44px;
    text-align: center;
  }
  .pill-pb        { background: #dbeafe; color: #1e40af; }
  .pill-cr        { background: #fef3c7; color: #b45309; }
  .pill-group     { background: #dcfce7; color: #166534; }
  .pill-hero      { background: #fce7f3; color: #9d174d; }
  .pill-first     { background: #e0e7ff; color: #3730a3; }
  .pill-custom    { background: #f3e8ff; color: #6b21a8; }
  .pill-maintained{ background: var(--surface-2); color: var(--text-2); }
  @media (prefers-color-scheme: dark) {
    .pill-pb        { background: #1e3a8a; color: #dbeafe; }
    .pill-cr        { background: #78350f; color: #fef3c7; }
    .pill-group     { background: #14532d; color: #dcfce7; }
    .pill-hero      { background: #831843; color: #fce7f3; }
    .pill-first     { background: #312e81; color: #e0e7ff; }
    .pill-custom    { background: #581c87; color: #f3e8ff; }
    .pill-maintained{ background: var(--surface-2); color: var(--text-2); }
  }
  .results-list { display: flex; flex-direction: column; gap: 6px; }
  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
</style>
