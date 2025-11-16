// 📄 src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    storage: localStorage,
    storageKey: "glossed.auth",
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

// ---------------------------------------------------------
// 🔍 DEBUG : Expose supabase to window (browser only)
// ---------------------------------------------------------
if (typeof window !== "undefined") {
  window.supabase = supabase;
  console.log("🔗 Supabase client attached to window");
}
