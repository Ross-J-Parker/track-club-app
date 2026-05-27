# Track Club

A timing and progression tracker for athletics clubs. Built with SvelteKit, deployed as a PWA.

This is the **single-device prototype** stage — data lives in your browser's local storage, so it doesn't sync between devices yet. A Supabase migration is planned next.

## What it does

- Time track races (60m → 3000m) with per-lap splits and DNF handling
- Record field events (jumps and throws) with best-of-3 attempts
- Track PBs, club records, and per-group records (U11, Sprints, Middle distance, Jumps, Throws)
- Per-athlete progression charts
- Custom Sub-X challenges with first-time / maintained logic
- Installable as a PWA on phones and tablets, works offline

## Running locally

You need Node.js 20 or higher. If you don't have it: <https://nodejs.org/> — pick the LTS version.

```bash
npm install
npm run dev
```

The app will be running at `http://localhost:5173`. Open it in your phone's browser (on the same wifi) by replacing `localhost` with your computer's local IP — useful for trackside testing before deploying.

## Deploying to Netlify

The recommended path is:

1. **Push this folder to a new GitHub repo.**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   ```
   Then create a new repo on GitHub and follow their "push existing repo" instructions.

2. **Sign up at https://netlify.com** (use your GitHub account for the easiest path).

3. **In Netlify, click "Add new site" → "Import an existing project" → "GitHub"**, then pick this repo.
   The build settings should auto-detect from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `build`
   - Node version: 20

4. **Click "Deploy".** First build takes ~2 minutes. Netlify gives you a `something.netlify.app` URL — that's your live app.

5. **Optional: rename the site.** In Site settings → Site information → Change site name.

Every time you `git push` to the main branch, Netlify redeploys automatically.

## Installing on a phone (PWA)

Once deployed (or running on localhost), open the URL in Chrome on Android or Safari on iOS.

- **iOS:** Share → Add to Home Screen
- **Android:** Menu → Add to Home Screen / Install app

You'll get a proper full-screen app with its own icon, no browser chrome.

## Project structure

```
src/
  routes/              # Pages (time, athletes, history, records, badges)
  lib/
    storage.js         # Storage abstraction — swap to Supabase here
    events.js          # Event catalogue, groups, helpers
    badges.js          # Pure badge-checking logic
  app.css              # Global styles
static/
  icon-192.png         # PWA icons
  icon-512.png
```

## What's next

When you're ready to multi-user, the storage layer in `src/lib/storage.js` is the only thing that needs to change. Same function signatures, different implementation (Supabase client instead of localStorage).
