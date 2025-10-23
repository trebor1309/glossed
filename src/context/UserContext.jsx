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
        id: supaUser.id,
        email: supaUser.email,
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        business_name: profile.business_name || "",
        city: profile.city || "",
        address: profile.address || "",
        professional_email: profile.professional_email || "",
        phone_number: profile.phone_number || "",
        role,
        activeRole: role,
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
  // 🔄 Initialisation de la session (cross-browser)
  // -----------------------------------------------------------
  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();

      if (error) console.error("❌ getSession error:", error);

      if (data?.session) {
        setSession(data.session);
        await fetchUserProfile(data.session.user);
      } else {
        // 🔹 On tente de restaurer depuis localStorage
        const stored = localStorage.getItem("glossed_user");
        if (stored) setUser(JSON.parse(stored));
      }
      setLoading(false);
    };

    initSession();

    // ✅ Écoute en temps réel des changements de session
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("🔄 Auth state changed:", _event);
      if (session) {
        setSession(session);
        await fetchUserProfile(session.user);
      } else {
        setSession(null);
        setUser(null);
        localStorage.removeItem("glossed_user");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
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
      window.location.assign("/"); // ⚙️ évite l’historique et force le reload complet
    }
  };

  // -----------------------------------------------------------
  // 🔁 Switch de rôle
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;

    // 🔹 Si c’est un client qui veut devenir pro
    if (user.activeRole === "client") {
      // Vérifie si le profil pro est déjà configuré
      const { data: profile } = await supabase
        .from("users")
        .select("business_name, professional_email, stripe_account_id")
        .eq("id", user.id)
        .single();

      const hasProData =
        profile?.business_name || profile?.professional_email || profile?.stripe_account_id;

      if (!hasProData) {
        // 💡 Pas encore de profil pro → ouvrir le modal d’upgrade
        setShowUpgradeModal(true);
        return;
      }
    }

    // 🔁 Sinon, on fait le switch normal
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
  // ⚙️ Helpers
  // -----------------------------------------------------------
  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.session?.user) {
      setSession(data.session);
      await fetchUserProfile(data.session.user);
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
