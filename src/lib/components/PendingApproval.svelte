<script>
  import { signOut, coach } from '$lib/auth.js';
</script>

<div class="pending-screen">
  <div class="pending-card">
    <h1 class="title">Waiting for approval</h1>
    <p class="msg">
      Your account ({$coach?.email}) has been created but a coach hasn't approved access yet.
    </p>
    <p class="msg muted">
      An existing coach needs to approve you before you can use the app. Once that's done,
      sign out and back in to see your club's data.
    </p>
    <button type="button" class="primary big" onclick={signOut}>Sign out</button>
  </div>
</div>

<style>
  .pending-screen {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .pending-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 24px;
    width: 100%;
    max-width: 380px;
    box-shadow: var(--shadow);
    text-align: center;
  }
  .title {
    margin: 0 0 16px;
    font-size: 20px;
  }
  .msg {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.5;
  }
  .msg.muted { color: var(--text-2); }
  .big { width: 100%; padding: 14px; font-size: 15px; margin-top: 12px; }
</style>
