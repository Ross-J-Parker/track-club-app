<script>
  import { onDestroy } from 'svelte';
  import { storage } from '$lib/storage.js';
  import { EVENTS, TRACK_EVENTS, FIELD_EVENTS, FITNESS_EVENTS, GROUPS, fmtTime, todayISO, uid } from '$lib/events.js';
  import { checkBadges } from '$lib/badges.js';
  import { BLEEP_LEVELS } from '$lib/bleep.js';
  import { BleepEngine } from '$lib/bleepEngine.js';

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

  // Phase: setup | live | field | bleep-teams | bleep-live | results
  let phase = $state('setup');
  let group = $state('Sprints');
  let date = $state(todayISO());
  let eventName = $state('100m');
  let selectedIds = $state(new Set());

  // Bleep test setup state
  let bleepMode = $state('individual'); // 'individual' | 'team'
  let bleepTeamCount = $state(2);
  let bleepTeams = $state([]); // [{ id, name, athleteIds: Set }]
  let teamPickerFor = $state(null); // athlete id whose team is being picked

  // Race state
  let race = $state(null);
  let now = $state(0);
  let tickHandle = null;

  // Bleep engine
  let bleepEngine = null;
  let bleepState = $state({ level: 1, shuttle: 0, nextInMs: 0 });

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
    if (bleepEngine) bleepEngine.stop();
  });

  const currentEventKind = $derived(EVENTS[eventName]?.kind);

  const bleepTotalShuttles = $derived(BLEEP_LEVELS[bleepState.level - 1]?.shuttles || 0);

  function toggleAthlete(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = new Set(selectedIds);
  }

  function startRace() {
    const cfg = EVENTS[eventName];
    const isTeamBleep = cfg.kind === 'fitness' && bleepMode === 'team';
    if (!isTeamBleep && selectedIds.size === 0) {
      flashHint('Pick at least one athlete.');
      return;
    }
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
    if (cfg.kind === 'fitness') {
      if (bleepMode === 'team') {
        // Build empty teams; assignment happens on the team-setup screen
        bleepTeams = Array.from({ length: bleepTeamCount }, (_, i) => ({
          id: uid('t'),
          name: `Team ${String.fromCharCode(65 + i)}`, // A, B, C…
          athleteIds: new Set()
        }));
        phase = 'bleep-teams';
        return;
      }
      // Individual mode — straight to live
      startBleepLive('individual');
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
    const hasSplits = r.kind === 'track' && r.splits && r.splits.length >= 2;
    const hasBadges = (badgesByAthlete[r.athleteId] || []).length > 0;
    if (!hasSplits && !hasBadges) {
      flashHint('No splits or badges to show.');
      return;
    }
    // Toggle: clicking the open row closes it
    openSplits = openSplits?.id === r.id ? null : r;
  }

  // Classify a badge into a category for pill display
  function classifyBadge(b) {
    const name = b.badge;
    if (name === 'Personal best') return { code: 'PB', label: 'Personal best', tone: 'pb' };
    if (name === 'Club record') return { code: 'CR', label: 'Club record', tone: 'cr' };
    if (name === 'Local hero') return { code: '★', label: 'Local hero', tone: 'hero' };
    if (name === 'First time at this event') return { code: '1st', label: 'First time at event', tone: 'first' };
    // Group record: e.g. "U11 record", "Sprints record"
    const groupMatch = name.match(/^(.+) record$/);
    if (groupMatch && groupMatch[1] !== 'Club') {
      const group = groupMatch[1];
      const short = group === 'Middle distance' ? 'MD' : group === 'U11' ? 'U11' : group.slice(0, 3);
      return { code: short, label: `${group} record`, tone: 'group' };
    }
    // Custom Sub-X or maintained
    if (name.endsWith('maintained')) {
      return { code: '↻', label: name, tone: 'maintained' };
    }
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

  // ---------- Bleep test ----------

  function toggleAthleteInTeam(teamIdx, athleteId) {
    const t = bleepTeams[teamIdx];
    if (t.athleteIds.has(athleteId)) t.athleteIds.delete(athleteId);
    else {
      // Remove from other teams first (each athlete is in exactly one team)
      bleepTeams.forEach(other => other.athleteIds.delete(athleteId));
      t.athleteIds.add(athleteId);
    }
    bleepTeams = [...bleepTeams]; // trigger reactivity
  }

  function openTeamPicker(athleteId) {
    teamPickerFor = athleteId;
  }

  function closeTeamPicker() {
    teamPickerFor = null;
  }

  function assignToTeam(teamIdx, athleteId) {
    // Remove from any existing team (safety) and add to the chosen one
    bleepTeams.forEach(t => t.athleteIds.delete(athleteId));
    bleepTeams[teamIdx].athleteIds.add(athleteId);
    bleepTeams = [...bleepTeams];
    teamPickerFor = null;
  }

  function removeFromTeam(teamIdx, athleteId) {
    bleepTeams[teamIdx].athleteIds.delete(athleteId);
    bleepTeams = [...bleepTeams];
  }

  function randomiseTeams() {
    // Distribute all currently-unassigned athletes across teams as evenly as possible
    const pool = athletes.filter(a => !bleepTeams.some(t => t.athleteIds.has(a.id)));
    // Fisher-Yates shuffle
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Round-robin into the existing teams
    shuffled.forEach((a, idx) => {
      bleepTeams[idx % bleepTeams.length].athleteIds.add(a.id);
    });
    bleepTeams = [...bleepTeams];
  }

  function clearTeams() {
    if (!confirm('Remove all athletes from teams?')) return;
    bleepTeams.forEach(t => t.athleteIds.clear());
    bleepTeams = [...bleepTeams];
  }

  const unassignedAthletes = $derived(
    athletes.filter(a => !bleepTeams.some(t => t.athleteIds.has(a.id)))
  );

  function cancelBleepTeams() {
    bleepTeams = [];
    teamPickerFor = null;
    phase = 'setup';
  }

  function confirmBleepTeams() {
    const assignedCount = bleepTeams.reduce((sum, t) => sum + t.athleteIds.size, 0);
    if (assignedCount === 0) {
      flashHint('Assign at least one athlete to a team.');
      return;
    }
    // Drop empty teams
    bleepTeams = bleepTeams.filter(t => t.athleteIds.size > 0);
    startBleepLive('team');
  }

  function startBleepLive(mode) {
    if (mode === 'individual') {
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
        teams: bleepTeams.map(t => ({
          id: t.id,
          name: t.name,
          memberIds: [...t.athleteIds],
          droppedAt: null
        }))
      };
    }
    phase = 'bleep-live';
    bleepState = { level: 1, shuttle: 0, nextInMs: 5000 };

    bleepEngine = new BleepEngine({
      onTick: (s) => { bleepState = s; },
      onLevelChange: () => {},
      onComplete: () => { finishBleep(true); }
    });
    bleepEngine.start();
  }

  function tapBleepRunner(r) {
    if (r.dnf || r.droppedAt) return;
    r.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
    race = race;
    checkBleepComplete();
  }

  function tapBleepTeam(t) {
    if (t.droppedAt) return;
    t.droppedAt = { level: bleepState.level, shuttle: bleepState.shuttle };
    race = race;
    checkBleepComplete();
  }

  function bleepStartPress(r) {
    if (r.dnf || r.droppedAt) return;
    pressTimers[r.id] = setTimeout(() => {
      if (confirm(`Mark ${r.name} as DNF (didn't participate / withdrew)?`)) {
        r.dnf = true;
        race = race;
        checkBleepComplete();
      }
      pressTimers[r.id] = null;
    }, 700);
  }
  function bleepEndPress(r) {
    if (pressTimers[r.id]) { clearTimeout(pressTimers[r.id]); pressTimers[r.id] = null; }
  }

  function checkBleepComplete() {
    if (!race) return;
    if (race.bleepMode === 'individual') {
      const allDone = race.runners.every(r => r.droppedAt || r.dnf);
      if (allDone) setTimeout(() => finishBleep(false), 300);
    } else {
      const allDone = race.teams.every(t => t.droppedAt);
      if (allDone) setTimeout(() => finishBleep(false), 300);
    }
  }

  function cancelBleep() {
    if (!confirm('Discard this bleep test?')) return;
    if (bleepEngine) { bleepEngine.stop(); bleepEngine = null; }
    race = null;
    phase = 'setup';
  }

  function finishBleep(forceFinish) {
    if (bleepEngine) { bleepEngine.stop(); bleepEngine = null; }
    if (forceFinish && race) {
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
    saveBleepAndShowResults();
  }

  function bleepDistanceForLevel(level, shuttle) {
    let total = 0;
    for (let i = 0; i < level - 1; i++) total += BLEEP_LEVELS[i].shuttles * 20;
    total += shuttle * 20;
    return total;
  }

  function saveBleepAndShowResults() {
    const newResults = [];
    if (race.bleepMode === 'individual') {
      race.runners.forEach(r => {
        if (r.dnf) {
          newResults.push({
            id: uid('r'),
            athleteId: r.id, athleteName: r.name,
            event: 'Bleep test', kind: 'fitness', group: race.group,
            date: race.date, dnf: true,
            bleepMode: 'individual'
          });
          return;
        }
        const { level, shuttle } = r.droppedAt;
        newResults.push({
          id: uid('r'),
          athleteId: r.id, athleteName: r.name,
          event: 'Bleep test', kind: 'fitness', group: race.group,
          date: race.date, dnf: false,
          level, shuttle, distanceM: bleepDistanceForLevel(level, shuttle),
          bleepMode: 'individual'
        });
      });
    } else {
      // Team mode: record same result against every team member
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
            level, shuttle, distanceM: bleepDistanceForLevel(level, shuttle),
            bleepMode: 'team',
            teamId: t.id, teamName: t.name,
            teamMemberIds: t.memberIds
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
        <optgroup label="Fitness">
          {#each FITNESS_EVENTS as e}<option value={e}>{e}</option>{/each}
        </optgroup>
      </select>
    </div>

    {#if currentEventKind === 'fitness'}
      <div style="margin-top: 14px;">
        <label class="field">Mode</label>
        <div class="mode-toggle">
          <button
            type="button"
            class:active={bleepMode === 'individual'}
            onclick={() => bleepMode = 'individual'}
          >Individual</button>
          <button
            type="button"
            class:active={bleepMode === 'team'}
            onclick={() => bleepMode = 'team'}
          >Team relay</button>
        </div>
        {#if bleepMode === 'team'}
          <div style="margin-top: 10px;">
            <label class="field" for="team-count">Number of teams</label>
            <select id="team-count" bind:value={bleepTeamCount}>
              {#each [2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}

    {#if !(currentEventKind === 'fitness' && bleepMode === 'team')}
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
    {:else}
      <p class="muted small" style="margin-top: 18px;">Athletes are assigned to teams on the next screen.</p>
    {/if}

    <button class="primary big" onclick={startRace} style="margin-top: 20px;">
      {currentEventKind === 'fitness' ? (bleepMode === 'team' ? 'Set up teams' : 'Start bleep test') : 'Start race'}
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
{:else if phase === 'bleep-teams'}
  <div class="bleep-teams">
    <div class="live-header">
      <div style="font-weight: 600;">Set up teams · {race?.group || group}</div>
      <div class="live-actions">
        <button onclick={cancelBleepTeams}>Cancel</button>
        <button class="primary" onclick={confirmBleepTeams}>Start bleep test</button>
      </div>
    </div>
    <p class="muted small" style="margin: 0 0 10px;">
      Tap an athlete to pick their team. Tap a member chip to remove them from a team.
    </p>

    <!-- Action row: randomise / clear -->
    <div class="team-actions">
      <button onclick={randomiseTeams}>Randomise unassigned</button>
      <button onclick={clearTeams}>Clear all</button>
    </div>

    <!-- Pool of unassigned athletes -->
    <div class="pool-section">
      <div class="muted small section-label">Unassigned ({unassignedAthletes.length})</div>
      {#if unassignedAthletes.length === 0}
        <div class="dim small" style="padding: 8px 0;">Everyone's been assigned to a team.</div>
      {:else}
        <div class="athlete-grid">
          {#each unassignedAthletes as a (a.id)}
            <button
              type="button"
              class="athlete-chip"
              onclick={() => openTeamPicker(a.id)}
            >
              {a.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Team cards -->
    {#each bleepTeams as t, i (t.id)}
      <div class="team-card">
        <input type="text" bind:value={t.name} class="team-name-input" />
        <div class="team-members">
          {#if t.athleteIds.size === 0}
            <span class="dim small">No one assigned yet — tap an athlete above.</span>
          {:else}
            {#each [...t.athleteIds] as aid (aid)}
              {@const a = athletes.find(x => x.id === aid)}
              {#if a}
                <button
                  type="button"
                  class="member-chip"
                  onclick={() => removeFromTeam(i, aid)}
                  aria-label={`Remove ${a.name} from ${t.name}`}
                >
                  {a.name} <span class="x">×</span>
                </button>
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    {/each}

    {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}

    <!-- Team picker popover -->
    {#if teamPickerFor}
      {@const pickerAthlete = athletes.find(a => a.id === teamPickerFor)}
      <div class="picker-overlay" onclick={closeTeamPicker}>
        <div class="picker-card" onclick={(e) => e.stopPropagation()}>
          <div class="picker-title">Assign {pickerAthlete?.name} to:</div>
          <div class="picker-options">
            {#each bleepTeams as t, i (t.id)}
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
  </div>
{:else if phase === 'bleep-live'}
  <div class="bleep-live">
    <div class="live-header">
      <div>
        <div class="muted" style="font-size: 13px;">Bleep test · {race.group} · {race.bleepMode === 'team' ? 'Team relay' : 'Individual'}</div>
        <div class="bleep-position">
          <div class="bleep-level">Level {bleepState.level}</div>
          <div class="bleep-countdown">Next beep in {Math.ceil(bleepState.nextInMs / 1000)}s</div>
        </div>
      </div>
      <div class="live-actions">
        <button onclick={cancelBleep}>Cancel</button>
        <button onclick={() => finishBleep(true)}>End test</button>
      </div>
    </div>

    <!-- Shuttle progress bar for current level -->
    <div class="shuttle-bar" aria-label="Shuttle progress for current level">
      {#each Array(bleepTotalShuttles) as _, j}
        <span class="shuttle-pip" class:lit={j < bleepState.shuttle}></span>
      {/each}
    </div>
    <p class="muted small" style="margin: 8px 0 12px;">
      Shuttle {bleepState.shuttle} of {bleepTotalShuttles} · Tap a {race.bleepMode === 'team' ? 'team' : 'runner'} when they drop out.
    </p>

    {#if race.bleepMode === 'individual'}
      <div class="runner-grid">
        {#each race.runners as r}
          <button
            type="button"
            class="runner-tile"
            class:finished={r.droppedAt}
            class:dnf={r.dnf}
            onclick={() => tapBleepRunner(r)}
            onmousedown={() => bleepStartPress(r)}
            onmouseup={() => bleepEndPress(r)}
            onmouseleave={() => bleepEndPress(r)}
            ontouchstart={() => bleepStartPress(r)}
            ontouchend={() => bleepEndPress(r)}
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
        {#each race.teams as t}
          <button
            type="button"
            class="runner-tile team"
            class:finished={t.droppedAt}
            onclick={() => tapBleepTeam(t)}
          >
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
      {@const hasSplits = !isField && r.splits && r.splits.length > 1}
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
          {isField ? `${r.bestAttempt?.toFixed(2)} m` : fmtTime(r.finalTime)}
          {#if hasDetail}<span class="chev">{isOpen ? '⌃' : '›'}</span>{/if}
        </div>
      </button>
      {#if isOpen}
        <div class="detail-panel">
          {#if hasSplits}
            <div class="detail-section">
              <div class="detail-label">Splits</div>
              <table class="splits-table">
                <thead>
                  <tr><th>Lap</th><th>Split</th><th>Lap time</th></tr>
                </thead>
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
    {#each dnfs as r}
      <div class="result-row dnf">
        <div class="rank">DNF</div>
        <div class="rname">{r.athleteName}</div>
      </div>
    {/each}
    {#if hintMessage}<div class="hint">{hintMessage}</div>{/if}
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
  .result-row.open { background: var(--surface-2); margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .result-row.dnf { background: var(--warning-soft); border-color: var(--warning); }
  .rank { font-size: 18px; font-weight: 600; }
  .rmain { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rname { font-size: 15px; }
  .rvalue { font-size: 15px; display: flex; align-items: center; gap: 6px; }
  .chev { color: var(--text-3); font-size: 18px; line-height: 1; }
  .pill-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.02em;
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
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
    font-weight: 600;
    margin-bottom: 8px;
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
  .badge-detail-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .badge-detail-row:last-child { border-bottom: none; }
  .badge-detail-name { font-size: 14px; font-weight: 500; }
  .small { font-size: 12px; }

  /* Mode toggle for individual / team */
  .mode-toggle { display: flex; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: var(--radius-sm); }
  .mode-toggle button {
    flex: 1;
    background: transparent;
    border: none;
    min-height: 40px;
    color: var(--text-2);
    font-weight: 500;
  }
  .mode-toggle button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  /* Team setup cards */
  .team-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    margin-bottom: 10px;
  }
  .team-name-input {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 10px;
    background: transparent;
    border: 1px solid transparent;
    padding: 4px 6px;
    margin-left: -6px;
  }
  .team-name-input:hover, .team-name-input:focus {
    background: var(--surface-2);
    border-color: var(--border);
  }
  .team-members {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    min-height: 36px;
    margin-bottom: 12px;
  }
  .member-chip {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    padding: 6px 10px;
    min-height: 0;
    font-size: 13px;
  }
  .member-chip .x { opacity: 0.7; margin-left: 4px; }
  .small-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)) !important; gap: 6px; }
  .athlete-chip.small { padding: 8px 10px; min-height: 40px; font-size: 13px; }

  /* Team setup screen */
  .team-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .team-actions button { padding: 8px 14px; font-size: 13px; min-height: 40px; }
  .pool-section { margin-bottom: 16px; }
  .section-label { margin-bottom: 8px; font-weight: 500; }

  /* Team-picker popover */
  .picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 16px;
  }
  .picker-card {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 340px;
  }
  .picker-title { font-weight: 600; margin-bottom: 12px; }
  .picker-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .picker-team-btn {
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .picker-team-btn:hover { background: var(--border); }
  .picker-cancel { width: 100%; }

  /* Bleep live screen */
  .bleep-position { display: flex; align-items: baseline; gap: 12px; }
  .bleep-level {
    font-size: 36px;
    font-weight: 600;
    letter-spacing: -1px;
  }
  .bleep-countdown {
    font-size: 14px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .shuttle-bar {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .shuttle-pip {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: var(--border-strong);
    transition: background 0.15s;
  }
  .shuttle-pip.lit { background: var(--accent); }
  .runner-tile.team {
    /* Slightly different style for team tiles */
  }

  @media (max-width: 600px) {
    .setup-grid { grid-template-columns: 1fr; }
    .clock { font-size: 32px; }
    .bleep-level { font-size: 28px; }
    .field-row { grid-template-columns: 1fr 60px 60px 60px 60px; font-size: 13px; }
  }
</style>
