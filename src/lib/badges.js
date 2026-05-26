// Pure badge-checking logic. No storage, no side effects.

// Get a single comparable score from a result for ranking purposes.
// Higher-is-better convention: we negate times so lower-is-better events also work with "isBetter = candidate > current".
function scoreOf(r) {
  if (r.kind === 'field') return r.bestAttempt || 0;
  if (r.kind === 'fitness') return (r.level || 0) * 100 + (r.shuttle || 0);
  // track: lower time is better -> negate so we can use "greater than"
  return -1 * (r.finalTime || Infinity);
}

function isBetter(candidate, currentBest) {
  return scoreOf(candidate) > scoreOf(currentBest);
}

function pbDetail(r, bestPrior) {
  if (r.kind === 'field') {
    return `+${(r.bestAttempt - bestPrior.bestAttempt).toFixed(2)} m`;
  }
  if (r.kind === 'fitness') {
    return `Level ${r.level}.${r.shuttle} (was L${bestPrior.level}.${bestPrior.shuttle})`;
  }
  return `${((bestPrior.finalTime - r.finalTime) / 1000).toFixed(1)}s faster`;
}

export function checkBadges({ newResults, allResults, customBadges, badgeAwards }) {
  const awarded = [];
  const finishers = newResults.filter(r => !r.dnf);
  const updatedAwards = { ...badgeAwards };

  finishers.forEach(r => {
    const allPrior = allResults.filter(x =>
      x.athleteId === r.athleteId && x.event === r.event && x.id !== r.id && !x.dnf
    );

    // First time / PB
    if (allPrior.length === 0) {
      awarded.push({ athleteName: r.athleteName, badge: 'First time at this event' });
    } else {
      const bestPrior = allPrior.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, allPrior[0]);
      if (isBetter(r, bestPrior)) {
        awarded.push({
          athleteName: r.athleteName,
          badge: 'Personal best',
          detail: pbDetail(r, bestPrior)
        });
      }
    }

    // Club record
    const clubPrior = allResults.filter(x => x.event === r.event && x.id !== r.id && !x.dnf);
    if (clubPrior.length === 0) {
      awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: `${r.event} (first ever)` });
    } else {
      const clubBest = clubPrior.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, clubPrior[0]);
      if (isBetter(r, clubBest)) {
        awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: r.event });
      }
    }

    // Group record
    const groupPrior = allResults.filter(x =>
      x.event === r.event && x.group === r.group && x.id !== r.id && !x.dnf
    );
    if (groupPrior.length > 0) {
      const groupBest = groupPrior.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, groupPrior[0]);
      if (isBetter(r, groupBest)) {
        awarded.push({ athleteName: r.athleteName, badge: `${r.group} record`, detail: r.event });
      }
    }
  });

  // Local hero — best in this session
  if (finishers.length >= 2) {
    const winner = finishers.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, finishers[0]);
    // For team bleep tests, multiple finishers share the same score; pick first
    awarded.push({ athleteName: winner.athleteName, badge: 'Local hero', detail: 'best in session' });
  }

  // Custom sub-X challenges
  for (const r of finishers) {
    for (const b of customBadges) {
      if (b.event !== r.event) continue;
      if (b.group && b.group !== r.group) continue;
      // Determine "hit": kind-specific
      let hit = false;
      if (r.kind === 'field') hit = r.bestAttempt >= b.target;
      else if (r.kind === 'fitness') {
        // For fitness, target is encoded as level*100 + shuttle, e.g. 905 = L9.5
        // For now we'll treat it as a minimum level (rounded)
        const score = (r.level || 0) * 100 + (r.shuttle || 0);
        hit = score >= b.target;
      } else {
        hit = r.finalTime <= b.target * 1000;
      }
      if (!hit) continue;
      const key = `${b.id}:${r.athleteId}`;
      if (!updatedAwards[key]) {
        updatedAwards[key] = { firstDate: r.date };
        awarded.push({ athleteName: r.athleteName, badge: b.name, detail: 'unlocked' });
      } else {
        awarded.push({ athleteName: r.athleteName, badge: `${b.name} maintained`, detail: 'repeat' });
      }
    }
  }

  return { awarded, updatedAwards };
}

// Replay all badges ever earned by an athlete, ordered most-recent first.
export function replayBadgesForAthlete({ athleteId, allResults, customBadges }) {
  return replayCorrectly({ athleteId, allResults, customBadges });
}

function replayCorrectly({ athleteId, allResults, customBadges }) {
  const sorted = [...allResults]
    .filter(r => !r.dnf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const earned = [];
  const historyByEvent = {};
  const customUnlocked = {};

  for (const r of sorted) {
    const prior = historyByEvent[r.event] || [];
    const priorByThisAthlete = prior.filter(x => x.athleteId === r.athleteId);
    const priorInGroup = prior.filter(x => x.group === r.group);
    const isThis = r.athleteId === athleteId;

    if (isThis) {
      // PB / first time
      if (priorByThisAthlete.length === 0) {
        earned.push({ date: r.date, badge: 'First time at this event', detail: r.event, event: r.event, group: r.group });
      } else {
        const bestPrior = priorByThisAthlete.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, priorByThisAthlete[0]);
        if (isBetter(r, bestPrior)) {
          earned.push({ date: r.date, badge: 'Personal best', detail: `${r.event}: ${pbDetail(r, bestPrior)}`, event: r.event, group: r.group });
        }
      }

      // Club record
      if (prior.length === 0) {
        earned.push({ date: r.date, badge: 'Club record', detail: `${r.event} (first ever)`, event: r.event, group: r.group });
      } else {
        const clubBest = prior.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, prior[0]);
        if (isBetter(r, clubBest)) {
          earned.push({ date: r.date, badge: 'Club record', detail: r.event, event: r.event, group: r.group });
        }
      }

      // Group record
      if (priorInGroup.length > 0) {
        const groupBest = priorInGroup.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, priorInGroup[0]);
        if (isBetter(r, groupBest)) {
          earned.push({ date: r.date, badge: `${r.group} record`, detail: r.event, event: r.event, group: r.group });
        }
      }

      // Custom
      for (const b of customBadges) {
        if (b.event !== r.event) continue;
        if (b.group && b.group !== r.group) continue;
        let hit = false;
        if (r.kind === 'field') hit = r.bestAttempt >= b.target;
        else if (r.kind === 'fitness') hit = ((r.level || 0) * 100 + (r.shuttle || 0)) >= b.target;
        else hit = r.finalTime <= b.target * 1000;
        if (!hit) continue;
        const key = `${b.id}:${r.athleteId}`;
        if (!customUnlocked[key]) {
          customUnlocked[key] = true;
          earned.push({ date: r.date, badge: b.name, detail: 'unlocked', event: r.event, group: r.group });
        } else {
          earned.push({ date: r.date, badge: `${b.name} maintained`, detail: 'repeat', event: r.event, group: r.group });
        }
      }
    } else {
      // Track other athletes' first unlocks (so we don't double-credit)
      for (const b of customBadges) {
        if (b.event !== r.event) continue;
        if (b.group && b.group !== r.group) continue;
        let hit = false;
        if (r.kind === 'field') hit = r.bestAttempt >= b.target;
        else if (r.kind === 'fitness') hit = ((r.level || 0) * 100 + (r.shuttle || 0)) >= b.target;
        else hit = r.finalTime <= b.target * 1000;
        if (!hit) continue;
        const key = `${b.id}:${r.athleteId}`;
        customUnlocked[key] = true;
      }
    }

    if (!historyByEvent[r.event]) historyByEvent[r.event] = [];
    historyByEvent[r.event].push(r);
  }

  return earned.sort((a, b) => b.date.localeCompare(a.date));
}
