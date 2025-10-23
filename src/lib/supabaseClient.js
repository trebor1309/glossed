// 📄 src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ Active la persistance de session locale + auto refresh
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    storage: localStorage, // force la sauvegarde dans localStorage
    autoRefreshToken: true, // régénère le token automatiquement
    detectSessionInUrl: true, // gère la redirection après login via URL
  },
});
