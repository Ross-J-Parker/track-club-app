<script>
  import { onDestroy } from 'svelte';
  import { storage } from '$lib/storage.js';
  import { EVENTS, TRACK_EVENTS, FIELD_EVENTS, GROUPS, fmtTime, todayISO, uid } from '$lib/events.js';
  import { checkBadges } from '$lib/badges.js';
  import AthletePicker from '$lib/components/AthletePicker.svelte';
  import Stepper from '$lib/components/Stepper.svelte';

  let { data } = $props();

  // Seed athletes if empty (first run)
  let athletes = $state(data.athletes.length > 0 ? data.athletes : [
    { id: 'a1', name: 'Amelia Chen' },
    { id: 'a2', name: 'Ben Okafor' },
    { id: 'a3', name: 'Chloe Davies' },
    { id: 'a4', name: 'Daniyal Khan' },
    { id: 'a5', name: 'Esme Tate' }
  ]);
  if (data.athletes.length === 0) {
    storage.setAthletes(athletes);
  }

  // Phase: setup | live | field | results
  let phase = $state('setup');
  // Setup sub-step (only used while phase === 'setup'): event | group | athletes
  let setupStep = $state('event');

  let group = $state('Sprints');
  let date = $state(todayISO());
  let eventName = $state('100m');
  let selectedIds = $state(new Set());

  const wizardSteps = [
    { key: 'event', label: 'Event' },
    { key: 'group', label: 'Group' },
    { key: 'athletes', label: 'Athletes' }
  ];

  function nextStep() {
    if (setupStep === 'event') setupStep = 'group';
    else if (setupStep === 'group') setupStep = 'athletes';
  }
  function prevStep() {
    if (setupStep === 'athletes') setupStep = 'group';
    else if (setupStep === 'group') setupStep = 'event';
  }

  // Race state
  let race = $state(null);
  let now = $state(0);
  let tickHandle = null;

  // Press-and-hold for DNF
  const pressTimers = {};

  // Results
  let resultsRows = $state([]);
  let awardedBadges = $state([]);
  let openSplits = $state(null);
  let hintMessage = $state('');
  let hintTimer = null;

  onDestroy(() => {
    if (tickHandle) clearInterval(tickHandle);
  });

  function startRace() {
    if (selectedIds.size === 0) {
      flashHint('Pick at least one athlete.');
      return;
    }
    const cfg = EVENTS[eventName];
    if (cfg.kind === 'field') {
      race = {
        event: eventName,
        kind: 'field',
        group, date,
        runners: [...selectedIds].map(id => {
          const a = athletes.find(x => x.id === id);
          return { id, name: a.name, attempts: [null, null, null] };
        })
      };
      phase = 'field';
      return;
    }
    race = {
      event: eventName,
      kind: 'track',
      laps: cfg.laps,
      group, date,
      startedAt: Date.now(),
      runners: [...selectedIds].map(id => {
        const a = athletes.find(x => x.id === id);
        return { id, name: a.name, splits: [], finished: false, finalTime: null, dnf: false };
      })
    };
    phase = 'live';
    now = 0;
    tickHandle = setInterval(() => {
      now = Date.now() - race.startedAt;
    }, 100);
  }

  function tapRunner(r) {
    if (r.dnf || r.finished) return;
    const elapsed = Date.now() - race.startedAt;
    r.splits.push(elapsed);
    if (r.splits.length >= race.laps) {
      r.finished = true;
      r.finalTime = elapsed;
    }
    race = race;
    checkRaceComplete();
  }

  function startPress(r) {
    if (r.finished || r.dnf) return;
    pressTimers[r.id] = setTimeout(() => {
      if (confirm(`Mark ${r.name} as DNF?`)) {
        r.dnf = true;
        race = race;
        checkRaceComplete();
      }
      pressTimers[r.id] = null;
    }, 700);
  }
  function endPress(r) {
    if (pressTimers[r.id]) { clearTimeout(pressTimers[r.id]); pressTimers[r.id] = null; }
  }

  function checkRaceComplete() {
    if (!race) return;
    const allDone = race.runners.every(r => r.finished || r.dnf);
    if (allDone) setTimeout(() => finishRace(false), 300);
  }

  function cancelRace() {
    if (!confirm('Discard this race?')) return;
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    race = null;
    phase = 'setup';
  }

  function finishRace(force) {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (force) {
      race.runners.forEach(r => { if (!r.finished && !r.dnf) r.dnf = true; });
    }
    saveRaceAndShowResults();
  }

  function saveFieldResults() {
    const valid = race.runners.filter(r => r.attempts.some(a => a != null));
    if (valid.length === 0) { flashHint('No results to save.'); return; }
    saveRaceAndShowResults();
  }
  function cancelField() {
    if (!confirm('Discard these results?')) return;
    race = null;
    phase = 'setup';
  }

  function saveRaceAndShowResults() {
    const isField = race.kind === 'field';
    const newResults = race.runners
      .filter(r => isField ? r.attempts.some(a => a != null) : true)
      .map(r => {
        const base = {
          id: uid('r'),
          athleteId: r.id, athleteName: r.name,
          event: race.event, kind: race.kind, group: race.group, date: race.date,
          dnf: !!r.dnf
        };
        if (isField) {
          base.attempts = r.attempts;
          base.bestAttempt = Math.max(...r.attempts.filter(a => a != null));
        } else {
          base.finalTime = r.dnf ? null : r.finalTime;
          base.splits = r.splits;
        }
        return base;
      });

    const allResults = storage.getResults();
    storage.setResults([...allResults, ...newResults]);

    const customBadges = storage.getCustomBadges();
    const badgeAwards = storage.getBadgeAwards();
    const { awarded, updatedAwards } = checkBadges({
      newResults, allResults, customBadges, badgeAwards
    });
    storage.setBadgeAwards(updatedAwards);

    resultsRows = newResults;
    awardedBadges = awarded;
    phase = 'results';
  }

  function newRace() {
    race = null;
    resultsRows = [];
    awardedBadges = [];
    openSplits = null;
    selectedIds = new Set();
    phase = 'setup';
    setupStep = 'event';
  }

  function flashHint(msg) {
    hintMessage = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintMessage = ''; }, 2500);
  }

  function openSplitsFor(r) {
    const hasSplits = r.kind === 'track' && r.splits && r.splits.length >= 2;
    const hasBadges = (badgesByAthlete[r.athleteId] || []).length > 0;
    if (!hasSplits && !hasBadges) {
      flashHint('No splits or badges to show.');
      return;
    }
    openSplits = openSplits?.id === r.id ? null : r;
  }

  function classifyBadge(b) {
    const name = b.badge;
    if (name === 'Personal best') return { code: 'PB', label: 'Personal best', tone: 'pb' };
    if (name === 'Club record') return { code: 'CR', label: 'Club record', tone: 'cr' };
    if (name === 'Local hero') return { code: '★', label: 'Local hero', tone: 'hero' };
    if (name === 'First time at this event') return { code: '1st', label: 'First time at event', tone: 'first' };
    const m = name.match(/^(.+) record$/);
    if (m && m[1] !== 'Club') {
      const g = m[1];
      const short = g === 'Middle distance' ? 'MD' : g === 'U11' ? 'U11' : g.slice(0, 3);
      return { code: short, label: `${g} record`, tone: 'group' };
    }
    if (name.endsWith('maintained')) return { code: '↻', label: name, tone: 'maintained' };
    return { code: '★', label: name, tone: 'custom' };
  }

  const badgesByAthlete = $derived.by(() => {
    const map = {};
    for (const a of awardedBadges) {
      const r = resultsRows.find(x => x.athleteName === a.athleteName);
      const id = r?.athleteId || a.athleteName;
      if (!map[id]) map[id] = [];
      map[id].push({ ...a, ...classifyBadge(a) });
    }
    return map;
  });

  const sortedResults = $derived.by(() => {
    const finishers = resultsRows.filter(r => !r.dnf);
    const dnfs = resultsRows.filter(r => r.dnf);
    const isField = resultsRows[0]?.kind === 'field';
    const sorted = isField
      ? [...finishers].sort((a,b) => (b.bestAttempt||0) - (a.bestAttempt||0))
      : [...finishers].sort((a,b) => (a.finalTime ?? Infinity) - (b.finalTime ?? Infinity));
    return { sorted, dnfs, isField };
  });

  function lapBreakdown(r) {
    const splits = r.splits;
    const lapTimes = splits.map((s, i) => i === 0 ? s : s - splits[i - 1]);
    const fastestIdx = lapTimes.indexOf(Math.min(...lapTimes));
    const slowestIdx = lapTimes.indexOf(Math.max(...lapTimes));
    return lapTimes.map((lt, i) => ({
      n: i + 1, split: splits[i], lap: lt,
      fastest: i === fastestIdx,
      slowest: i === slowestIdx && fastestIdx !== slowestIdx
    }));
  }
</script>

{#if phase === 'setup'}
  <Stepper steps={wizardSteps} current={setupStep} />

  {#if setupStep === 'event'}
    <h2 class="step-heading">What event are you running?</h2>
    <p class="muted small step-sub">Choose a track or field event.</p>
    <label class="field" for="event-sel">Event</label>
    <select id="event-sel" bind:value={eventName}>
      <optgroup label="Track">
        {#each TRACK_EVENTS as e}
          <option value={e}>{e}{EVENTS[e].laps > 1 ? ` (${EVENTS[e].laps} laps)` : ''}</option>
        {/each}
      </optgroup>
      <optgroup label="Field">
        {#each FIELD_EVENTS as e}<option value={e}>{e}</option>{/each}
      </optgroup>
    </select>
    <div class="step-nav">
      <button class="primary big" onclick={nextStep}>Next</button>
    </div>

  {:else if setupStep === 'group'}
    <h2 class="step-heading">What group is this for?</h2>
    <p class="muted small step-sub">Records and PBs are tracked per group as well as overall.</p>
    <label class="field" for="group-sel">Group</label>
    <select id="group-sel" bind:value={group}>
      {#each GROUPS as g}<option value={g}>{g}</option>{/each}
    </select>
    <div style="margin-top: 14px;">
      <label class="field" for="date-sel">Session date</label>
      <input id="date-sel" type="date" bind:value={date} />
    </div>
    <div class="step-nav">
      <button onclick={prevStep}>Back</button>
      <button class="primary big" onclick={nextStep}>Next</button>
    </div>

  {:else if setupStep === 'athletes'}
    <h2 class="step-heading">Who's taking part?</h2>
    <p class="muted small step-sub">{eventName} · {group} · {date}</p>
    <AthletePicker {athletes} bind:selected={selectedIds} />
    <div class="step-nav">
      <button onclick={prevStep}>Back</button>
      <button class="primary big" onclick={startRace} disabled={selectedIds.size === 0}>
        Start race ({selectedIds.size})
      </button>
    </div>
  {/if}

  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}

{:else if phase === 'live'}
  <div class="live-header">
    <div>
      <div class="muted" style="font-size: 13px;">{race.event}{race.laps > 1 ? ` · ${race.laps} laps` : ''} · {race.group}</div>
      <div class="mono clock">{fmtTime(now)}</div>
    </div>
    <div class="live-actions">
      <button onclick={cancelRace}>Cancel</button>
      <button onclick={() => finishRace(true)}>End race</button>
    </div>
  </div>
  <p class="muted small" style="margin: 0 0 10px;">Tap as they cross the line. Long-press for DNF.</p>
  <div class="runner-grid">
    {#each race.runners as r (r.id)}
      {@const lapsRun = r.splits.length}
      <button
        type="button"
        class="runner-tile"
        class:finished={r.finished}
        class:dnf={r.dnf}
        onclick={() => tapRunner(r)}
        onmousedown={() => startPress(r)}
        onmouseup={() => endPress(r)}
        onmouseleave={() => endPress(r)}
        ontouchstart={() => startPress(r)}
        ontouchend={() => endPress(r)}
      >
        <div class="runner-name">{r.name}</div>
        {#if race.laps > 1}
          <div class="pips">
            {#each Array(race.laps) as _, j}
              <span class="pip" class:on={j < lapsRun}></span>
            {/each}
          </div>
        {/if}
        <div class="runner-state mono">
          {#if r.dnf}DNF
          {:else if r.finished}{fmtTime(r.finalTime)}
          {:else if race.laps > 1}Lap {lapsRun}/{race.laps}
          {:else}Tap to finish
          {/if}
        </div>
      </button>
    {/each}
  </div>

{:else if phase === 'field'}
  <div class="live-header">
    <div style="font-weight: 600;">{race.event} · {race.group}</div>
    <div class="live-actions">
      <button onclick={cancelField}>Cancel</button>
      <button class="primary" onclick={saveFieldResults}>Save</button>
    </div>
  </div>
  <p class="muted small" style="margin: 0 0 12px;">Up to 3 attempts per athlete. Best counts.</p>
  <div class="field-rows">
    <div class="field-row header">
      <div>Athlete</div><div>A1</div><div>A2</div><div>A3</div><div>Best</div>
    </div>
    {#each race.runners as r (r.id)}
      {@const valid = r.attempts.filter(a => a != null)}
      {@const best = valid.length ? Math.max(...valid).toFixed(2) + ' m' : '—'}
      <div class="field-row">
        <div>{r.name}</div>
        {#each [0, 1, 2] as j}
          <input type="number" step="0.01" bind:value={r.attempts[j]} placeholder="—" />
        {/each}
        <div class="mono">{best}</div>
      </div>
    {/each}
  </div>
  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}

{:else if phase === 'results'}
  {@const sr = sortedResults}
  <div class="results-header">
    <div>
      <div class="muted" style="font-size: 13px;">{resultsRows[0]?.event} · {resultsRows[0]?.group} · {resultsRows[0]?.date}</div>
      <h2 style="font-size: 18px;">Final results</h2>
    </div>
    <button onclick={newRace}>New race</button>
  </div>
  {#each sr.sorted as r, i (r.id)}
    {@const hasSplits = !sr.isField && r.splits && r.splits.length > 1}
    {@const badges = badgesByAthlete[r.athleteId] || []}
    {@const hasDetail = hasSplits || badges.length > 0}
    {@const isOpen = openSplits?.id === r.id}
    <button type="button" class="result-row" class:clickable={hasDetail} class:open={isOpen} onclick={() => openSplitsFor(r)}>
      <div class="rank">{i + 1}</div>
      <div class="rmain">
        <div class="rname">{r.athleteName}</div>
        {#if badges.length}
          <div class="pill-row">
            {#each badges as b}
              <span class="pill pill-{b.tone}" title={b.label}>{b.code}</span>
            {/each}
          </div>
        {/if}
      </div>
      <div class="rvalue mono">
        {sr.isField ? `${r.bestAttempt?.toFixed(2)} m` : fmtTime(r.finalTime)}
        {#if hasDetail}<span class="chev">{isOpen ? '⌃' : '›'}</span>{/if}
      </div>
    </button>
    {#if isOpen}
      <div class="detail-panel">
        {#if hasSplits}
          <div class="detail-section">
            <div class="detail-label">Splits</div>
            <table class="splits-table">
              <thead><tr><th>Lap</th><th>Split</th><th>Lap time</th></tr></thead>
              <tbody>
                {#each lapBreakdown(r) as lap}
                  <tr>
                    <td>{lap.n} {#if lap.fastest}<span class="lap-tag fast">fastest</span>{/if}{#if lap.slowest}<span class="lap-tag slow">slowest</span>{/if}</td>
                    <td class="mono">{fmtTime(lap.split)}</td>
                    <td class="mono">{fmtTime(lap.lap)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {#if badges.length}
          <div class="detail-section">
            <div class="detail-label">Badges earned</div>
            {#each badges as b}
              <div class="badge-detail-row">
                <span class="pill pill-{b.tone} large">{b.code}</span>
                <div>
                  <div class="badge-detail-name">{b.label}</div>
                  {#if b.detail}<div class="muted small">{b.detail}</div>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
  {#each sr.dnfs as r (r.id)}
    <div class="result-row dnf">
      <div class="rank">DNF</div>
      <div class="rname">{r.athleteName}</div>
    </div>
  {/each}
  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}
{/if}

<style>
  /* Wizard layout */
  .step-heading { font-size: 20px; margin: 0 0 4px; }
  .step-sub { margin: 0 0 18px; }
  .step-nav {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }
  .step-nav button:first-child { flex: 0 0 auto; }
  .step-nav .big { flex: 1; }
  .big { width: 100%; padding: 16px; font-size: 16px; }
  .hint {
    margin-top: 10px; padding: 10px 12px;
    background: var(--surface-2); border-radius: var(--radius-sm);
    color: var(--text-2); font-size: 13px;
  }
  .live-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 8px;
  }
  .live-actions { display: flex; gap: 8px; }
  .clock { font-size: 40px; font-weight: 500; letter-spacing: -1px; }
  .small { font-size: 13px; }
  .runner-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .runner-tile {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 16px;
    min-height: 96px;
    text-align: left;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .runner-tile:active { transform: scale(0.97); }
  .runner-tile.finished { background: var(--success-soft); border-color: var(--success); }
  .runner-tile.dnf { background: var(--warning-soft); border-color: var(--warning); opacity: 0.7; }
  .runner-name { font-weight: 600; font-size: 15px; margin-bottom: 6px; }
  .pips { margin-bottom: 6px; }
  .pip {
    display: inline-block; width: 9px; height: 9px;
    border-radius: 50%; background: var(--border-strong); margin-right: 4px;
  }
  .pip.on { background: var(--text); }
  .runner-state { font-size: 13px; color: var(--text-2); }
  .field-rows { display: flex; flex-direction: column; gap: 4px; }
  .field-row {
    display: grid;
    grid-template-columns: 1.5fr 80px 80px 80px 70px;
    gap: 8px; align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .field-row.header { color: var(--text-2); font-size: 12px; border-bottom: 1px solid var(--border-strong); }
  .results-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .result-row {
    width: 100%; display: grid; grid-template-columns: 36px 1fr auto;
    gap: 12px; align-items: center;
    padding: 14px 16px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 6px;
    text-align: left; cursor: default; min-height: 56px;
  }
  .result-row.clickable { cursor: pointer; }
  .result-row.clickable:hover { background: var(--surface-2); }
  .result-row.open { background: var(--surface-2); margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .result-row.dnf { background: var(--warning-soft); border-color: var(--warning); }
  .rank { font-size: 18px; font-weight: 600; }
  .rmain { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rname { font-size: 15px; }
  .rvalue { font-size: 15px; display: flex; align-items: center; gap: 6px; }
  .chev { color: var(--text-3); font-size: 18px; line-height: 1; }
  .pill-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .pill {
    display: inline-block; padding: 2px 8px;
    border-radius: 999px; font-size: 10px;
    font-weight: 600; line-height: 1.4; letter-spacing: 0.02em;
  }
  .pill.large { padding: 6px 12px; font-size: 13px; min-width: 44px; text-align: center; }
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
  }
  .detail-panel {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    padding: 14px 16px;
    margin-top: -1px;
    margin-bottom: 6px;
  }
  .detail-section + .detail-section { margin-top: 16px; }
  .detail-label {
    font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-3);
    font-weight: 600; margin-bottom: 8px;
  }
  .splits-table { width: 100%; font-size: 13px; }
  .splits-table th { text-align: left; color: var(--text-2); font-weight: 500; padding: 4px 0; border-bottom: 1px solid var(--border-strong); }
  .splits-table td { padding: 6px 0; border-bottom: 1px solid var(--border); }
  .splits-table td:nth-child(2), .splits-table td:nth-child(3) { text-align: right; }
  .lap-tag {
    font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px;
  }
  .lap-tag.fast { background: var(--success-soft); color: var(--success); }
  .lap-tag.slow { background: var(--warning-soft); color: var(--warning); }
  .badge-detail-row {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  .badge-detail-row:last-child { border-bottom: none; }
  .badge-detail-name { font-size: 14px; font-weight: 500; }
  @media (max-width: 600px) {
    .clock { font-size: 32px; }
    .field-row { grid-template-columns: 1fr 60px 60px 60px 60px; font-size: 13px; }
  }
</style>
