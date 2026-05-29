// Shared authentication state for the app.
//
// Anywhere in the app can:
//   - read `session`, `coach`, `loaded` to know who's logged in
//   - call `signIn()`, `signUp()`, `signOut()` to change auth state
//
// The +layout.svelte calls `initAuth()` on app start, which loads the existing
// session (if any) and subscribes to auth changes. Everything downstream just reads.

import { writable, get } from 'svelte/store';
import { supabase } from './supabase.js';

export const session = writable(null);   // Supabase Session object, or null
export const coach = writable(null);      // The coaches row for the logged-in user, or null
export const loaded = writable(false);   // True once we've checked for an existing session

// Loads the coach record for the current auth user.
// Returns null if no session or no matching coach row.
async function loadCoach(currentSession) {
  if (!currentSession?.user) return null;
  const { data, error } = await supabase
    .from('coaches')
    .select('id, club_id, email, approved')
    .eq('id', currentSession.user.id)
    .maybeSingle();
  if (error) {
    console.error('Failed to load coach record:', error);
    return null;
  }
  return data;
}

// Called once on app start (from +layout.svelte) to bootstrap auth state.
export async function initAuth() {
  // Get the existing session if there is one.
  const { data: { session: existingSession } } = await supabase.auth.getSession();
  session.set(existingSession);
  coach.set(await loadCoach(existingSession));
  loaded.set(true);

  // Listen for auth changes (sign in, sign out, token refresh, etc.)
  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    session.set(newSession);
    coach.set(await loadCoach(newSession));
  });
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  // The trigger creates the coach row automatically server-side.
  return error ? error.message : null;
}

export async function signOut() {
  await supabase.auth.signOut();
  // The onAuthStateChange listener clears session/coach for us.
}

// Convenience: is the current user approved? (false if not logged in or pending)
export function isApproved() {
  return get(coach)?.approved === true;
}
