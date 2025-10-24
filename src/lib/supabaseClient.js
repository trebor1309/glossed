// 📄 src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // ✅ force une persistance claire et indépendante par environnement
    persistSession: true,
    storage: localStorage,
    storageKey: "glossed.auth", // évite les collisions entre localhost / vercel
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce", // flow moderne + plus fiable
  },
});
