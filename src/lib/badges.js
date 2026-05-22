// Pure badge-checking logic. No storage, no side effects.
// Takes the new results, the full history, and the custom badges + awards.
// Returns a list of awarded badges and an updated awards map.

export function checkBadges({ newResults, allResults, customBadges, badgeAwards }) {
  const awarded = [];
  const finishers = newResults.filter(r => !r.dnf);
  const updatedAwards = { ...badgeAwards };

  finishers.forEach(r => {
    const isField = r.kind === 'field';
    const allPrior = allResults.filter(x =>
      x.athleteId === r.athleteId && x.event === r.event && x.id !== r.id && !x.dnf
    );

    // First time / PB
    if (allPrior.length === 0) {
      awarded.push({ athleteName: r.athleteName, badge: 'First time at this event' });
    } else if (isField) {
      const bestPrior = Math.max(...allPrior.map(x => x.bestAttempt || 0));
      if (r.bestAttempt > bestPrior) {
        awarded.push({
          athleteName: r.athleteName,
          badge: 'Personal best',
          detail: `+${(r.bestAttempt - bestPrior).toFixed(2)} m`
        });
      }
    } else {
      const bestPrior = Math.min(...allPrior.map(x => x.finalTime));
      if (r.finalTime < bestPrior) {
        awarded.push({
          athleteName: r.athleteName,
          badge: 'Personal best',
          detail: `${((bestPrior - r.finalTime) / 1000).toFixed(1)}s faster`
        });
      }
    }

    // Club record
    const clubPrior = allResults.filter(x => x.event === r.event && x.id !== r.id && !x.dnf);
    if (clubPrior.length === 0) {
      awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: `${r.event} (first ever)` });
    } else {
      const clubBest = isField
        ? Math.max(...clubPrior.map(x => x.bestAttempt || 0))
        : Math.min(...clubPrior.map(x => x.finalTime));
      if ((isField && r.bestAttempt > clubBest) || (!isField && r.finalTime < clubBest)) {
        awarded.push({ athleteName: r.athleteName, badge: 'Club record', detail: r.event });
      }
    }

    // Group record
    const groupPrior = allResults.filter(x =>
      x.event === r.event && x.group === r.group && x.id !== r.id && !x.dnf
    );
    if (groupPrior.length > 0) {
      const groupBest = isField
        ? Math.max(...groupPrior.map(x => x.bestAttempt || 0))
        : Math.min(...groupPrior.map(x => x.finalTime));
      if ((isField && r.bestAttempt > groupBest) || (!isField && r.finalTime < groupBest)) {
        awarded.push({ athleteName: r.athleteName, badge: `${r.group} record`, detail: r.event });
      }
    }
  });

  // Local hero — best in session
  if (finishers.length >= 2) {
    const isField = finishers[0].kind === 'field';
    const winner = isField
      ? [...finishers].sort((a, b) => (b.bestAttempt || 0) - (a.bestAttempt || 0))[0]
      : [...finishers].sort((a, b) => a.finalTime - b.finalTime)[0];
    awarded.push({ athleteName: winner.athleteName, badge: 'Local hero', detail: 'best in session' });
  }

  // Custom sub-X challenges
  for (const r of finishers) {
    const isField = r.kind === 'field';
    for (const b of customBadges) {
      if (b.event !== r.event) continue;
      if (b.group && b.group !== r.group) continue;
      const hit = isField ? r.bestAttempt >= b.target : r.finalTime <= b.target * 1000;
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

// Replay all badges ever earned by an athlete, ordered by date.
// Used for the athlete profile view, where we want their full collection.
export function replayBadgesForAthlete({ athleteId, allResults, customBadges }) {
  return replayCorrectly({ athleteId, allResults, customBadges });
}

function replayCorrectly({ athleteId, allResults, customBadges }) {
  const sorted = [...allResults]
    .filter(r => !r.dnf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const earned = [];
  const historyByEvent = {};
  const customUnlocked = {}; // key: badgeId:athleteId -> true

  for (const r of sorted) {
    const isField = r.kind === 'field';
    const prior = historyByEvent[r.event] || [];
    const priorByThisAthlete = prior.filter(x => x.athleteId === r.athleteId);
    const priorInGroup = prior.filter(x => x.group === r.group);

    const isThis = r.athleteId === athleteId;

    if (isThis) {
      // PB
      if (priorByThisAthlete.length === 0) {
        earned.push({ date: r.date, badge: 'First time at this event', detail: r.event, event: r.event, group: r.group });
      } else if (isField) {
        const bestPrior = Math.max(...priorByThisAthlete.map(x => x.bestAttempt || 0));
        if (r.bestAttempt > bestPrior) {
          earned.push({ date: r.date, badge: 'Personal best', detail: `${r.event}: +${(r.bestAttempt - bestPrior).toFixed(2)} m`, event: r.event, group: r.group });
        }
      } else {
        const bestPrior = Math.min(...priorByThisAthlete.map(x => x.finalTime));
        if (r.finalTime < bestPrior) {
          earned.push({ date: r.date, badge: 'Personal best', detail: `${r.event}: ${((bestPrior - r.finalTime) / 1000).toFixed(1)}s faster`, event: r.event, group: r.group });
        }
      }

      // Club record
      if (prior.length === 0) {
        earned.push({ date: r.date, badge: 'Club record', detail: `${r.event} (first ever)`, event: r.event, group: r.group });
      } else {
        const clubBest = isField
          ? Math.max(...prior.map(x => x.bestAttempt || 0))
          : Math.min(...prior.map(x => x.finalTime));
        if ((isField && r.bestAttempt > clubBest) || (!isField && r.finalTime < clubBest)) {
          earned.push({ date: r.date, badge: 'Club record', detail: r.event, event: r.event, group: r.group });
        }
      }

      // Group record
      if (priorInGroup.length > 0) {
        const groupBest = isField
          ? Math.max(...priorInGroup.map(x => x.bestAttempt || 0))
          : Math.min(...priorInGroup.map(x => x.finalTime));
        if ((isField && r.bestAttempt > groupBest) || (!isField && r.finalTime < groupBest)) {
          earned.push({ date: r.date, badge: `${r.group} record`, detail: r.event, event: r.event, group: r.group });
        }
      }

      // Custom
      for (const b of customBadges) {
        if (b.event !== r.event) continue;
        if (b.group && b.group !== r.group) continue;
        const hit = isField ? r.bestAttempt >= b.target : r.finalTime <= b.target * 1000;
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
      // Still need to track other athletes' first-time custom unlocks so we don't double-credit
      for (const b of customBadges) {
        if (b.event !== r.event) continue;
        if (b.group && b.group !== r.group) continue;
        const hit = isField ? r.bestAttempt >= b.target : r.finalTime <= b.target * 1000;
        if (!hit) continue;
        const key = `${b.id}:${r.athleteId}`;
        customUnlocked[key] = true;
      }
    }

    if (!historyByEvent[r.event]) historyByEvent[r.event] = [];
    historyByEvent[r.event].push(r);
  }

  // Sort earned most-recent first
  return earned.sort((a, b) => b.date.localeCompare(a.date));
}
