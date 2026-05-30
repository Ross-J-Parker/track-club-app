import { storage } from '$lib/storage.js';

export const ssr = false;
export const prerender = false;

export async function load() {
  return {
    athletes: await storage.getAthletes()
  };
}
