import { storage } from '$lib/storage.js';

export const ssr = false;
export const prerender = false;

export function load() {
  return {
    customBadges: storage.getCustomBadges(),
    badgeAwards: storage.getBadgeAwards()
  };
}
