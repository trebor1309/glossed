// src/context/UserContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

export function UserProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 🔒 Quand user disparaît → reset modal
  useEffect(() => {
    if (!user) setShowUpgradeModal(false);
  }, [user]);

  /* -----------------------------------------------------------
    FETCH USER PROFILE
  ----------------------------------------------------------- */
  const fetchUserProfile = async (supaUser) => {
    if (!supaUser) return null;

    try {
      setProfileError(null);
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
          profile_photo,
          business_name,
          company_number,
          vat_number,
          professional_email,
          business_address,
          active_role,
          role,
          theme,
          onboarding_completed,
          stripe_account_id,
          stripe_account_ready,
          payouts_enabled,
          verification_status,
          verification_submitted_at,
          verification_rejection_reason,
          verified_at
        `
        )
        .eq("id", supaUser.id)
        .maybeSingle();

      if (error) throw error;

      if (!profile) {
        throw new Error("Your account profile is unavailable. Please retry or sign out.");
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
        profile_photo: profile.profile_photo || null,
        business_name: profile.business_name || "",
        company_number: profile.company_number || "",
        vat_number: profile.vat_number || "",
        professional_email: profile.professional_email || "",
        business_address: profile.business_address || "",
        stripe_account_id: profile.stripe_account_id || null,
        payouts_enabled: profile.payouts_enabled || false,
        stripe_account_ready: profile.stripe_account_ready || false,
        verification_status: profile.verification_status || "unverified",
        verification_submitted_at: profile.verification_submitted_at || null,
        verification_rejection_reason: profile.verification_rejection_reason || null,
        verified_at: profile.verified_at || null,
        role: profile.role || "client",
        activeRole: profile.active_role || profile.role || "client",
        theme: profile.theme || "light",
        onboardingCompleted: profile.onboarding_completed === true,
      };

      setUser(fullUser);
      localStorage.setItem("glossed_user", JSON.stringify(fullUser));
      return fullUser;
    } catch (err) {
      console.error("❌ fetchUserProfile failed:", err.message);
      setUser(null);
      setProfileError(err.message || "Unable to load your account profile.");
      return null;
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
        setProfileError(null);
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
    setProfileError(null);
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
  const signup = async (email, password, options = {}) => {
    const normalizedEmail = email.trim();
    const requestedRole = options.role === "pro" ? "pro" : "client";
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/email-verified`,
        data: {
          requested_role: requestedRole,
          username: options.username?.trim().toLowerCase() || null,
          business_name: options.businessName?.trim() || null,
        },
      },
    });

    if (error) throw error;

    localStorage.setItem("pending_signup_email", normalizedEmail);
    return { user: data.user, session: data.session };
  };

  const retryProfile = async () => {
    if (!session?.user) return null;
    setLoading(true);
    const result = await fetchUserProfile(session.user);
    setLoading(false);
    return result;
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
    profileError,
    login,
    signup,
    logout,
    switchRole,
    fetchUserProfile,
    retryProfile,
    isAuthenticated: !!user,
    isPro: user?.activeRole === "pro",
    isClient: user?.activeRole === "client",
    showUpgradeModal,
    setShowUpgradeModal,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
