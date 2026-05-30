import { storage } from '$lib/storage.js';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const athletes = await storage.getAthletes();
  const athlete = athletes.find(a => a.id === params.id);
  if (!athlete) throw error(404, 'Athlete not found');
  return {
    athlete,
    results: storage.getResults(),
    customBadges: storage.getCustomBadges()
  };
}
