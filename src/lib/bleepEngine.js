// Audio engine for the bleep test.
// Synthesizes beeps using Web Audio API.
// Uses drift correction: each beep schedules the next one based on
// the audio context's clock, not setTimeout drift.

import { BLEEP_LEVELS } from './bleep.js';

export class BleepEngine {
  constructor({ onTick, onLevelChange, onComplete }) {
    this.onTick = onTick;             // ({level, shuttle, nextInMs}) => void
    this.onLevelChange = onLevelChange; // (level) => void
    this.onComplete = onComplete;     // () => void
    this.ctx = null;
    this.running = false;
    this.level = 1;
    this.shuttle = 0; // 0 means waiting for first beep
    this.nextBeepAt = 0;
    this.tickHandle = null;
  }

  async start() {
    if (this.running) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Some browsers (iOS Safari especially) require a user gesture to resume audio
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.running = true;
    this.level = 1;
    this.shuttle = 0;

    // 5-second prep countdown before the first beep
    const prepMs = 5000;
    this.nextBeepAt = performance.now() + prepMs;
    this.playStartTone();
    // Announce starting level a moment after the start tone
    this.announceLevel(1);
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

      const levelData = BLEEP_LEVELS[this.level - 1];

      // Check if this beep finishes the current level
      if (this.shuttle > levelData.shuttles) {
        // Advance to next level
        this.level += 1;
        this.shuttle = 1;
        if (this.level > BLEEP_LEVELS.length) {
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
      const interval = BLEEP_LEVELS[this.level - 1].intervalMs;
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

  announceLevel(level) {
    if (typeof speechSynthesis === 'undefined') return;
    try {
      // Cancel any pending announcements (rapid level transitions edge case)
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`Level ${level}`);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      // Slight delay so it lands after the three beeps finish (~400ms total)
      setTimeout(() => {
        if (this.running) speechSynthesis.speak(u);
      }, 500);
    } catch {
      // If speech synthesis isn't available, we silently degrade — beeps still play
    }
  }

  playStartTone() {
    // Lower pitch start tone
    this.playTone(600, 200);
  }
}
