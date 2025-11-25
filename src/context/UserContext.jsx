// src/context/UserContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import UpgradeToProModal from "@/components/modals/UpgradeToProModal";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

export function UserProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proBadge, setProBadge] = useState(0);

  // IMPORTANT : le modal doit être complètement indépendant
  // Il ne sera ouvert QUE si l'on appelle setShowUpgradeModal(true)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // RESET modal quand user = null (évite le bug landing page)
  useEffect(() => {
    if (!user) setShowUpgradeModal(false);
  }, [user]);

  // -----------------------------------------------------------
  // 🧠 Charger (ou créer) le profil dans public.users
  // -----------------------------------------------------------
  const fetchUserProfile = async (supaUser) => {
    if (!supaUser) return;

    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", supaUser.id)
        .maybeSingle();

      let finalProfile = profile;

      // 🔄 Création automatique si trigger cassé
      if (!finalProfile) {
        const { data: inserted, error: insertError } = await supabase
          .from("users")
          .upsert(
            {
              id: supaUser.id,
              email: supaUser.email,
              role: "client",
              active_role: "client",
              theme: "light",
            },
            { onConflict: "id" }
          )
          .select("*")
          .single();

        if (insertError) {
          console.error("❌ upsert users failed:", insertError.message);
          return;
        }
        finalProfile = inserted;
      } else if (error) {
        console.error("❌ fetchUserProfile error:", error.message);
        return;
      }

      const role = finalProfile.active_role || finalProfile.role || "client";

      const fullUser = {
        id: finalProfile.id,
        email: finalProfile.email,
        username: finalProfile.username || null,
        first_name: finalProfile.first_name || "",
        last_name: finalProfile.last_name || "",
        business_name: finalProfile.business_name || "",
        address: finalProfile.address || "",
        latitude: finalProfile.latitude ?? null,
        longitude: finalProfile.longitude ?? null,
        phone_number: finalProfile.phone_number || "",
        profile_photo: finalProfile.profile_photo || null,
        role,
        activeRole: role,
        theme: finalProfile.theme || "light",
      };

      setUser(fullUser);
      localStorage.setItem("glossed_user", JSON.stringify(fullUser));
    } catch (err) {
      console.error("❌ fetchUserProfile failed:", err.message);
    }
  };

  // -----------------------------------------------------------
  // 🔄 Initialisation auth + session
  // -----------------------------------------------------------
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        setSession(data.session);
        await fetchUserProfile(data.session.user);
      } else {
        setUser(null);
      }

      setLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth change:", event);

      if (event === "TOKEN_REFRESHED" && session) {
        setSession(session);
        return;
      }

      if (session?.user) {
        setSession(session);
        await fetchUserProfile(session.user);
      } else {
        setUser(null);
        localStorage.removeItem("glossed_user");
        setShowUpgradeModal(false); // 🛑 sécurité absolue
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // -----------------------------------------------------------
  // 🚪 Logout
  // -----------------------------------------------------------
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setShowUpgradeModal(false); // 🛑 éviter apparition du modal après logout
    localStorage.removeItem("glossed_user");
    window.location.assign("/");
  };

  // -----------------------------------------------------------
  // 🔑 Login
  // -----------------------------------------------------------
  const login = async (identifier, password) => {
    const input = identifier.trim();

    if (input.includes("@")) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input,
        password,
      });
      if (error) throw error;

      if (data.session?.user) {
        setSession(data.session);
        await fetchUserProfile(data.session.user);
      }
      return;
    }

    const { data: lookup, error: lookupErr } = await supabase
      .from("users")
      .select("email")
      .eq("username", input.toLowerCase())
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!lookup?.email) throw new Error("No user with this username.");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: lookup.email,
      password,
    });

    if (error) throw error;

    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
    }
  };

  // -----------------------------------------------------------
  // 🆕 Signup (profil rempli ensuite dans onboarding)
  // -----------------------------------------------------------
  const signup = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) throw error;

    return { user: data.user };
  };

  // -----------------------------------------------------------
  // 🔁 Switch rôle
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;

    const nextRole = user.activeRole === "client" ? "pro" : "client";

    const { error } = await supabase
      .from("users")
      .update({ active_role: nextRole, role: nextRole })
      .eq("id", user.id);

    if (error) {
      console.error("Error switchRole:", error.message);
      return;
    }

    const updated = { ...user, activeRole: nextRole, role: nextRole };
    setUser(updated);
    localStorage.setItem("glossed_user", JSON.stringify(updated));

    window.location.assign(nextRole === "pro" ? "/prodashboard" : "/dashboard");
  };

  const value = {
    session,
    user,
    loading,
    login,
    signup,
    logout,
    switchRole,
    fetchUserProfile,

    isAuthenticated: !!user,
    isPro: user?.activeRole === "pro",
    isClient: user?.activeRole === "client",

    proBadge,
    setProBadge,

    // modal accessible manuellement UNIQUEMENT
    showUpgradeModal,
    setShowUpgradeModal,
  };

  return (
    <UserContext.Provider value={value}>
      {children}

      {/* 🛡️ Modal ne s'affiche QUE si user est authentifié */}
      {user && showUpgradeModal && <UpgradeToProModal onClose={() => setShowUpgradeModal(false)} />}
    </UserContext.Provider>
  );
}
