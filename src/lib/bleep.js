// Standard 20m Multi-Stage Fitness Test (MSFT / bleep test) level data.
// Each level has a starting speed (km/h), a number of shuttles to complete,
// and a shuttle interval in milliseconds (calculated from speed: 20m / speed).
//
// Speeds: level 1 = 8.5 km/h, increasing by 0.5 km/h each level.
// Shuttle count grows roughly linearly with level.
//
// Source: standard published intervals used across PE, sports clubs and military.

function intervalMs(kmh) {
  // time = distance / speed; 20m at kmh km/h = (20 / 1000) / (kmh / 3600) seconds
  const seconds = (20 / 1000) / (kmh / 3600);
  return Math.round(seconds * 1000);
}

export const BLEEP_LEVELS = [
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
].map(l => ({ ...l, intervalMs: intervalMs(l.speed) }));
