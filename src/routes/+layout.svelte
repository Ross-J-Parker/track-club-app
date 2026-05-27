<script>
  import '../app.css';
  import { page } from '$app/stores';

  const tabs = [
    { href: '/', label: 'Time', icon: 'stopwatch' },
    { href: '/bleep', label: 'Bleep', icon: 'bolt' },
    { href: '/athletes', label: 'Athletes', icon: 'users' },
    { href: '/history', label: 'History', icon: 'history' },
    { href: '/achievements', label: 'Achievements', icon: 'trophy' }
  ];

  // The "active" check needs to handle nested routes too — e.g. /athletes/abc-123 still highlights Athletes
  function isActive(href, current) {
    if (href === '/') return current === '/';
    return current === href || current.startsWith(href + '/');
  }

  let { children } = $props();
</script>

<div class="shell">
  <header>
    <a href="/" class="brand" aria-label="Track Club — go to home">
      <svg width="32" height="22" viewBox="0 0 60 40" aria-hidden="true">
        <!-- Outer track edge -->
        <rect x="2" y="2" width="56" height="36" rx="18" ry="18" fill="none" stroke="currentColor" stroke-width="2.5" />
        <!-- Inner lanes -->
        <rect x="9" y="9" width="42" height="22" rx="11" ry="11" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5" />
        <rect x="15" y="15" width="30" height="10" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4" />
        <!-- Start line marker -->
        <line x1="30" y1="2" x2="30" y2="9" stroke="currentColor" stroke-width="2" />
      </svg>
      <span>Track Club</span>
    </a>
  </header>

  <nav>
    {#each tabs as tab}
      {@const active = isActive(tab.href, $page.url.pathname)}
      <a href={tab.href} class:active title={tab.label} aria-label={tab.label}>
        {#if tab.icon === 'stopwatch'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="8"/><path d="M5 2h4"/><path d="M9 6V2"/><path d="M15 2h-4"/><path d="m20 4-2 2"/><path d="M12 14v-4"/></svg>
        {:else if tab.icon === 'users'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        {:else if tab.icon === 'history'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
        {:else if tab.icon === 'trophy'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
        {:else if tab.icon === 'bolt'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        {/if}
        <span class="tab-label">{tab.label}</span>
      </a>
    {/each}
  </nav>

  <main>
    {@render children?.()}
  </main>
</div>

<style>
  .shell {
    max-width: 880px;
    margin: 0 auto;
    padding: 16px;
    padding-top: max(16px, env(safe-area-inset-top));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 18px;
    color: var(--text);
    text-decoration: none;
    padding: 4px;
    margin: -4px;
    border-radius: var(--radius-sm);
  }
  .brand svg { color: var(--accent); }
  .brand:hover { color: var(--text); background: var(--surface-2); }
  nav {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 12px 8px;
    color: var(--text-2);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    font-size: 11px;
    font-weight: 500;
    flex: 1;
    min-width: 0;
  }
  nav a.active {
    color: var(--text);
    border-bottom-color: var(--text);
  }
  nav a:hover { color: var(--text); }
  .tab-label { white-space: nowrap; }
  main { padding-bottom: 40px; }
  @media (max-width: 480px) {
    .tab-label { font-size: 10px; }
    nav a { padding: 10px 6px 6px; }
  }
</style>
