<script>
  import { onDestroy } from 'svelte';
  import { storage } from '$lib/storage.js';
  import { EVENTS, TRACK_EVENTS, FIELD_EVENTS, GROUPS, fmtTime, todayISO, uid } from '$lib/events.js';
  import { checkBadges } from '$lib/badges.js';

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

  let phase = $state('setup'); // setup | live | field | results
  let group = $state('Sprints');
  let date = $state(todayISO());
  let eventName = $state('100m');
  let selectedIds = $state(new Set());

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

  function toggleAthlete(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = new Set(selectedIds);
  }

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
        group,
        date,
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
      group,
      date,
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
    race = race; // trigger reactivity
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
    if (pressTimers[r.id]) {
      clearTimeout(pressTimers[r.id]);
      pressTimers[r.id] = null;
    }
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

  function finishRace(forceFinish) {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    if (forceFinish) {
      race.runners.forEach(r => { if (!r.finished && !r.dnf) r.dnf = true; });
    }
    saveAndShowResults();
  }

  function saveFieldResults() {
    const valid = race.runners.filter(r => r.attempts.some(a => a != null));
    if (valid.length === 0) {
      flashHint('No results to save.');
      return;
    }
    saveAndShowResults();
  }

  function cancelField() {
    if (!confirm('Discard these results?')) return;
    race = null;
    phase = 'setup';
  }

  function saveAndShowResults() {
    const isField = race.kind === 'field';
    const newResults = race.runners
      .filter(r => isField ? r.attempts.some(a => a != null) : true)
      .map(r => {
        const base = {
          id: uid('r'),
          athleteId: r.id,
          athleteName: r.name,
          event: race.event,
          kind: race.kind,
          group: race.group,
          date: race.date,
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
      newResults,
      allResults,
      customBadges,
      badgeAwards
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
  }

  function flashHint(msg) {
    hintMessage = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintMessage = ''; }, 2500);
  }

  function openSplitsFor(r) {
    if (r.kind === 'field' || !r.splits || r.splits.length < 2) {
      flashHint('No splits — single-lap event.');
      return;
    }
    openSplits = r;
  }

  // Derived
  const sortedResults = $derived.by(() => {
    const finishers = resultsRows.filter(r => !r.dnf);
    const dnfs = resultsRows.filter(r => r.dnf);
    const isField = resultsRows[0]?.kind === 'field';
    const sorted = isField
      ? [...finishers].sort((a, b) => (b.bestAttempt || 0) - (a.bestAttempt || 0))
      : [...finishers].sort((a, b) => (a.finalTime ?? Infinity) - (b.finalTime ?? Infinity));
    return { sorted, dnfs, isField };
  });

  function lapBreakdown(r) {
    const splits = r.splits;
    const lapTimes = splits.map((s, i) => i === 0 ? s : s - splits[i - 1]);
    const fastestIdx = lapTimes.indexOf(Math.min(...lapTimes));
    const slowestIdx = lapTimes.indexOf(Math.max(...lapTimes));
    return lapTimes.map((lt, i) => ({
      n: i + 1,
      split: splits[i],
      lap: lt,
      fastest: i === fastestIdx,
      slowest: i === slowestIdx && fastestIdx !== slowestIdx
    }));
  }
</script>

{#if phase === 'setup'}
  <div class="setup">
    <div class="setup-grid">
      <div>
        <label class="field" for="group-sel">Session group</label>
        <select id="group-sel" bind:value={group}>
          {#each GROUPS as g}<option value={g}>{g}</option>{/each}
        </select>
      </div>
      <div>
        <label class="field" for="date-sel">Date</label>
        <input id="date-sel" type="date" bind:value={date} />
      </div>
    </div>
    <div style="margin-top: 14px;">
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
    </div>

    <div style="margin-top: 18px;">
      <label class="field">Athletes ({selectedIds.size} selected)</label>
      {#if athletes.length === 0}
        <div class="card dim">No athletes yet — add some in the Athletes tab.</div>
      {:else}
        <div class="athlete-grid">
          {#each athletes as a}
            {@const selected = selectedIds.has(a.id)}
            <button
              type="button"
              class="athlete-chip"
              class:selected
              onclick={() => toggleAthlete(a.id)}
            >
              {a.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button class="primary big" onclick={startRace} style="margin-top: 20px;">
      Start race
    </button>
    {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}
  </div>
{:else if phase === 'live'}
  <div class="live">
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
      {#each race.runners as r}
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
  </div>
{:else if phase === 'field'}
  <div class="field-phase">
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
        <div>Athlete</div>
        <div>A1</div>
        <div>A2</div>
        <div>A3</div>
        <div>Best</div>
      </div>
      {#each race.runners as r}
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
  </div>
{:else if phase === 'results'}
  {@const { sorted, dnfs, isField } = sortedResults}
  <div class="results">
    <div class="results-header">
      <div>
        <div class="muted" style="font-size: 13px;">{resultsRows[0]?.event} · {resultsRows[0]?.group} · {resultsRows[0]?.date}</div>
        <h2 style="font-size: 18px;">Final results</h2>
      </div>
      <button onclick={newRace}>New race</button>
    </div>
    {#each sorted as r, i}
      {@const hasDetail = !isField && r.splits && r.splits.length > 1}
      <button type="button" class="result-row" class:clickable={hasDetail} onclick={() => openSplitsFor(r)}>
        <div class="rank">{i + 1}</div>
        <div class="rname">{r.athleteName}</div>
        <div class="rvalue mono">
          {isField ? `${r.bestAttempt?.toFixed(2)} m` : fmtTime(r.finalTime)}
          {#if hasDetail}<span class="chev">›</span>{/if}
        </div>
      </button>
    {/each}
    {#each dnfs as r}
      <div class="result-row dnf">
        <div class="rank">DNF</div>
        <div class="rname">{r.athleteName}</div>
      </div>
    {/each}
    {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}
    {#if openSplits}
      <div class="splits-panel">
        <div class="row" style="margin-bottom: 8px;">
          <div style="font-weight: 600;">{openSplits.athleteName} · {fmtTime(openSplits.finalTime)}</div>
          <button onclick={() => openSplits = null}>Close</button>
        </div>
        <table class="splits-table">
          <thead>
            <tr><th>Lap</th><th>Split</th><th>Lap time</th></tr>
          </thead>
          <tbody>
            {#each lapBreakdown(openSplits) as lap}
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
    {#if awardedBadges.length}
      <div class="badges-earned">
        <h3 style="font-size: 14px; margin-bottom: 8px;">Badges earned</h3>
        {#each awardedBadges as b}
          <div class="badge-pill">
            <strong>{b.athleteName}</strong> — {b.badge}{b.detail ? ` (${b.detail})` : ''}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .setup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .athlete-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
  .athlete-chip {
    text-align: left;
    padding: 14px;
    min-height: 56px;
  }
  .athlete-chip.selected {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .big {
    width: 100%;
    padding: 16px;
    font-size: 16px;
  }
  .hint {
    margin-top: 10px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    color: var(--text-2);
    font-size: 13px;
  }
  .live-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .live-actions { display: flex; gap: 8px; }
  .clock {
    font-size: 40px;
    font-weight: 500;
    letter-spacing: -1px;
  }
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
  .runner-tile.finished {
    background: var(--success-soft);
    border-color: var(--success);
  }
  .runner-tile.dnf {
    background: var(--warning-soft);
    border-color: var(--warning);
    opacity: 0.7;
  }
  .runner-name { font-weight: 600; font-size: 15px; margin-bottom: 6px; }
  .pips { margin-bottom: 6px; }
  .pip {
    display: inline-block;
    width: 9px; height: 9px;
    border-radius: 50%;
    background: var(--border-strong);
    margin-right: 4px;
  }
  .pip.on { background: var(--text); }
  .runner-state { font-size: 13px; color: var(--text-2); }
  .field-rows { display: flex; flex-direction: column; gap: 4px; }
  .field-row {
    display: grid;
    grid-template-columns: 1.5fr 80px 80px 80px 70px;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .field-row.header {
    color: var(--text-2);
    font-size: 12px;
    border-bottom: 1px solid var(--border-strong);
  }
  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .result-row {
    width: 100%;
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 6px;
    text-align: left;
    cursor: default;
    min-height: 56px;
  }
  .result-row.clickable { cursor: pointer; }
  .result-row.clickable:hover { background: var(--surface-2); }
  .result-row.dnf { background: var(--warning-soft); border-color: var(--warning); }
  .rank { font-size: 18px; font-weight: 600; }
  .rname { font-size: 15px; }
  .rvalue { font-size: 15px; display: flex; align-items: center; gap: 6px; }
  .chev { color: var(--text-3); font-size: 18px; }
  .splits-panel {
    margin-top: 12px;
    background: var(--surface-2);
    padding: 14px;
    border-radius: var(--radius);
  }
  .splits-table { width: 100%; font-size: 13px; }
  .splits-table th { text-align: left; color: var(--text-2); font-weight: 500; padding: 4px 0; border-bottom: 1px solid var(--border-strong); }
  .splits-table td { padding: 6px 0; border-bottom: 1px solid var(--border); }
  .splits-table td:nth-child(2), .splits-table td:nth-child(3) { text-align: right; }
  .lap-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    margin-left: 6px;
  }
  .lap-tag.fast { background: var(--success-soft); color: var(--success); }
  .lap-tag.slow { background: var(--warning-soft); color: var(--warning); }
  .badges-earned { margin-top: 18px; }
  .badge-pill {
    padding: 10px 12px;
    background: var(--info-soft);
    color: var(--info);
    border-radius: var(--radius-sm);
    margin-bottom: 6px;
    font-size: 13px;
  }
  @media (max-width: 600px) {
    .setup-grid { grid-template-columns: 1fr; }
    .clock { font-size: 32px; }
    .field-row { grid-template-columns: 1fr 60px 60px 60px 60px; font-size: 13px; }
  }
</style>
