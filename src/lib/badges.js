// Pure badge-checking logic. No storage, no side effects.

function scoreOf(r) {
  if (r.kind === 'field') return r.bestAttempt || 0;
  if (r.kind === 'fitness') return (r.level || 0) * 100 + (r.shuttle || 0);
  return -1 * (r.finalTime || Infinity);
}

function isBetter(candidate, currentBest) {
  return scoreOf(candidate) > scoreOf(currentBest);
}

function isStrictlyBetterOrEqual(candidate, currentBest) {
  return scoreOf(candidate) >= scoreOf(currentBest);
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

// Pick the single best result in a list. Returns null for empty.
function bestOf(list) {
  if (list.length === 0) return null;
  return list.reduce((best, x) => scoreOf(x) > scoreOf(best) ? x : best, list[0]);
}

export function checkBadges({ newResults, allResults, customBadges, badgeAwards }) {
  const awarded = [];
  const finishers = newResults.filter(r => !r.dnf);
  const updatedAwards = { ...badgeAwards };

  if (finishers.length === 0) return { awarded, updatedAwards };

  // Pre-compute the best new result per event (for club record fallback)
  // and per event+group (for group record fallback) when there's no prior history.
  const bestNewByEvent = {};
  const bestNewByEventGroup = {};
  finishers.forEach(r => {
    if (!bestNewByEvent[r.event] || scoreOf(r) > scoreOf(bestNewByEvent[r.event])) {
      bestNewByEvent[r.event] = r;
    }
    const key = `${r.event}:${r.group}`;
    if (!bestNewByEventGroup[key] || scoreOf(r) > scoreOf(bestNewByEventGroup[key])) {
      bestNewByEventGroup[key] = r;
    }
  });

  // Check if every finisher is new to this event (drives the "First time" badge noise-suppression)
  const everyoneIsNewToEvent = {};
  const eventGroups = [...new Set(finishers.map(r => r.event))];
  for (const ev of eventGroups) {
    const athletesInEv = finishers.filter(r => r.event === ev);
    everyoneIsNewToEvent[ev] = athletesInEv.every(r => {
      const prior = allResults.filter(x => x.athleteId === r.athleteId && x.event === r.event && x.id !== r.id && !x.dnf);
      return prior.length === 0;
    });
  }

  finishers.forEach(r => {
    const allPriorForAthlete = allResults.filter(x =>
      x.athleteId === r.athleteId && x.event === r.event && x.id !== r.id && !x.dnf
    );

    // First time / PB
    if (allPriorForAthlete.length === 0) {
      // Only award "First time" if NOT everyone in the session is new to this event
      // (avoids noisy badges when an entire team tries a new event together).
      if (!everyoneIsNewToEvent[r.event]) {
        awarded.push({ athleteName: r.athleteName, badge: 'First time at this event' });
      }
    } else {
      const bestPrior = bestOf(allPriorForAthlete);
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
      // No history at all for this event. Only the best new result gets the club record.
      if (bestNewByEvent[r.event].id === r.id) {
        awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: `${r.event} (first ever)` });
      }
    } else {
      const clubBest = bestOf(clubPrior);
      if (isBetter(r, clubBest)) {
        awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: r.event });
      }
    }

    // Group record
    const groupPrior = allResults.filter(x =>
      x.event === r.event && x.group === r.group && x.id !== r.id && !x.dnf
    );
    if (groupPrior.length === 0) {
      // No group history. Only the best new result in this group earns it.
      const key = `${r.event}:${r.group}`;
      if (bestNewByEventGroup[key].id === r.id) {
        awarded.push({ athleteName: r.athleteName, badge: `${r.group} record`, detail: `${r.event} (first in group)` });
      }
    } else {
      const groupBest = bestOf(groupPrior);
      if (isBetter(r, groupBest)) {
        awarded.push({ athleteName: r.athleteName, badge: `${r.group} record`, detail: r.event });
      }
    }
  });

  // Local hero — best in this session
  if (finishers.length >= 2) {
    const winner = bestOf(finishers);
    awarded.push({ athleteName: winner.athleteName, badge: 'Local hero', detail: 'best in session' });
  }

  // Custom sub-X challenges
  for (const r of finishers) {
    for (const b of customBadges) {
      if (b.event !== r.event) continue;
      if (b.group && b.group !== r.group) continue;
      let hit = false;
      if (r.kind === 'field') hit = r.bestAttempt >= b.target;
      else if (r.kind === 'fitness') hit = ((r.level || 0) * 100 + (r.shuttle || 0)) >= b.target;
      else hit = r.finalTime <= b.target * 1000;
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

// Replay all badges ever earned by an athlete.
export function replayBadgesForAthlete({ athleteId, allResults, customBadges }) {
  return replayCorrectly({ athleteId, allResults, customBadges });
}

function replayCorrectly({ athleteId, allResults, customBadges }) {
  // Group results by date so we can replay session-by-session with the same logic as live races.
  const byDate = {};
  for (const r of allResults) {
    if (r.dnf) continue;
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }
  const dates = Object.keys(byDate).sort();

  const earned = [];
  const accumulated = []; // results processed so far
  const customUnlocked = {};

  for (const date of dates) {
    const sessionResults = byDate[date];
    // For each event in this session, run the same logic as checkBadges, treating accumulated as history.
    const bestNewByEvent = {};
    const bestNewByEventGroup = {};
    sessionResults.forEach(r => {
      if (!bestNewByEvent[r.event] || scoreOf(r) > scoreOf(bestNewByEvent[r.event])) {
        bestNewByEvent[r.event] = r;
      }
      const key = `${r.event}:${r.group}`;
      if (!bestNewByEventGroup[key] || scoreOf(r) > scoreOf(bestNewByEventGroup[key])) {
        bestNewByEventGroup[key] = r;
      }
    });

    const everyoneIsNewToEvent = {};
    const eventGroups = [...new Set(sessionResults.map(r => r.event))];
    for (const ev of eventGroups) {
      const athletesInEv = sessionResults.filter(r => r.event === ev);
      everyoneIsNewToEvent[ev] = athletesInEv.every(r => {
        return !accumulated.some(x => x.athleteId === r.athleteId && x.event === r.event);
      });
    }

    for (const r of sessionResults) {
      const isThis = r.athleteId === athleteId;
      const priorForAthlete = accumulated.filter(x => x.athleteId === r.athleteId && x.event === r.event);
      const priorAll = accumulated.filter(x => x.event === r.event);
      const priorInGroup = accumulated.filter(x => x.event === r.event && x.group === r.group);

      if (isThis) {
        // First time / PB
        if (priorForAthlete.length === 0) {
          if (!everyoneIsNewToEvent[r.event]) {
            earned.push({ date: r.date, badge: 'First time at this event', detail: r.event, event: r.event, group: r.group });
          }
        } else {
          const bestPrior = bestOf(priorForAthlete);
          if (isBetter(r, bestPrior)) {
            earned.push({ date: r.date, badge: 'Personal best', detail: `${r.event}: ${pbDetail(r, bestPrior)}`, event: r.event, group: r.group });
          }
        }

        // Club record
        if (priorAll.length === 0) {
          if (bestNewByEvent[r.event].id === r.id) {
            earned.push({ date: r.date, badge: 'Club record', detail: `${r.event} (first ever)`, event: r.event, group: r.group });
          }
        } else {
          const clubBest = bestOf(priorAll);
          if (isBetter(r, clubBest)) {
            earned.push({ date: r.date, badge: 'Club record', detail: r.event, event: r.event, group: r.group });
          }
        }

        // Group record
        if (priorInGroup.length === 0) {
          const key = `${r.event}:${r.group}`;
          if (bestNewByEventGroup[key].id === r.id) {
            earned.push({ date: r.date, badge: `${r.group} record`, detail: `${r.event} (first in group)`, event: r.event, group: r.group });
          }
        } else {
          const groupBest = bestOf(priorInGroup);
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
        for (const b of customBadges) {
          if (b.event !== r.event) continue;
          if (b.group && b.group !== r.group) continue;
          let hit = false;
          if (r.kind === 'field') hit = r.bestAttempt >= b.target;
          else if (r.kind === 'fitness') hit = ((r.level || 0) * 100 + (r.shuttle || 0)) >= b.target;
          else hit = r.finalTime <= b.target * 1000;
          if (hit) customUnlocked[`${b.id}:${r.athleteId}`] = true;
        }
      }
    }

    // Add this session's results to accumulated
    accumulated.push(...sessionResults);
  }

  return earned.sort((a, b) => b.date.localeCompare(a.date));
}
