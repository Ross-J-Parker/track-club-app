<script>
  /**
   * Props:
   *   steps    — array of { key, label }
   *   current  — key of the active step
   *
   * Visually indicates progress through a multi-step setup wizard.
   */
  let { steps, current } = $props();

  const currentIdx = $derived(steps.findIndex(s => s.key === current));
</script>

<ol class="stepper" aria-label="Setup progress">
  {#each steps as step, i (step.key)}
    <li class="step" class:active={i === currentIdx} class:done={i < currentIdx}>
      <span class="dot" aria-hidden="true">
        {#if i < currentIdx}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {:else}
          {i + 1}
        {/if}
      </span>
      <span class="label">{step.label}</span>
      {#if i < steps.length - 1}<span class="bar" aria-hidden="true"></span>{/if}
    </li>
  {/each}
</ol>

<style>
  .stepper {
    display: flex;
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    gap: 0;
  }
  .step {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 8px;
    min-width: 0;
  }
  .dot {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid var(--border);
  }
  .step.active .dot {
    background: var(--text);
    color: var(--bg);
    border-color: var(--text);
  }
  .step.done .dot {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .label {
    font-size: 13px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .step.active .label { color: var(--text); font-weight: 500; }
  .step.done .label { color: var(--text-2); }
  .bar {
    flex: 1;
    height: 1px;
    background: var(--border);
    min-width: 12px;
  }
  .step.done .bar { background: var(--accent); }
  @media (max-width: 480px) {
    .label { font-size: 12px; }
    .step { gap: 6px; }
    .bar { min-width: 6px; }
  }
</style>
