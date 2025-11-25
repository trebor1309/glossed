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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // -----------------------------------------------------------
  // 🧠 Charger le profil complet
  // -----------------------------------------------------------
  const fetchUserProfile = async (supaUser) => {
    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", supaUser.id)
        .single();

      if (error) throw error;

      const role = profile.active_role || profile.role || "client";

      const fullUser = {
        id: profile.id,
        email: profile.email,
        username: profile.username || null,
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        business_name: profile.business_name || "",
        address: profile.address || "",
        latitude: profile.latitude,
        longitude: profile.longitude,
        phone_number: profile.phone_number || "",
        profile_photo: profile.profile_photo || null,
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
    localStorage.removeItem("glossed_user");
    window.location.assign("/");
  };

  // -----------------------------------------------------------
  // 🔑 Login (email OU username)
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

    // username → récup email → login normal
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
  // 🆕 Signup : via signUp + UPDATE users
  // -----------------------------------------------------------
  const signup = async (email, password, role = "client", meta = {}) => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    const desiredUsername = meta.username?.trim().toLowerCase() || null;
    const firstName = meta.firstName?.trim() || null;
    const lastName = meta.lastName?.trim() || null;
    const businessName = meta.businessName?.trim() || null;

    // 1) Create Auth User
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
    });
    if (error) throw error;

    const authUser = data.user;
    if (!authUser) throw new Error("Signup failed: No auth user returned.");

    // 2) Update the profile created by the trigger
    const updates = {
      role,
      active_role: role,
      username: desiredUsername,
      first_name: firstName,
      last_name: lastName,
      business_name: businessName,
    };

    const { error: updateErr } = await supabase.from("users").update(updates).eq("id", authUser.id);

    if (updateErr) {
      console.error("❌ Profile update error:", updateErr.message);
      throw new Error("Signup succeeded, but profile update failed.");
    }

    // Session active ? → mettre à jour le contexte
    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
    }

    return { user: authUser };
  };

  // -----------------------------------------------------------
  // 🔁 Switch rôle
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;

    const nextRole = user.activeRole === "client" ? "pro" : "client";

    const { error } = await supabase
      .from("users")
      .update({ active_role: nextRole })
      .eq("id", user.id);

    if (error) {
      console.error("Error switchRole:", error.message);
      return;
    }

    const updated = { ...user, activeRole: nextRole };
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
    isAuthenticated: !!user,
    isPro: user?.activeRole === "pro",
    isClient: user?.activeRole === "client",
    proBadge,
    setProBadge,
    showUpgradeModal,
    setShowUpgradeModal,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
      {showUpgradeModal && <UpgradeToProModal onClose={() => setShowUpgradeModal(false)} />}
    </UserContext.Provider>
  );
}
