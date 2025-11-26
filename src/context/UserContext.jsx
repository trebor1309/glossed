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

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 🔒 Quand user disparaît → on reset le modal
  useEffect(() => {
    if (!user) setShowUpgradeModal(false);
  }, [user]);

  /* -----------------------------------------------------------
    LOAD USER PROFILE (SELECT LIGHT → no JSON columns)
  ----------------------------------------------------------- */
  const fetchUserProfile = async (supaUser) => {
    if (!supaUser) return;

    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select(
          `
          id,
          email,
          username,
          first_name,
          last_name,
          phone_number,
          address,
          latitude,
          longitude,
          active_role,
          role,
          theme
        `
        )
        .eq("id", supaUser.id)
        .maybeSingle();

      console.log("🔍 RAW SUPABASE PROFILE RESULT", { profile, error });

      if (!profile) {
        console.warn("⚠️ fetchUserProfile returned NULL — RLS issue?");
        return;
      }

      const role = profile.active_role || profile.role || "client";

      const fullUser = {
        id: profile.id,
        email: profile.email,
        username: profile.username || null,
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone_number: profile.phone_number || "",
        address: profile.address || "",
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
        role,
        activeRole: role,
        theme: profile.theme || "light",
      };

      setUser(fullUser);
      localStorage.setItem("glossed_user", JSON.stringify(fullUser));
    } catch (err) {
      console.error("❌ fetchUserProfile failed:", err.message);
    }
  };

  /* -----------------------------------------------------------
    INIT
  ----------------------------------------------------------- */
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
        setShowUpgradeModal(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  /* -----------------------------------------------------------
    LOGOUT
  ----------------------------------------------------------- */
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    localStorage.removeItem("glossed_user");
    setShowUpgradeModal(false);
    window.location.assign("/");
  };

  /* -----------------------------------------------------------
    LOGIN
  ----------------------------------------------------------- */
  const login = async (identifier, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: identifier.trim(),
      password: password.trim(),
    });

    if (error) throw error;

    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
    }
  };

  /* -----------------------------------------------------------
    SIGNUP
  ----------------------------------------------------------- */
  const signup = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) throw error;

    return { user: data.user };
  };

  /* -----------------------------------------------------------
    SWITCH ROLE
  ----------------------------------------------------------- */
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

    showUpgradeModal,
    setShowUpgradeModal,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
      {user && showUpgradeModal && <UpgradeToProModal onClose={() => setShowUpgradeModal(false)} />}
    </UserContext.Provider>
  );
}
