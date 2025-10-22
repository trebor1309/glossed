import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import UpgradeToProModal from "@/components/modals/UpgradeToProModal";

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export function UserProvider({ children, openUpgradeModal }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("glossed_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [proBadge, setProBadge] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // -----------------------------------------------------------
  // 🧠 Charger le profil complet d’un utilisateur
  // -----------------------------------------------------------
  const fetchUserProfile = async (supaUser) => {
    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", supaUser.id)
        .single();

      if (error) throw error;

      const fullUser = {
        id: supaUser.id,
        email: supaUser.email,
        roles: [profile.role],
        activeRole: profile.active_role,
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        business_name: profile.business_name || "",
        city: profile.city || "",
        address: profile.address || "",
        profile_photo: profile.profile_photo || "",
        professional_email: profile.professional_email || "",
        phone_number: profile.phone_number || "",
        language: profile.language || "en",
        currency: profile.currency || "EUR",
        theme: profile.theme || "light",
      };

      setUser(fullUser);
      localStorage.setItem("glossed_user", JSON.stringify(fullUser));
    } catch (err) {
      console.error("❌ fetchUserProfile failed:", err.message);
    }
  };

  // -----------------------------------------------------------
  // 🔄 Initialisation & écoute Supabase
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

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("🔄 Auth state changed:", _event);
      setSession(session);
      if (session?.user) {
        await fetchUserProfile(session.user);
      } else {
        setUser(null);
        localStorage.removeItem("glossed_user");
      }
    });

    return () => authListener.subscription.unsubscribe();
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
      window.location.href = "/"; // ✅ force reset sûr
    }
  };

  // -----------------------------------------------------------
  // 🔁 Changement de rôle
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;
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

    window.location.href = nextRole === "pro" ? "/prodashboard" : "/dashboard";
  };

  // -----------------------------------------------------------
  // ⚙️ Valeurs du contexte
  // -----------------------------------------------------------
  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";
  // -----------------------------------------------------------
  // 🔐 Connexion utilisateur
  // -----------------------------------------------------------
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    if (data.session?.user) {
      await fetchUserProfile(data.session.user);
      setSession(data.session);
    }
  };

  const value = {
    session,
    user,
    isAuthenticated,
    isPro,
    isClient,
    login,
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
