// Single shared Supabase client for the whole app.
//
// Reads connection details from environment variables at build time. These need to be set
// in Cloudflare Pages: PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.
//
// The publishable key (formerly "anon key") is safe to expose in browser code because
// row-level security policies in the database enforce who can read/write what.
// Never expose the secret/service_role key here.

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // keep coaches logged in across browser sessions
    autoRefreshToken: true,      // refresh access token automatically
    detectSessionInUrl: true     // needed for any email-confirmation-style redirects later
  }
});
