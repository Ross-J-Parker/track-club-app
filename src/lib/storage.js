// Storage layer. Currently uses localStorage; will be swapped for Supabase later.
// The public API is the same shape we'll use for the cloud version.

const PREFIX = 'trackclub:';

function read(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage write failed', e);
  }
}

export const storage = {
  getAthletes() { return read('athletes', []); },
  setAthletes(list) { write('athletes', list); },
  getResults() { return read('results', []); },
  setResults(list) { write('results', list); },
  getCustomBadges() { return read('customBadges', []); },
  setCustomBadges(list) { write('customBadges', list); },
  getBadgeAwards() { return read('badgeAwards', {}); },
  setBadgeAwards(obj) { write('badgeAwards', obj); }
};
