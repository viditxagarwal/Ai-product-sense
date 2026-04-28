import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // During build/SSG, env vars may not be available.
    // Return a dummy client that won't be used at build time.
    // At runtime in the browser, the env vars will be injected.
    return createBrowserClient(
      "https://placeholder.supabase.co",
      "placeholder-key"
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
