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
  const [proBadge, setProBadge] = useState(0);

  /* ============================================================
     🔍 CHARGER LE PROFIL PUBLIC.USERS COMPLET
  ============================================================ */
  const fetchUserProfile = async (authUser) => {
    const { data, error } = await supabase.from("users").select("*").eq("id", authUser.id).single();

    if (error) {
      console.error("❌ fetchUserProfile failed:", error);
      return;
    }

    const role = data.active_role || data.role || "client";

    const fullUser = {
      id: authUser.id,
      email: authUser.email,
      username: data.username || null,
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      business_name: data.business_name || "",
      city: data.city || "",
      address: data.address || "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      theme: data.theme || "light",
      phone_number: data.phone_number || "",
      professional_email: data.professional_email || "",
      activeRole: role,
      role,
    };

    setUser(fullUser);
    localStorage.setItem("glossed_user", JSON.stringify(fullUser));
  };

  /* ============================================================
     🔄 INIT SESSION + LISTENER
  ============================================================ */
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        setSession(data.session);
        await fetchUserProfile(data.session.user);
      }
      setLoading(false);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setSession(session);
        await fetchUserProfile(session.user);
      } else {
        setUser(null);
        localStorage.removeItem("glossed_user");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  /* ============================================================
     🚪 LOGOUT
  ============================================================ */
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    window.location.assign("/");
  };

  /* ============================================================
     🔁 SWITCH ROLE
  ============================================================ */
  const switchRole = async () => {
    if (!user) return;

    const newRole = user.activeRole === "client" ? "pro" : "client";

    const { error } = await supabase
      .from("users")
      .update({ active_role: newRole })
      .eq("id", user.id);

    if (error) {
      console.error("❌ switchRole:", error);
      return;
    }

    const updated = { ...user, activeRole: newRole };
    setUser(updated);
    localStorage.setItem("glossed_user", JSON.stringify(updated));

    window.location.assign(newRole === "pro" ? "/prodashboard" : "/dashboard");
  };

  /* ============================================================
     🔐 LOGIN : email OU username
  ============================================================ */
  const login = async (identifier, password) => {
    const input = identifier.trim();

    // LOGIN EMAIL
    if (input.includes("@")) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input,
        password,
      });
      if (error) throw error;
      return;
    }

    // LOGIN USERNAME
    const username = input.toLowerCase();
    const { data: row } = await supabase
      .from("users")
      .select("email")
      .eq("username", username)
      .maybeSingle();

    if (!row?.email) throw new Error("Username not found.");

    const { error } = await supabase.auth.signInWithPassword({
      email: row.email,
      password,
    });

    if (error) throw error;
  };

  /* ============================================================
     🆕 SIGNUP : SANS INSERT, AVEC METADATA
  ============================================================ */
  const signup = async (email, password, role = "client", meta = {}) => {
    const username = meta.username ? meta.username.trim().toLowerCase() : null;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          first_name: meta.firstName || null,
          last_name: meta.lastName || null,
          business_name: meta.businessName || null,
          role,
          active_role: role,
          theme: "light",
        },
      },
    });

    if (error) throw error;

    // Si une session existe déjà (email non confirmé), on met à jour le profil
    if (data.user) {
      await fetchUserProfile(data.user);
    }

    return data.user;
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
