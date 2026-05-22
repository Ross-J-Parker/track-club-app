export const EVENTS = {
  '60m':       { kind: 'track', laps: 1 },
  '100m':      { kind: 'track', laps: 1 },
  '200m':      { kind: 'track', laps: 1 },
  '400m':      { kind: 'track', laps: 1 },
  '800m':      { kind: 'track', laps: 2 },
  '1500m':     { kind: 'track', laps: 4 },
  '3000m':     { kind: 'track', laps: 8 },
  'Long jump': { kind: 'field' },
  'High jump': { kind: 'field' },
  'Shot put':  { kind: 'field' },
  'Javelin':   { kind: 'field' },
  'Discus':    { kind: 'field' }
};

export const TRACK_EVENTS = Object.entries(EVENTS).filter(([, v]) => v.kind === 'track').map(([k]) => k);
export const FIELD_EVENTS = Object.entries(EVENTS).filter(([, v]) => v.kind === 'field').map(([k]) => k);

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

// Compute personal bests across all events for an athlete.
// Returns: [{ event, kind, value, valueFmt, date, group }]
export function pbsForAthlete(athleteId, allResults) {
  const byEvent = {};
  for (const r of allResults) {
    if (r.athleteId !== athleteId || r.dnf) continue;
    const isField = r.kind === 'field';
    const value = isField ? r.bestAttempt : r.finalTime;
    if (value == null) continue;
    const existing = byEvent[r.event];
    const better = isField
      ? !existing || value > existing.value
      : !existing || value < existing.value;
    if (better) {
      byEvent[r.event] = { event: r.event, kind: r.kind, value, date: r.date, group: r.group };
    }
  }
  return Object.values(byEvent);
}

export function fmtValue(r) {
  if (r.dnf || (r.kind === 'track' && r.finalTime == null)) return 'DNF';
  return r.kind === 'field' ? `${r.bestAttempt.toFixed(2)} m` : fmtTime(r.finalTime);
}
