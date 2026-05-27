import { storage } from '$lib/storage.js';

export const ssr = false;
export const prerender = false;

export function load() {
  return {
    athletes: storage.getAthletes()
  };
}
