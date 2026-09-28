// ===========================================================================
// Maison - the one place the browser talks to Supabase.
//
// Only PUBLIC values appear here. The "anon" key is designed to be shipped
// to browsers; it is safe because Row Level Security in the database only
// ever lets you reach your own rows.
//
// The Anthropic API key is NOT here, and must never be. It lives as a
// server-side secret on the Edge Functions.
// ===========================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

/** False when the .env file has not been filled in yet. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Deliberately a warning, not a crash, so the app still renders and can
  // explain itself instead of showing a blank white page.
  console.warn(
    '[Maison] Supabase is not configured. Copy .env.example to .env and ' +
      'fill in REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Name of the private storage bucket that holds bag photos. */
export const PHOTO_BUCKET = 'bag-photos';
