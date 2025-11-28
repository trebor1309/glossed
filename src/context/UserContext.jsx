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

  // 🔒 Quand user disparaît → reset modal
  useEffect(() => {
    if (!user) setShowUpgradeModal(false);
  }, [user]);

  /* -----------------------------------------------------------
    FETCH USER PROFILE
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
          theme,
          onboarding_completed,
          stripe_account_id,
          stripe_account_ready,
          stripe_payouts_enabled
        `
        )
        .eq("id", supaUser.id)
        .maybeSingle();

      console.log("🔍 RAW SUPABASE PROFILE RESULT", { profile, error });

      if (!profile) {
        console.warn("⚠️ fetchUserProfile returned NULL — RLS issue?");
        return;
      }

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
        stripe_account_id: profile.stripe_account_id || null,
        payouts_enabled: profile.payouts_enabled || false,
        stripe_account_ready: profile.stripe_account_ready || false,
        stripe_details_submitted: profile.stripe_details_submitted || false,
        role: profile.role || "client",
        activeRole: profile.active_role || profile.role || "client",
        theme: profile.theme || "light",
        onboardingCompleted: profile.onboarding_completed === true,
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

      setLoading(false); // ⭐ LÀ SEULEMENT
    };

    init();

    /* -----------------------------------------------------------
      AUTH LISTENER
    ----------------------------------------------------------- */
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth change:", event);

      if (event === "TOKEN_REFRESHED" && session) {
        setSession(session);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        setLoading(true);
        setSession(session);
        await fetchUserProfile(session.user);
        setLoading(false);
        return;
      }

      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          setLoading(true);
          setSession(session);
          await fetchUserProfile(session.user);
          setLoading(false);
        }
        return;
      }

      if (event === "PASSWORD_RECOVERY" && session?.user) {
        setLoading(true);
        setSession(session);
        await fetchUserProfile(session.user);
        setLoading(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setSession(null);
        localStorage.removeItem("glossed_user");
        setShowUpgradeModal(false);
        return;
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
      setLoading(true);
      setSession(data.session);
      await fetchUserProfile(data.session.user);
      setLoading(false);
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

    if (user.role !== "pro") {
      setShowUpgradeModal(true);
      return;
    }

    const nextActive = user.activeRole === "client" ? "pro" : "client";

    const { error } = await supabase
      .from("users")
      .update({ active_role: nextActive })
      .eq("id", user.id);

    if (error) {
      console.error("switchRole error:", error.message);
      return;
    }

    const updated = { ...user, activeRole: nextActive };
    setUser(updated);
    localStorage.setItem("glossed_user", JSON.stringify(updated));

    window.location.assign(nextActive === "pro" ? "/prodashboard" : "/dashboard");
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
