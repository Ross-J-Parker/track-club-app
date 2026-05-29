<script>
  import { signIn, signUp } from '$lib/auth.js';

  let mode = $state('login'); // 'login' | 'signup'
  let email = $state('');
  let password = $state('');
  let submitting = $state(false);
  let errorMsg = $state('');
  let signupSuccess = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    errorMsg = '';
    if (!email.trim() || !password) {
      errorMsg = 'Email and password are both required.';
      return;
    }
    submitting = true;
    try {
      const err = mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
      if (err) {
        errorMsg = err;
      } else if (mode === 'signup') {
        // Successful signup — Supabase will auto-confirm if email confirmation is off,
        // otherwise the user needs to confirm. Either way, they'll be pending approval.
        signupSuccess = true;
      }
      // On successful sign-in, the onAuthStateChange listener takes over from here.
    } finally {
      submitting = false;
    }
  }

  function switchMode(to) {
    mode = to;
    errorMsg = '';
    signupSuccess = false;
  }
</script>

<div class="auth-screen">
  <div class="auth-card">
    <h1 class="auth-title">Track Club</h1>
    <p class="auth-sub">Phoenix Flyers</p>

    {#if signupSuccess}
      <div class="success-block">
        <h2 class="block-title">Almost there</h2>
        <p>Your account has been created. A coach needs to approve you before you can sign in. You'll be able to log in once approval is confirmed.</p>
        <button type="button" class="link-btn" onclick={() => switchMode('login')}>Back to sign in</button>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <label class="field" for="auth-email">Email</label>
        <input id="auth-email" type="email" bind:value={email} autocomplete="email" required />

        <label class="field" for="auth-password" style="margin-top: 12px;">Password</label>
        <input id="auth-password" type="password" bind:value={password} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required minlength="6" />

        {#if errorMsg}
          <p class="error">{errorMsg}</p>
        {/if}

        <button type="submit" class="primary big" disabled={submitting} style="margin-top: 16px;">
          {#if submitting}Working…
          {:else if mode === 'login'}Sign in
          {:else}Create account
          {/if}
        </button>
      </form>

      <p class="switch">
        {#if mode === 'login'}
          New coach?
          <button type="button" class="link-btn" onclick={() => switchMode('signup')}>Create an account</button>
        {:else}
          Already have an account?
          <button type="button" class="link-btn" onclick={() => switchMode('login')}>Sign in</button>
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .auth-screen {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .auth-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 24px;
    width: 100%;
    max-width: 380px;
    box-shadow: var(--shadow);
  }
  .auth-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }
  .auth-sub {
    margin: 4px 0 24px;
    color: var(--text-2);
    font-size: 14px;
  }
  .big { width: 100%; padding: 14px; font-size: 15px; }
  .error {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: var(--warning-soft);
    color: var(--warning);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }
  .switch {
    margin: 18px 0 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-2);
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    margin-left: 4px;
    min-height: 0;
    font-size: 13px;
    text-decoration: underline;
    cursor: pointer;
  }
  .link-btn:hover { background: none; }
  .success-block { text-align: left; }
  .block-title { font-size: 17px; margin: 0 0 10px; }
  .success-block p { color: var(--text-2); font-size: 14px; line-height: 1.5; margin: 0 0 16px; }
</style>
