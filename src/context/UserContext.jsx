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
  // 🧠 Charger le profil complet (table public.users)
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
        id: supaUser.id,
        email: supaUser.email,
        username: profile.username || null,
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        business_name: profile.business_name || "",
        city: profile.city || "",
        address: profile.address || "",
        professional_email: profile.professional_email || "",
        phone_number: profile.phone_number || "",
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
        role,
        activeRole: role,
        theme: profile.theme || "light",
        // language / currency supprimés ici, on ne s'appuie plus dessus
      };

      setUser(fullUser);
      localStorage.setItem("glossed_user", JSON.stringify(fullUser));
    } catch (err) {
      console.error("❌ fetchUserProfile failed:", err.message);
    }
  };

  // -----------------------------------------------------------
  // 🔄 Initialisation de la session
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
      console.log("🔄 Auth state changed:", event);

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

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // -----------------------------------------------------------
  // 🚪 Déconnexion
  // -----------------------------------------------------------
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Erreur logout:", err.message);
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem("glossed_user");
      window.location.assign("/");
    }
  };

  // -----------------------------------------------------------
  // 🔁 Switch de rôle
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;

    if (user.activeRole === "client") {
      const { data: profile } = await supabase
        .from("users")
        .select("business_name, professional_email, stripe_account_id")
        .eq("id", user.id)
        .single();

      const hasProData =
        profile?.business_name || profile?.professional_email || profile?.stripe_account_id;

      if (!hasProData) {
        setShowUpgradeModal(true);
        return;
      }
    }

    const nextRole = user.activeRole === "client" ? "pro" : "client";

    const { error } = await supabase
      .from("users")
      .update({ active_role: nextRole })
      .eq("id", user.id);

    if (error) {
      console.error("Erreur switchRole:", error.message);
      return;
    }

    const updated = { ...user, activeRole: nextRole };
    setUser(updated);
    localStorage.setItem("glossed_user", JSON.stringify(updated));

    window.location.assign(nextRole === "pro" ? "/prodashboard" : "/dashboard");
  };

  // -----------------------------------------------------------
  // 🔑 Login : email OU username
  // -----------------------------------------------------------
  const login = async (identifier, password) => {
    const trimmed = identifier.trim();

    // 1) On tente directement comme email
    if (trimmed.includes("@")) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });

      if (error) throw error;

      if (data.session?.user) {
        setSession(data.session);
        await fetchUserProfile(data.session.user);
      }
      return;
    }

    // 2) Sinon, on le traite comme username (en minuscules)
    const username = trimmed.toLowerCase();

    const { data: row, error: userError } = await supabase
      .from("users")
      .select("email")
      .eq("username", username)
      .maybeSingle();

    if (userError) {
      console.error("❌ login username lookup error:", userError.message);
      throw new Error("Unable to login with this username.");
    }

    if (!row?.email) {
      throw new Error("No user found with this username.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: row.email,
      password,
    });

    if (error) throw error;

    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
    }
  };

  // -----------------------------------------------------------
  // 🆕 Signup : email + password + rôle + meta (username, prénom, nom, business)
  // -----------------------------------------------------------
  const signup = async (email, password, role = "client", meta = {}) => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const username =
      meta.username && typeof meta.username === "string"
        ? meta.username.trim().toLowerCase()
        : null;

    const firstName =
      meta.firstName && typeof meta.firstName === "string" ? meta.firstName.trim() : null;
    const lastName =
      meta.lastName && typeof meta.lastName === "string" ? meta.lastName.trim() : null;
    const businessName =
      meta.businessName && typeof meta.businessName === "string" ? meta.businessName.trim() : null;

    // 1) Création dans auth
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error) throw error;

    const authUser = data.user;
    if (!authUser) {
      throw new Error("Signup failed: auth user not created.");
    }

    // 2) Création du profil "users"
    const insertPayload = {
      id: authUser.id,
      email: cleanEmail,
      role,
      active_role: role,
      username,
      first_name: firstName,
      last_name: lastName,
      business_name: businessName,
      theme: "light",
    };

    const { error: profileError } = await supabase.from("users").insert(insertPayload);

    if (profileError) {
      console.error("❌ Error creating user profile:", profileError.message);
      throw new Error("Signup succeeded, but failed to create profile.");
    }

    // Optionnel : on met à jour le contexte si une session est déjà ouverte
    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
    }

    return { user: authUser };
  };

  // -----------------------------------------------------------
  // ⚙️ Helpers
  // -----------------------------------------------------------
  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";

  const value = {
    session,
    user,
    isAuthenticated,
    isPro,
    isClient,
    login,
    signup,
    logout,
    switchRole,
    loading,
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
