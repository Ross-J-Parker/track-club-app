export const EVENTS = {
  '60m':         { kind: 'track', laps: 1 },
  '100m':        { kind: 'track', laps: 1 },
  '200m':        { kind: 'track', laps: 1 },
  '400m':        { kind: 'track', laps: 1 },
  '800m':        { kind: 'track', laps: 2 },
  '1500m':       { kind: 'track', laps: 4 },
  '3000m':       { kind: 'track', laps: 8 },
  'Long jump':   { kind: 'field' },
  'High jump':   { kind: 'field' },
  'Shot put':    { kind: 'field' },
  'Javelin':     { kind: 'field' },
  'Discus':      { kind: 'field' },
  'Bleep test':  { kind: 'fitness' },
  'Bleep test (5m)': { kind: 'fitness' }
};

export const TRACK_EVENTS   = Object.entries(EVENTS).filter(([, v]) => v.kind === 'track').map(([k]) => k);
export const FIELD_EVENTS   = Object.entries(EVENTS).filter(([, v]) => v.kind === 'field').map(([k]) => k);
export const FITNESS_EVENTS = Object.entries(EVENTS).filter(([, v]) => v.kind === 'fitness').map(([k]) => k);

export const GROUPS = ['U11', 'Sprints', 'Middle distance', 'Jumps', 'Throws'];

export function fmtTime(ms) {
  if (ms == null) return '—';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Total distance covered for a bleep test level/shuttle position.
// Each shuttle is 20m. Sum of shuttles in completed levels + current shuttle.
export function bleepDistance(level, shuttle, table) {
  let total = 0;
  for (let i = 0; i < level - 1; i++) total += table[i].shuttles * 20;
  total += shuttle * 20;
  return total;
}

// Higher level (and within that, higher shuttle) is better for bleep test.
// Returns a single comparable number: level * 100 + shuttle.
export function bleepScore(r) {
  return (r.level || 0) * 100 + (r.shuttle || 0);
}

// Compute personal bests across all events for an athlete.
export function pbsForAthlete(athleteId, allResults) {
  const byEvent = {};
  for (const r of allResults) {
    if (r.athleteId !== athleteId || r.dnf) continue;
    let value, better;
    if (r.kind === 'field') {
      if (r.bestAttempt == null) continue;
      value = r.bestAttempt;
      better = !byEvent[r.event] || value > byEvent[r.event].value;
    } else if (r.kind === 'fitness') {
      value = bleepScore(r);
      if (value === 0) continue;
      better = !byEvent[r.event] || value > byEvent[r.event].value;
    } else {
      if (r.finalTime == null) continue;
      value = r.finalTime;
      better = !byEvent[r.event] || value < byEvent[r.event].value;
    }
    if (better) {
      byEvent[r.event] = {
        event: r.event,
        kind: r.kind,
        value,
        date: r.date,
        group: r.group,
        // Keep raw fields for display
        level: r.level,
        shuttle: r.shuttle,
        distanceM: r.distanceM
      };
    }
  }
  return Object.values(byEvent);
}

export function fmtValue(r) {
  if (r.dnf) return 'DNF';
  if (r.kind === 'field') return `${r.bestAttempt.toFixed(2)} m`;
  if (r.kind === 'fitness') return `L${r.level}.${r.shuttle}`;
  if (r.finalTime == null) return 'DNF';
  return fmtTime(r.finalTime);
}

// Long form (e.g. for profile pages)
export function fmtValueLong(r) {
  if (r.dnf) return 'DNF';
  if (r.kind === 'field') return `${r.bestAttempt.toFixed(2)} m`;
  if (r.kind === 'fitness') return `Level ${r.level}, Shuttle ${r.shuttle}`;
  if (r.finalTime == null) return 'DNF';
  return fmtTime(r.finalTime);
}
