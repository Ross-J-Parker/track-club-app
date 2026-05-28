// Audio engine for the bleep test.
// Synthesizes beeps using Web Audio API.
// Uses drift correction: each beep schedules the next one based on
// the audio context's clock, not setTimeout drift.

import { BLEEP_LEVELS } from './bleep.js';

export class BleepEngine {
  constructor({ onTick, onLevelChange, onComplete, levels }) {
    this.onTick = onTick;             // ({level, shuttle, nextInMs}) => void
    this.onLevelChange = onLevelChange; // (level) => void
    this.onComplete = onComplete;     // () => void
    this.levels = levels || BLEEP_LEVELS;
    this.ctx = null;
    this.running = false;
    this.level = 1;
    this.shuttle = 0; // 0 means waiting for first beep
    this.nextBeepAt = 0;
    this.tickHandle = null;
  }

  start() {
    if (this.running) return;

    // iOS quirk: speech synthesis must be triggered synchronously inside the user
    // gesture handler. The moment we hit any `await`, the gesture context is lost
    // and iOS silently blocks speech. So we speak "Three" BEFORE any audio setup,
    // and we don't await the audio context resume.
    if (typeof speechSynthesis !== 'undefined') {
      try { speechSynthesis.cancel(); } catch {}
    }
    this.speak('Three');

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Fire-and-forget resume — don't await, to preserve the user gesture context for speech.
    if (this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch {}
    }

    this.running = true;
    this.level = 1;
    this.shuttle = 0;

    // "Three" already spoken above; schedule the rest.
    const stepMs = 1000;
    setTimeout(() => { if (this.running) this.speak('Two'); }, stepMs);
    setTimeout(() => { if (this.running) this.speak('One'); }, stepMs * 2);

    // First beep + "Go" land together at the end of the countdown (3 seconds in)
    const prepMs = stepMs * 3;
    this.nextBeepAt = performance.now() + prepMs;
    setTimeout(() => {
      if (this.running) this.speak('Go');
    }, prepMs);

    this.scheduleNextBeep();
    this.startTicker();
  }

  stop() {
    this.running = false;
    if (this.beepTimeout) clearTimeout(this.beepTimeout);
    if (this.tickHandle) cancelAnimationFrame(this.tickHandle);
    // Cut off any pending speech
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {}
    if (this.ctx) {
      try { this.ctx.close(); } catch {}
      this.ctx = null;
    }
  }

  // Schedule the next shuttle beep at this.nextBeepAt
  scheduleNextBeep() {
    if (!this.running) return;
    const delay = Math.max(0, this.nextBeepAt - performance.now());
    this.beepTimeout = setTimeout(() => {
      if (!this.running) return;
      this.shuttle += 1;

      const levelData = this.levels[this.level - 1];

      // Check if this beep finishes the current level
      if (this.shuttle > levelData.shuttles) {
        // Advance to next level
        this.level += 1;
        this.shuttle = 1;
        if (this.level > this.levels.length) {
          // Test complete (everyone who got here gets max score)
          this.playLevelChangeTone();
          this.running = false;
          this.onComplete?.();
          return;
        }
        this.playLevelChangeTone();
        this.onLevelChange?.(this.level);
      } else {
        this.playBeep();
      }

      // Schedule the next beep using the new level's interval
      const interval = this.levels[this.level - 1].intervalMs;
      this.nextBeepAt += interval;
      this.scheduleNextBeep();
    }, delay);
  }

  // 60fps ticker for UI updates (countdown display)
  startTicker() {
    const tick = () => {
      if (!this.running) return;
      const nextInMs = Math.max(0, this.nextBeepAt - performance.now());
      this.onTick?.({
        level: this.level,
        shuttle: this.shuttle,
        nextInMs
      });
      this.tickHandle = requestAnimationFrame(tick);
    };
    tick();
  }

  // Synth: a short pure tone
  playTone(freq, durationMs, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Quick attack/release to avoid clicks
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005);
    gain.gain.linearRampToValueAtTime(vol, t + (durationMs / 1000) - 0.01);
    gain.gain.linearRampToValueAtTime(0, t + (durationMs / 1000));
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + (durationMs / 1000) + 0.05);
  }

  playBeep() {
    this.playTone(1000, 120);
  }

  playLevelChangeTone() {
    // Three quick beeps at a slightly higher pitch
    this.playTone(1400, 100);
    setTimeout(() => this.playTone(1400, 100), 150);
    setTimeout(() => this.playTone(1400, 100), 300);
    // After the beeps, speak the level number
    this.announceLevel(this.level);
  }

  // Generic speech helper. Speaks the given text immediately.
  // Silently no-ops if speech synthesis isn't supported.
  //
  // iOS WebKit quirk: an utterance with no event handlers attached can be garbage-
  // collected before it speaks. Attaching `onstart`/`onend`/`onerror` (even empty)
  // keeps the utterance reachable until iOS actually utters it. This is the real
  // fix for "speech doesn't fire on iPhone" that was puzzling us in May 2026.
  speak(text) {
    if (typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onstart = () => {}; // keeps utterance alive on iOS until it speaks
      u.onend = () => {};
      u.onerror = () => {};
      speechSynthesis.speak(u);
    } catch {}
  }

  announceLevel(level) {
    if (typeof speechSynthesis === 'undefined') return;
    try {
      // Cancel any pending announcements (rapid level transitions edge case)
      speechSynthesis.cancel();
    } catch {}
    // Slight delay so it lands after the three beeps finish (~400ms total).
    // We use the shared `speak()` helper so iOS gets the handler-attached utterance.
    setTimeout(() => {
      if (this.running) this.speak(`Level ${level}`);
    }, 500);
  }
}
