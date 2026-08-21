import { createClient } from "@supabase/supabase-js";

// Static export means there is no server, so this is the only Supabase client
// in the app. The key it uses is publishable and ships in the bundle; RLS is
// what actually protects the data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
      "Both live in .env, which is committed because both values are public.",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // There is no server to set a cookie, so the session lives in localStorage
    // and is rehydrated on load. This is what causes the brief unauthenticated
    // frame on first paint that the UI covers with a skeleton.
    persistSession: true,
    autoRefreshToken: true,
    // The magic link lands on /auth/callback/ carrying a code; this exchanges
    // it for a session automatically.
    detectSessionInUrl: true,
    // PKCE keeps the one-time code useless to anyone who intercepts the link,
    // since the verifier never leaves this browser. Worth having even on a
    // static site, and it is the flow Supabase recommends.
    flowType: "pkce",
  },
});
