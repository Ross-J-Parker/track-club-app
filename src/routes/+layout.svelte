<script>
  import '../app.css';
  import { page } from '$app/stores';

  const tabs = [
    { href: '/', label: 'Time' },
    { href: '/athletes', label: 'Athletes' },
    { href: '/history', label: 'History' },
    { href: '/records', label: 'Records' },
    { href: '/badges', label: 'Badges' }
  ];

  let { children } = $props();
</script>

<div class="shell">
  <header>
    <div class="brand">
      <span class="dot"></span>
      <span>Track Club</span>
    </div>
  </header>

  <nav>
    {#each tabs as tab}
      {@const active = $page.url.pathname === tab.href}
      <a href={tab.href} class:active>{tab.label}</a>
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
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
  }
  nav {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
    scrollbar-width: none;
  }
  nav::-webkit-scrollbar { display: none; }
  nav a {
    padding: 12px 14px;
    color: var(--text-2);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
  }
  nav a.active {
    color: var(--text);
    border-bottom-color: var(--text);
  }
  nav a:hover { color: var(--text); }
  main { padding-bottom: 40px; }
</style>
