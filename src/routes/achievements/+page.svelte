<script>
  import { storage } from '$lib/storage.js';
  import { EVENTS, TRACK_EVENTS, FIELD_EVENTS, FITNESS_EVENTS, GROUPS, fmtTime, uid } from '$lib/events.js';

  let { data } = $props();
  const results = $derived(data.results.filter(r => !r.dnf));

  let customBadges = $state(data.customBadges);
  let badgeAwards = $state(data.badgeAwards);
  let showBuilder = $state(false);
  let bEvent = $state('100m');
  let bTarget = $state('');
  let bGroup = $state('');
  let toast = $state(null);
  let toastTimer = null;

  function scoreOf(r) {
    if (r.kind === 'field') return r.bestAttempt || 0;
    if (r.kind === 'fitness') return (r.level || 0) * 100 + (r.shuttle || 0);
    return -1 * (r.finalTime || Infinity);
  }
  function bestFor(filterFn) {
    const subset = results.filter(filterFn);
    if (subset.length === 0) return null;
    return subset.reduce((best, r) => scoreOf(r) > scoreOf(best) ? r : best, subset[0]);
  }
  function valueFor(r) {
    if (!r) return null;
    if (r.kind === 'field') return `${r.bestAttempt.toFixed(2)} m`;
    if (r.kind === 'fitness') return `L${r.level}.${r.shuttle}`;
    return fmtTime(r.finalTime);
  }

  const allEvents = [...TRACK_EVENTS, ...FIELD_EVENTS, ...FITNESS_EVENTS];
  const eventEntries = Object.entries(EVENTS);
  const unitLabel = $derived(EVENTS[bEvent]?.kind === 'field' ? 'metres' : EVENTS[bEvent]?.kind === 'fitness' ? 'score (e.g. 905 for L9.5)' : 'seconds');

  function saveBadge() {
    const target = parseFloat(bTarget);
    if (isNaN(target) || target <= 0) {
      alert('Enter a valid target.');
      return;
    }
    const kind = EVENTS[bEvent].kind;
    let name;
    if (kind === 'field') name = `${target.toFixed(2)}m+ ${bEvent}`;
    else if (kind === 'fitness') {
      const level = Math.floor(target / 100);
      const shuttle = target % 100;
      name = `L${level}.${shuttle}+ ${bEvent}`;
    } else name = `Sub-${target} ${bEvent}`;
    const b = { id: uid('cb'), name, event: bEvent, target, group: bGroup || null, kind };
    customBadges = [...customBadges, b];
    storage.setCustomBadges(customBadges);
    showBuilder = false;
    bTarget = '';
    bGroup = '';
  }

  function deleteBadge(b) {
    const idx = customBadges.indexOf(b);
    const removedAwards = Object.fromEntries(
      Object.entries(badgeAwards).filter(([k]) => k.startsWith(b.id + ':'))
    );
    customBadges = customBadges.filter(x => x.id !== b.id);
    Object.keys(removedAwards).forEach(k => delete badgeAwards[k]);
    storage.setCustomBadges(customBadges);
    storage.setBadgeAwards(badgeAwards);
    badgeAwards = { ...badgeAwards };
    showToast('Removed challenge', () => {
      customBadges.splice(idx, 0, b);
      customBadges = [...customBadges];
      Object.assign(badgeAwards, removedAwards);
      badgeAwards = { ...badgeAwards };
      storage.setCustomBadges(customBadges);
      storage.setBadgeAwards(badgeAwards);
    });
  }

  function awardCount(badgeId) {
    return Object.keys(badgeAwards).filter(k => k.startsWith(badgeId + ':')).length;
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
</script>

<!-- Club records -->
<h2 class="section-title">Club records</h2>
<p class="muted small" style="margin: 0 0 10px;">Best in the club across all groups.</p>
<div class="card">
  {#each allEvents as e}
    {@const rec = bestFor(r => r.event === e)}
    <div class="record-row">
      <div>{e}</div>
      <div>
        {#if rec}
          <span class="mono">{valueFor(rec)}</span>
          <span class="muted small">{rec.athleteName}</span>
        {:else}
          <span class="dim">—</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<!-- Group records -->
<h2 class="section-title" style="margin-top: 28px;">Group records</h2>
{#each GROUPS as g}
  {@const anyForGroup = allEvents.some(e => bestFor(r => r.event === e && r.group === g))}
  <div class="group-block">
    <div class="group-label">{g}</div>
    <div class="card">
      {#if !anyForGroup}
        <div class="dim small">No results yet in this group.</div>
      {:else}
        {#each allEvents as e}
          {@const rec = bestFor(r => r.event === e && r.group === g)}
          {#if rec}
            <div class="record-row">
              <div>{e}</div>
              <div>
                <span class="mono">{valueFor(rec)}</span>
                <span class="muted small">{rec.athleteName}</span>
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
{/each}

<!-- Sub-X challenges -->
<div class="row" style="margin-top: 28px; margin-bottom: 8px;">
  <h2 class="section-title" style="margin: 0;">Sub-X challenges</h2>
  <button onclick={() => showBuilder = true}>New challenge</button>
</div>
<p class="muted small" style="margin: 0 0 12px;">
  Set a target time, distance, or bleep score. First athlete to hit it earns the unlock badge; repeats earn a "maintained" badge.
</p>

<div class="badge-grid">
  {#if customBadges.length === 0}
    <p class="dim small">No challenges yet — create one with the button above.</p>
  {:else}
    {#each customBadges as b (b.id)}
      {@const kind = EVENTS[b.event]?.kind}
      {@const target = kind === 'field'
        ? `${b.target.toFixed(2)} m or more`
        : kind === 'fitness'
          ? `L${Math.floor(b.target / 100)}.${b.target % 100} or higher`
          : `under ${b.target.toFixed(2)}s`}
      <div class="badge-card">
        <div class="row" style="align-items: flex-start;">
          <div>
            <div class="badge-name">{b.name}</div>
            <div class="muted small">{b.event}: {target}{b.group ? ` · ${b.group} only` : ''}</div>
            <div class="dim small" style="margin-top: 4px;">Unlocked by {awardCount(b.id)} athlete{awardCount(b.id) === 1 ? '' : 's'}</div>
          </div>
          <button class="danger" onclick={() => deleteBadge(b)}>Delete</button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Builtin reference (compact) -->
<details class="builtin-details">
  <summary>What badges are awarded automatically?</summary>
  <ul class="builtin-list">
    <li><strong>Personal best</strong> — beating your own time, distance, or level at an event</li>
    <li><strong>First time</strong> — first attempt at a new event (suppressed when everyone in the session is new)</li>
    <li><strong>Local hero</strong> — best in the session</li>
    <li><strong>Club record</strong> — best in the club at this event</li>
    <li><strong>Group record</strong> — best in your group (e.g. U11, Sprints) at this event</li>
  </ul>
</details>

{#if showBuilder}
  <div class="builder">
    <h3 style="font-size: 14px; margin-bottom: 12px;">New Sub-X challenge</h3>
    <div class="grid-2">
      <div>
        <label class="field" for="b-event">Event</label>
        <select id="b-event" bind:value={bEvent}>
          {#each eventEntries as [e, cfg]}
            <option value={e}>{e} ({cfg.kind === 'field' ? 'distance' : cfg.kind === 'fitness' ? 'level' : 'time'})</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="field" for="b-target">Target ({unitLabel})</label>
        <input id="b-target" type="number" step="0.01" bind:value={bTarget} placeholder="15.00" />
      </div>
    </div>
    <div style="margin-top: 10px;">
      <label class="field" for="b-group">Scope</label>
      <select id="b-group" bind:value={bGroup}>
        <option value="">Any group</option>
        {#each GROUPS as g}<option value={g}>{g} only</option>{/each}
      </select>
    </div>
    <div class="row" style="margin-top: 14px; justify-content: flex-end;">
      <button onclick={() => showBuilder = false}>Cancel</button>
      <button class="primary" onclick={saveBadge}>Save</button>
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
  .section-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
  .small { font-size: 12px; }
  .record-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 14px;
  }
  .record-row:last-child { border-bottom: none; }
  .group-block { margin-bottom: 16px; }
  .group-label {
    font-size: 13px; color: var(--text-2);
    margin-bottom: 6px; font-weight: 500;
  }
  .small { font-size: 12px; margin-left: 8px; }

  .badge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }
  .badge-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
  }
  .badge-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }

  .builder {
    margin-top: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .builtin-details {
    margin-top: 12px;
    padding: 12px 14px;
    background: var(--surface-2);
    border-radius: var(--radius);
    font-size: 13px;
  }
  .builtin-details summary {
    cursor: pointer;
    color: var(--text-2);
    font-weight: 500;
  }
  .builtin-list {
    margin: 12px 0 0;
    padding-left: 18px;
    color: var(--text-2);
  }
  .builtin-list li { margin-bottom: 6px; }

  .toast {
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    padding: 10px 14px;
    border-radius: var(--radius);
    display: flex; align-items: center; gap: 12px;
    font-size: 14px; z-index: 100;
  }
</style>
