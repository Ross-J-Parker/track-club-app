<script>
  import { onMount } from 'svelte';
  import { storage } from '$lib/storage.js';
  import { EVENTS, GROUPS, uid } from '$lib/events.js';

  let customBadges = $state([]);
  let badgeAwards = $state({});
  let showBuilder = $state(false);
  let bEvent = $state('100m');
  let bTarget = $state('');
  let bGroup = $state('');
  let toast = $state(null);
  let toastTimer = null;

  const builtin = [
    { name: 'Personal best', desc: 'Beat your own time or distance at this event' },
    { name: 'First time', desc: 'First attempt at a new event' },
    { name: 'Local hero', desc: 'Best in the session' },
    { name: 'Club record', desc: 'Best in the club at this event' },
    { name: 'Group record', desc: 'Best in your group at this event' }
  ];

  onMount(() => {
    customBadges = storage.getCustomBadges();
    badgeAwards = storage.getBadgeAwards();
  });

  const eventEntries = Object.entries(EVENTS);
  const unitLabel = $derived(() => EVENTS[bEvent]?.kind === 'field' ? 'metres' : 'seconds');

  function saveBadge() {
    const target = parseFloat(bTarget);
    if (isNaN(target) || target <= 0) {
      alert('Enter a valid target.');
      return;
    }
    const kind = EVENTS[bEvent].kind;
    const name = kind === 'field' ? `${target.toFixed(2)}m+ ${bEvent}` : `Sub-${target} ${bEvent}`;
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

<h3 style="font-size: 15px; margin-bottom: 10px;">Built-in badges</h3>
<div class="badge-grid" style="margin-bottom: 24px;">
  {#each builtin as b}
    <div class="badge-card">
      <div class="badge-name">{b.name}</div>
      <div class="muted small">{b.desc}</div>
    </div>
  {/each}
</div>

<div class="row" style="margin-bottom: 10px;">
  <h3 style="font-size: 15px;">Sub-X challenges</h3>
  <button onclick={() => showBuilder = true}>New challenge</button>
</div>
<p class="dim small" style="margin-bottom: 12px;">
  First athlete to hit the target earns the unlock badge; repeats earn a "maintained" badge.
</p>

<div class="badge-grid">
  {#if customBadges.length === 0}
    <p class="dim">No challenges yet.</p>
  {:else}
    {#each customBadges as b (b.id)}
      {@const isField = EVENTS[b.event]?.kind === 'field'}
      {@const target = isField ? `${b.target.toFixed(2)} m or more` : `under ${b.target.toFixed(2)}s`}
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

{#if showBuilder}
  <div class="builder">
    <h4 style="font-size: 14px; margin-bottom: 12px;">New Sub-X challenge</h4>
    <div class="grid-2">
      <div>
        <label class="field" for="b-event">Event</label>
        <select id="b-event" bind:value={bEvent}>
          {#each eventEntries as [e, cfg]}
            <option value={e}>{e} ({cfg.kind === 'field' ? 'distance' : 'time'})</option>
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
    {#if toast.undoFn}
      <button onclick={handleUndo}>Undo</button>
    {/if}
  </div>
{/if}

<style>
  .badge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .badge-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
  }
  .badge-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .small { font-size: 12px; }
  .builder {
    margin-top: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
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
