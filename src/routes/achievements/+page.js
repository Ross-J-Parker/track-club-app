import { storage } from '$lib/storage.js';

export const ssr = false;
export const prerender = false;

export function load() {
  return {
    results: storage.getResults(),
    customBadges: storage.getCustomBadges(),
    badgeAwards: storage.getBadgeAwards()
  };
}
