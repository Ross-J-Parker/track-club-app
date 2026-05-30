// Storage layer. Hybrid state in May 2026:
//   - Athletes live in Supabase (cloud, shared across coaches)
//   - Results, badges, badge awards still on localStorage (will migrate next phase)
//
// Athletes API is now async (returns Promises) because database calls take time
// and can fail. Callers must await.

import { supabase } from './supabase.js';
import { get } from 'svelte/store';
import { coach } from './auth.js';

const PREFIX = 'trackclub:';

// ---- localStorage helpers (used for results/badges only now) ----

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

// ---- Athletes (Supabase) ----
//
// Each athlete row is { id (uuid), club_id (uuid), name (text), created_at }.
// We expose them in the same shape the rest of the app expects: { id, name }.

function currentClubId() {
  const c = get(coach);
  if (!c?.club_id) throw new Error('Not signed in or not approved');
  return c.club_id;
}

async function getAthletes() {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) {
    console.error('getAthletes failed', error);
    return [];
  }
  return data || [];
}

// Add a single athlete. Returns the new row (with its database-assigned UUID),
// or null on failure.
async function addAthlete(name) {
  const club_id = currentClubId();
  const { data, error } = await supabase
    .from('athletes')
    .insert({ name: name.trim(), club_id })
    .select('id, name')
    .single();
  if (error) {
    console.error('addAthlete failed', error);
    return null;
  }
  return data;
}

// Bulk-insert multiple athletes (for CSV import). Returns the new rows.
async function addAthletes(names) {
  const club_id = currentClubId();
  const rows = names
    .map(n => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
    .map(name => ({ name, club_id }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('athletes')
    .insert(rows)
    .select('id, name');
  if (error) {
    console.error('addAthletes failed', error);
    return [];
  }
  return data || [];
}

async function updateAthlete(id, patch) {
  const { error } = await supabase
    .from('athletes')
    .update(patch)
    .eq('id', id);
  if (error) console.error('updateAthlete failed', error);
  return !error;
}

async function deleteAthlete(id) {
  const { error } = await supabase
    .from('athletes')
    .delete()
    .eq('id', id);
  if (error) console.error('deleteAthlete failed', error);
  return !error;
}

// ---- Public API ----

export const storage = {
  // Athletes (async, Supabase-backed)
  getAthletes,
  addAthlete,
  addAthletes,
  updateAthlete,
  deleteAthlete,

  // Results, badges (still on localStorage for now)
  getResults() { return read('results', []); },
  setResults(list) { write('results', list); },
  getCustomBadges() { return read('customBadges', []); },
  setCustomBadges(list) { write('customBadges', list); },
  getBadgeAwards() { return read('badgeAwards', {}); },
  setBadgeAwards(obj) { write('badgeAwards', obj); }
};
