<script>
  import { onDestroy } from 'svelte';
  import { storage } from '$lib/storage.js';
  import { GROUPS, todayISO, uid } from '$lib/events.js';
  import { checkBadges } from '$lib/badges.js';
  import { BLEEP_LEVELS } from '$lib/bleep.js';
  import { BleepEngine } from '$lib/bleepEngine.js';

  let { data } = $props();
  const athletes = $derived(data.athletes);

  // Phase: setup | teams | live | results
  let phase = $state('setup');
  let mode = $state('individual'); // 'individual' | 'team'
  let group = $state('');           // optional — bleep test isn't tied to a group, but we capture it if set
  let date = $state(todayISO());
  let selectedIds = $state(new Set());

  // Team setup state
  let teamCount = $state(2);
  let teams = $state([]);
  let teamPickerFor = $state(null);

  // Live state
  let race = $state(null);
  let bleepEngine = null;
  let bleepState = $state({ level: 1, shuttle: 0, nextInMs: 0 });
  const pressTimers = {};

  // Results
  let resultsRows = $state([]);
  let awardedBadges = $state([]);
  let hintMessage = $state('');
  let hintTimer = null;

  onDestroy(() => {
    if (bleepEngine) bleepEngine.stop();
  });

  function flashHint(msg) {
    hintMessage = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintMessage = ''; }, 2500);
  }

  function toggleAthlete(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = new Set(selectedIds);
  }

  // ---------- Start ----------
  function start() {
    if (mode === 'team') {
      teams = Array.from({ length: teamCount }, (_, i) => ({
        id: uid('t'),
        name: `Team ${String.fromCharCode(65 + i)}`,
        athleteIds: new Set()
      }));
      phase = 'teams';
      return;
    }
    if (selectedIds.size === 0) {
      flashHint('Pick at least one athlete.');
      return;
    }
    startLive('individual');
  }

  // ---------- Teams ----------
  const unassigned = $derived(
    athletes.filter(a => !teams.some(t => t.athleteIds.has(a.id)))
  );

  function openTeamPicker(athleteId) { teamPickerFor = athleteId; }
  function closeTeamPicker() { teamPickerFor = null; }

  function assignToTeam(teamIdx, athleteId) {
    teams.forEach(t => t.athleteIds.delete(athleteId));
    teams[teamIdx].athleteIds.add(athleteId);
    teams = [...teams];
    teamPickerFor = null;
  }
  function removeFromTeam(teamIdx, athleteId) {
    teams[teamIdx].athleteIds.delete(athleteId);
    teams = [...teams];
  }
  function randomiseTeams() {
    const pool = athletes.filter(a => !teams.some(t => t.athleteIds.has(a.id)));
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((a, idx) => {
      teams[idx % teams.length].athleteIds.add(a.id);
    });
    teams = [...teams];
  }
  function clearTeams() {
    if (!confirm('Remove all athletes from teams?')) return;
    teams.forEach(t => t.athleteIds.clear());
    teams = [...teams];
  }
  function cancelTeams() {
    teams = [];
    teamPickerFor = null;
    phase = 'setup';
  }
  function confirmTeams() {
    const assigned = teams.reduce((sum, t) => sum + t.athleteIds.size, 0);
    if (assigned === 0) {
      flashHint('Assign at least one athlete to a team.');
      return;
    }
    teams = teams.filter(t => t.athleteIds.size > 0);
    startLive('team');
  }

  // ---------- Live ----------
  function startLive(m) {
    if (m === 'individual') {
      race = {
        event: 'Bleep test',
        kind: 'fitness',
        bleepMode: 'individual',
        group,
        date,
        runners: [...selectedIds].map(id => {
          const a = athletes.find(x => x.id === id);
          return { id, name: a.name, droppedAt: null, dnf: false };
        })
      };
    } else {
      race = {
        event: 'Bleep test',
        kind: 'fitness',
        bleepMode: 'team',
        group,
        date,
        teams: teams.map(t => ({
          id: t.id,
          name: t.name,
          memberIds: [...t.athleteIds],
          droppedAt: null
        }))
      };
    }
    phase = 'live';
    bleepState = { level: 1, shuttle: 0, nextInMs: 5000 };

    bleepEngine = new BleepEngine({
      onTick: (s) => { bleepState = s; },
      onLevelChange: () => {},
      onComplete: () => { finishLive(true); }
    });
    bleepEngine.start();
  }

  function tapRunner(r) {
    if (r.dnf || r.droppedAt) return;
    r.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
    race = race;
    checkComplete();
  }
  function tapTeam(t) {
    if (t.droppedAt) return;
    t.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
    race = race;
    checkComplete();
  }
  function startPress(r) {
    if (r.dnf || r.droppedAt) return;
    pressTimers[r.id] = setTimeout(() => {
      if (confirm(`Mark ${r.name} as DNF (didn't participate / withdrew)?`)) {
        r.dnf = true;
        race = race;
        checkComplete();
      }
      pressTimers[r.id] = null;
    }, 700);
  }
  function endPress(r) {
    if (pressTimers[r.id]) { clearTimeout(pressTimers[r.id]); pressTimers[r.id] = null; }
  }
  function checkComplete() {
    if (!race) return;
    if (race.bleepMode === 'individual') {
      if (race.runners.every(r => r.droppedAt || r.dnf)) {
        setTimeout(() => finishLive(false), 300);
      }
    } else {
      if (race.teams.every(t => t.droppedAt)) {
        setTimeout(() => finishLive(false), 300);
      }
    }
  }
  function cancelLive() {
    if (!confirm('Discard this bleep test?')) return;
    if (bleepEngine) { bleepEngine.stop(); bleepEngine = null; }
    race = null;
    phase = 'setup';
  }
  function finishLive(force) {
    if (bleepEngine) { bleepEngine.stop(); bleepEngine = null; }
    if (force && race) {
      if (race.bleepMode === 'individual') {
        race.runners.forEach(r => {
          if (!r.droppedAt && !r.dnf) {
            r.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
          }
        });
      } else {
        race.teams.forEach(t => {
          if (!t.droppedAt) {
            t.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
          }
        });
      }
    }
    saveAndShowResults();
  }

  function distanceForLevel(level, shuttle) {
    let total = 0;
    for (let i = 0; i < level - 1; i++) total += BLEEP_LEVELS[i].shuttles * 20;
    total += shuttle * 20;
    return total;
  }

  function saveAndShowResults() {
    const newResults = [];
    if (race.bleepMode === 'individual') {
      race.runners.forEach(r => {
        if (r.dnf) {
          newResults.push({
            id: uid('r'),
            athleteId: r.id, athleteName: r.name,
            event: 'Bleep test', kind: 'fitness', group: race.group,
            date: race.date, dnf: true, bleepMode: 'individual'
          });
          return;
        }
        const { level, shuttle } = r.droppedAt;
        newResults.push({
          id: uid('r'),
          athleteId: r.id, athleteName: r.name,
          event: 'Bleep test', kind: 'fitness', group: race.group,
          date: race.date, dnf: false,
          level, shuttle, distanceM: distanceForLevel(level, shuttle),
          bleepMode: 'individual'
        });
      });
    } else {
      race.teams.forEach(t => {
        const { level, shuttle } = t.droppedAt;
        t.memberIds.forEach(aid => {
          const a = athletes.find(x => x.id === aid);
          if (!a) return;
          newResults.push({
            id: uid('r'),
            athleteId: aid, athleteName: a.name,
            event: 'Bleep test', kind: 'fitness', group: race.group,
            date: race.date, dnf: false,
            level, shuttle, distanceM: distanceForLevel(level, shuttle),
            bleepMode: 'team',
            teamId: t.id, teamName: t.name, teamMemberIds: t.memberIds
          });
        });
      });
    }

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

  function newTest() {
    race = null;
    resultsRows = [];
    awardedBadges = [];
    selectedIds = new Set();
    teams = [];
    phase = 'setup';
  }

  // Total shuttles for current level (for progress bar)
  const totalShuttles = $derived(BLEEP_LEVELS[bleepState.level - 1]?.shuttles || 0);

  // Sort and group results
  const sortedResults = $derived.by(() => {
    if (race?.bleepMode === 'team') {
      // Group results by team for display
      const byTeam = {};
      resultsRows.forEach(r => {
        const key = r.teamId || r.athleteId;
        if (!byTeam[key]) byTeam[key] = { teamName: r.teamName, level: r.level, shuttle: r.shuttle, members: [] };
        byTeam[key].members.push(r);
      });
      const teamList = Object.values(byTeam)
        .sort((a, b) => (b.level * 100 + b.shuttle) - (a.level * 100 + a.shuttle));
      return { teamList, isTeam: true };
    }
    const finishers = resultsRows.filter(r => !r.dnf);
    const dnfs = resultsRows.filter(r => r.dnf);
    const sorted = [...finishers].sort((a, b) => (b.level * 100 + b.shuttle) - (a.level * 100 + a.shuttle));
    return { sorted, dnfs, isTeam: false };
  });

  // Classify badges into pill tones (same scheme as the timing page)
  function classifyBadge(b) {
    const name = b.badge;
    if (name === 'Personal best') return { code: 'PB', tone: 'pb' };
    if (name === 'Club record') return { code: 'CR', tone: 'cr' };
    if (name === 'Local hero') return { code: '★', tone: 'hero' };
    if (name === 'First time at this event') return { code: '1st', tone: 'first' };
    const m = name.match(/^(.+) record$/);
    if (m && m[1] !== 'Club') {
      const g = m[1];
      const short = g === 'Middle distance' ? 'MD' : g === 'U11' ? 'U11' : g.slice(0, 3);
      return { code: short, tone: 'group' };
    }
    if (name.endsWith('maintained')) return { code: '↻', tone: 'maintained' };
    return { code: '★', tone: 'custom' };
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
</script>

{#if phase === 'setup'}
  <h2 style="font-size: 18px; margin-bottom: 4px;">Bleep test</h2>
  <p class="muted small" style="margin: 0 0 18px;">20m multi-stage fitness test with audio beeps.</p>

  <div class="setup-grid">
    <div>
      <label class="field" for="b-mode">Mode</label>
      <div class="mode-toggle">
        <button type="button" class:active={mode === 'individual'} onclick={() => mode = 'individual'}>Individual</button>
        <button type="button" class:active={mode === 'team'} onclick={() => mode = 'team'}>Team relay</button>
      </div>
    </div>
    <div>
      <label class="field" for="b-date">Date</label>
      <input id="b-date" type="date" bind:value={date} />
    </div>
  </div>

  <div style="margin-top: 14px;">
    <label class="field" for="b-group">Session group (optional)</label>
    <select id="b-group" bind:value={group}>
      <option value="">— Not group-specific —</option>
      {#each GROUPS as g}<option value={g}>{g}</option>{/each}
    </select>
  </div>

  {#if mode === 'team'}
    <div style="margin-top: 14px;">
      <label class="field" for="b-team-count">Number of teams</label>
      <select id="b-team-count" bind:value={teamCount}>
        {#each [2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    <p class="muted small" style="margin-top: 14px;">Athletes are assigned to teams on the next screen.</p>
  {:else}
    <div style="margin-top: 18px;">
      <label class="field">Athletes ({selectedIds.size} selected)</label>
      {#if athletes.length === 0}
        <div class="card dim">No athletes yet — add some in the Athletes tab.</div>
      {:else}
        <div class="athlete-grid">
          {#each athletes as a (a.id)}
            {@const selected = selectedIds.has(a.id)}
            <button type="button" class="athlete-chip" class:selected onclick={() => toggleAthlete(a.id)}>{a.name}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <button class="primary big" onclick={start} style="margin-top: 20px;">
    {mode === 'team' ? 'Set up teams' : 'Start bleep test'}
  </button>
  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}

{:else if phase === 'teams'}
  <div class="live-header">
    <div style="font-weight: 600;">Set up teams</div>
    <div class="live-actions">
      <button onclick={cancelTeams}>Cancel</button>
      <button class="primary" onclick={confirmTeams}>Start bleep test</button>
    </div>
  </div>
  <p class="muted small" style="margin: 0 0 10px;">
    Tap an athlete to pick their team. Tap a member chip to remove them.
  </p>

  <div class="team-actions">
    <button onclick={randomiseTeams}>Randomise unassigned</button>
    <button onclick={clearTeams}>Clear all</button>
  </div>

  <div class="pool-section">
    <div class="muted small section-label">Unassigned ({unassigned.length})</div>
    {#if unassigned.length === 0}
      <div class="dim small" style="padding: 8px 0;">Everyone's been assigned to a team.</div>
    {:else}
      <div class="athlete-grid">
        {#each unassigned as a (a.id)}
          <button type="button" class="athlete-chip" onclick={() => openTeamPicker(a.id)}>{a.name}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#each teams as t, i (t.id)}
    <div class="team-card">
      <input type="text" bind:value={t.name} class="team-name-input" />
      <div class="team-members">
        {#if t.athleteIds.size === 0}
          <span class="dim small">No one assigned yet.</span>
        {:else}
          {#each [...t.athleteIds] as aid (aid)}
            {@const a = athletes.find(x => x.id === aid)}
            {#if a}
              <button type="button" class="member-chip" onclick={() => removeFromTeam(i, aid)}>
                {a.name} <span class="x">×</span>
              </button>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  {/each}

  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}

  {#if teamPickerFor}
    {@const pickerAthlete = athletes.find(a => a.id === teamPickerFor)}
    <div class="picker-overlay" onclick={closeTeamPicker}>
      <div class="picker-card" onclick={(e) => e.stopPropagation()}>
        <div class="picker-title">Assign {pickerAthlete?.name} to:</div>
        <div class="picker-options">
          {#each teams as t, i (t.id)}
            <button class="picker-team-btn" onclick={() => assignToTeam(i, teamPickerFor)}>
              {t.name}
              <span class="muted small">({t.athleteIds.size} {t.athleteIds.size === 1 ? 'member' : 'members'})</span>
            </button>
          {/each}
        </div>
        <button class="picker-cancel" onclick={closeTeamPicker}>Cancel</button>
      </div>
    </div>
  {/if}

{:else if phase === 'live'}
  <div class="live-header">
    <div>
      <div class="muted" style="font-size: 13px;">Bleep test · {race.bleepMode === 'team' ? 'Team relay' : 'Individual'}{race.group ? ' · ' + race.group : ''}</div>
      <div class="bleep-position">
        <div class="bleep-level">Level {bleepState.level}</div>
        <div class="bleep-countdown">Next beep in {Math.ceil(bleepState.nextInMs / 1000)}s</div>
      </div>
    </div>
    <div class="live-actions">
      <button onclick={cancelLive}>Cancel</button>
      <button onclick={() => finishLive(true)}>End test</button>
    </div>
  </div>

  <div class="shuttle-bar" aria-label="Shuttle progress for current level">
    {#each Array(totalShuttles) as _, j}
      <span class="shuttle-pip" class:lit={j < bleepState.shuttle}></span>
    {/each}
  </div>
  <p class="muted small" style="margin: 8px 0 12px;">
    Shuttle {bleepState.shuttle} of {totalShuttles} · Tap a {race.bleepMode === 'team' ? 'team' : 'runner'} when they drop out.
  </p>

  {#if race.bleepMode === 'individual'}
    <div class="runner-grid">
      {#each race.runners as r (r.id)}
        <button
          type="button"
          class="runner-tile"
          class:finished={r.droppedAt}
          class:dnf={r.dnf}
          onclick={() => tapRunner(r)}
          onmousedown={() => startPress(r)}
          onmouseup={() => endPress(r)}
          onmouseleave={() => endPress(r)}
          ontouchstart={() => startPress(r)}
          ontouchend={() => endPress(r)}
        >
          <div class="runner-name">{r.name}</div>
          <div class="runner-state mono">
            {#if r.dnf}DNF
            {:else if r.droppedAt}L{r.droppedAt.level}.{r.droppedAt.shuttle}
            {:else}Running
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <div class="runner-grid">
      {#each race.teams as t (t.id)}
        <button type="button" class="runner-tile" class:finished={t.droppedAt} onclick={() => tapTeam(t)}>
          <div class="runner-name">{t.name}</div>
          <div class="muted small">{t.memberIds.length} athlete{t.memberIds.length === 1 ? '' : 's'}</div>
          <div class="runner-state mono" style="margin-top: 4px;">
            {#if t.droppedAt}L{t.droppedAt.level}.{t.droppedAt.shuttle}
            {:else}Running
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}

{:else if phase === 'results'}
  <div class="results-header">
    <div>
      <div class="muted" style="font-size: 13px;">Bleep test · {race?.group || 'No group'} · {resultsRows[0]?.date}</div>
      <h2 style="font-size: 18px;">Final results</h2>
    </div>
    <button onclick={newTest}>New test</button>
  </div>

  {#if sortedResults.isTeam}
    {#each sortedResults.teamList as t, i (t.teamName)}
      <div class="result-row team-result">
        <div class="rank">{i + 1}</div>
        <div class="rmain">
          <div class="rname">{t.teamName}</div>
          <div class="muted small">{t.members.map(m => m.athleteName).join(', ')}</div>
        </div>
        <div class="rvalue mono">L{t.level}.{t.shuttle}</div>
      </div>
    {/each}
  {:else}
    {#each sortedResults.sorted as r, i (r.id)}
      {@const badges = badgesByAthlete[r.athleteId] || []}
      <div class="result-row">
        <div class="rank">{i + 1}</div>
        <div class="rmain">
          <div class="rname">{r.athleteName}</div>
          {#if badges.length}
            <div class="pill-row">
              {#each badges as b}
                <span class="pill pill-{b.tone}">{b.code}</span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="rvalue mono">L{r.level}.{r.shuttle}</div>
      </div>
    {/each}
    {#each sortedResults.dnfs as r (r.id)}
      <div class="result-row dnf">
        <div class="rank">DNF</div>
        <div class="rname">{r.athleteName}</div>
      </div>
    {/each}
  {/if}

  {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}
{/if}

<style>
  .setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .athlete-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
  .athlete-chip { text-align: left; padding: 14px; min-height: 56px; }
  .athlete-chip.selected {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .big { width: 100%; padding: 16px; font-size: 16px; }
  .hint {
    margin-top: 10px; padding: 10px 12px;
    background: var(--surface-2); border-radius: var(--radius-sm);
    color: var(--text-2); font-size: 13px;
  }
  .small { font-size: 13px; }

  /* Mode toggle */
  .mode-toggle { display: flex; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: var(--radius-sm); }
  .mode-toggle button {
    flex: 1; background: transparent; border: none;
    min-height: 40px; color: var(--text-2); font-weight: 500;
  }
  .mode-toggle button.active {
    background: var(--surface); color: var(--text); box-shadow: var(--shadow);
  }

  /* Team setup */
  .live-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 8px;
  }
  .live-actions { display: flex; gap: 8px; }
  .team-actions { display: flex; gap: 8px; margin-bottom: 14px; }
  .team-actions button { padding: 8px 14px; font-size: 13px; min-height: 40px; }
  .pool-section { margin-bottom: 16px; }
  .section-label { margin-bottom: 8px; font-weight: 500; }
  .team-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px; margin-bottom: 10px;
  }
  .team-name-input {
    font-size: 15px; font-weight: 600; margin-bottom: 10px;
    background: transparent; border: 1px solid transparent;
    padding: 4px 6px; margin-left: -6px;
  }
  .team-name-input:hover, .team-name-input:focus {
    background: var(--surface-2); border-color: var(--border);
  }
  .team-members {
    display: flex; gap: 6px; flex-wrap: wrap; min-height: 36px;
  }
  .member-chip {
    background: var(--accent); color: var(--bg); border-color: var(--accent);
    padding: 6px 10px; min-height: 0; font-size: 13px;
  }
  .member-chip .x { opacity: 0.7; margin-left: 4px; }

  /* Picker overlay */
  .picker-overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 16px;
  }
  .picker-card {
    background: var(--surface); border-radius: var(--radius);
    padding: 16px; box-shadow: var(--shadow-lg);
    width: 100%; max-width: 340px;
  }
  .picker-title { font-weight: 600; margin-bottom: 12px; }
  .picker-options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .picker-team-btn {
    text-align: left; display: flex; justify-content: space-between; align-items: center;
    padding: 12px 14px; background: var(--surface-2); border: 1px solid var(--border);
  }
  .picker-team-btn:hover { background: var(--border); }
  .picker-cancel { width: 100%; }

  /* Live */
  .bleep-position { display: flex; align-items: baseline; gap: 12px; }
  .bleep-level { font-size: 36px; font-weight: 600; letter-spacing: -1px; }
  .bleep-countdown { font-size: 14px; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .shuttle-bar { display: flex; gap: 4px; margin-top: 4px; }
  .shuttle-pip { flex: 1; height: 8px; border-radius: 4px; background: var(--border-strong); transition: background 0.15s; }
  .shuttle-pip.lit { background: var(--accent); }
  .runner-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .runner-tile {
    background: var(--surface); border-radius: var(--radius);
    padding: 16px; min-height: 96px;
    border: 1px solid var(--border-strong);
    text-align: left; cursor: pointer; user-select: none;
    -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .runner-tile:active { transform: scale(0.97); }
  .runner-tile.finished { background: var(--success-soft); border-color: var(--success); }
  .runner-tile.dnf { background: var(--warning-soft); border-color: var(--warning); opacity: 0.7; }
  .runner-name { font-weight: 600; font-size: 15px; margin-bottom: 6px; }
  .runner-state { font-size: 13px; color: var(--text-2); }

  /* Results */
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
    text-align: left; min-height: 56px;
  }
  .result-row.dnf { background: var(--warning-soft); border-color: var(--warning); }
  .rank { font-size: 18px; font-weight: 600; }
  .rmain { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rname { font-size: 15px; }
  .rvalue { font-size: 15px; }
  .pill-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .pill {
    display: inline-block; padding: 2px 8px;
    border-radius: 999px; font-size: 10px;
    font-weight: 600; line-height: 1.4; letter-spacing: 0.02em;
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
  }

  @media (max-width: 600px) {
    .setup-grid { grid-template-columns: 1fr; }
    .bleep-level { font-size: 28px; }
  }
</style>
