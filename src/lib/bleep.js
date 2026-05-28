// Multi-Stage Fitness Test (bleep test) level data.
// Each level has a starting speed (km/h) and a number of shuttles.
// The shuttle interval depends on BOTH the speed and the shuttle distance:
//   - Standard test: 20m shuttles
//   - Hill / short variant: 5m shuttles (faster turnover, same speeds)
//
// Source: standard published 20m MSFT intervals used across PE, sports clubs and military.

function intervalMs(kmh, distanceM) {
  // time = distance / speed; distanceM at kmh km/h
  const seconds = (distanceM / 1000) / (kmh / 3600);
  return Math.round(seconds * 1000);
}

const LEVEL_SPEC = [
  { level: 1,  speed: 8.5,  shuttles: 7 },
  { level: 2,  speed: 9.0,  shuttles: 8 },
  { level: 3,  speed: 9.5,  shuttles: 8 },
  { level: 4,  speed: 10.0, shuttles: 9 },
  { level: 5,  speed: 10.5, shuttles: 9 },
  { level: 6,  speed: 11.0, shuttles: 10 },
  { level: 7,  speed: 11.5, shuttles: 10 },
  { level: 8,  speed: 12.0, shuttles: 11 },
  { level: 9,  speed: 12.5, shuttles: 11 },
  { level: 10, speed: 13.0, shuttles: 11 },
  { level: 11, speed: 13.5, shuttles: 12 },
  { level: 12, speed: 14.0, shuttles: 12 },
  { level: 13, speed: 14.5, shuttles: 13 },
  { level: 14, speed: 15.0, shuttles: 13 },
  { level: 15, speed: 15.5, shuttles: 13 },
  { level: 16, speed: 16.0, shuttles: 14 },
  { level: 17, speed: 16.5, shuttles: 14 },
  { level: 18, speed: 17.0, shuttles: 15 },
  { level: 19, speed: 17.5, shuttles: 15 },
  { level: 20, speed: 18.0, shuttles: 16 },
  { level: 21, speed: 18.5, shuttles: 16 }
];

// Build a level table for a given shuttle distance in metres.
// `slowdown` adds tolerance to every interval (e.g. 0.2 = 20% more time per shuttle),
// used for the uphill 5m variant where athletes move slower than flat-ground pace.
export function buildLevels(distanceM, slowdown = 0) {
  return LEVEL_SPEC.map(l => ({
    ...l,
    intervalMs: Math.round(intervalMs(l.speed, distanceM) * (1 + slowdown))
  }));
}

// Default 20m table (kept for backwards compatibility with existing imports)
export const BLEEP_LEVELS = buildLevels(20);

// Supported bleep variants
export const BLEEP_VARIANTS = {
  'Bleep test (20m)': { distanceM: 20, slowdown: 0, event: 'Bleep test' },
  'Bleep test (5m hills)': { distanceM: 5, slowdown: 0.2, event: 'Bleep test (5m)' }
};
