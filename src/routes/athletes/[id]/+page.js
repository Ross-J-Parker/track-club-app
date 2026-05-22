import { storage } from '$lib/storage.js';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export function load({ params }) {
  const athletes = storage.getAthletes();
  const athlete = athletes.find(a => a.id === params.id);
  if (!athlete) throw error(404, 'Athlete not found');
  return {
    athlete,
    results: storage.getResults(),
    customBadges: storage.getCustomBadges()
  };
}
