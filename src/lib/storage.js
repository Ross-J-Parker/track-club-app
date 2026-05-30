// Storage layer. Hybrid state in May 2026:
//   - Athletes live in Supabase (cloud, shared across coaches)
//   - Results, badges, badge awards still on localStorage (will migrate next phase)
//
// Athletes API is async (returns Promises). Callers must await.
// Athlete shape: { id, first_name, last_name }.

import { supabase } from './supabase.js';
import { get } from 'svelte/store';
import { coach } from './auth.js';

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

// ---- Athletes (Supabase) ----

function currentClubId() {
  const c = get(coach);
  if (!c?.club_id) throw new Error('Not signed in or not approved');
  return c.club_id;
}

async function getAthletes() {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true });
  if (error) {
    console.error('getAthletes failed', error);
    return [];
  }
  return data || [];
}

async function addAthlete(first_name, last_name) {
  const club_id = currentClubId();
  const row = {
    first_name: (first_name || '').trim(),
    last_name: (last_name || '').trim(),
    club_id
  };
  if (!row.first_name) {
    console.error('addAthlete: first_name required');
    return null;
  }
  const { data, error } = await supabase
    .from('athletes')
    .insert(row)
    .select('id, first_name, last_name')
    .single();
  if (error) {
    console.error('addAthlete failed', error);
    return null;
  }
  return data;
}

// Bulk insert. Accepts an array of { first_name, last_name } objects.
async function addAthletes(items) {
  const club_id = currentClubId();
  const rows = items
    .map(it => ({
      first_name: (it.first_name || '').trim(),
      last_name: (it.last_name || '').trim(),
      club_id
    }))
    .filter(r => r.first_name); // require at least a first name
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('athletes')
    .insert(rows)
    .select('id, first_name, last_name');
  if (error) {
    console.error('addAthletes failed', error);
    return [];
  }
  return data || [];
}

async function updateAthlete(id, patch) {
  const cleanPatch = {};
  if (patch.first_name !== undefined) cleanPatch.first_name = patch.first_name.trim();
  if (patch.last_name !== undefined) cleanPatch.last_name = (patch.last_name || '').trim();
  const { error } = await supabase
    .from('athletes')
    .update(cleanPatch)
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

// ---- Display helpers ----
//
// `displayName` is the normal way to render an athlete — "Amelia Chen".
// `sortName` is "Chen, Amelia" — used only when sorting alphabetically by last name,
// so the visual reflects the sort order.

export function displayName(a) {
  if (!a) return '';
  const first = (a.first_name || '').trim();
  const last = (a.last_name || '').trim();
  return last ? `${first} ${last}` : first;
}

export function sortName(a) {
  if (!a) return '';
  const first = (a.first_name || '').trim();
  const last = (a.last_name || '').trim();
  return last ? `${last}, ${first}` : first;
}

// Parse a full-name string into { first_name, last_name } using the
// last-whitespace heuristic. "Amelia van der Berg" → { first: "Amelia van der", last: "Berg" }.
// Single-word names get an empty last name; the user can fix that in edit afterwards.
export function splitFullName(full) {
  const trimmed = (full || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { first_name: '', last_name: '' };
  const idx = trimmed.lastIndexOf(' ');
  if (idx === -1) return { first_name: trimmed, last_name: '' };
  return {
    first_name: trimmed.slice(0, idx),
    last_name: trimmed.slice(idx + 1)
  };
}

// ---- Public API ----

export const storage = {
  getAthletes,
  addAthlete,
  addAthletes,
  updateAthlete,
  deleteAthlete,

  getResults() { return read('results', []); },
  setResults(list) { write('results', list); },
  getCustomBadges() { return read('customBadges', []); },
  setCustomBadges(list) { write('customBadges', list); },
  getBadgeAwards() { return read('badgeAwards', {}); },
  setBadgeAwards(obj) { write('badgeAwards', obj); }
};
