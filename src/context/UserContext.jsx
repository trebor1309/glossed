// src/context/UserContext.jsx
import { useNavigate } from "react-router-dom";
import UpgradeToProModal from "@/components/modals/UpgradeToProModal";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const UserContext = createContext();

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children, openUpgradeModal }) {
  const [user, setUser] = useState(null);
  const [proBadge, setProBadge] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Charger la session Supabase au démarrage
  useEffect(() => {
    (async () => {
      console.log("🔍 Checking Supabase session...");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Session error:", error);
        console.log("Session data:", data);

        const sessionUser = data?.session?.user;
        if (sessionUser) {
          console.log("✅ Found session user:", sessionUser.email);
          await fetchUserProfile(sessionUser);
        } else {
          console.log("ℹ️ No active session");
        }
      } catch (err) {
        console.error("❌ Error in session check:", err);
      } finally {
        console.log("🏁 Setting loading to false");
        setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const supaUser = session?.user;
        if (supaUser) await fetchUserProfile(supaUser);
        else setUser(null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Récupère le profil utilisateur depuis Supabase
  async function fetchUserProfile(supaUser) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", supaUser.id)
      .single();

    if (error) {
      console.warn("Création profil manquant pour :", supaUser.email);
      await supabase.from("users").insert([
        {
          id: supaUser.id,
          email: supaUser.email,
          role: "client",
          active_role: "client",
        },
      ]);
      setUser({
        id: supaUser.id,
        email: supaUser.email,
        roles: ["client"],
        activeRole: "client",
      });
      return;
    }

    setUser({
      id: supaUser.id,
      email: supaUser.email,
      roles: [profile.role],
      activeRole: profile.active_role,
      name: profile.name || "",
      city: profile.city || "",
    });
  }

  // Inscription (client ou pro)
  const signup = async (email, password, role = "client", extra = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    const { user } = data;

    await supabase.from("users").insert([
      {
        id: user.id,
        email: user.email,
        role,
        active_role: role,
        name: extra.name || "",
        company: extra.businessName || "",
        city: extra.city || "",
      },
    ]);

    setUser({
      id: user.id,
      email: user.email,
      roles: [role],
      activeRole: role,
    });
    // ✅ redirection sans rechargement
    navigate(role === "pro" ? "/prodashboard" : "/dashboard", {
      replace: true,
    });
  };

  // Connexion (redirige automatiquement selon le rôle)
  const login = async (email, password) => {
    console.log("LOGIN START");

    // Étape 1 — Authentification via Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    const { user } = data;

    // Étape 2 — Récupération du profil complet
    await fetchUserProfile(user);

    // Étape 3 — Lecture du rôle actif depuis la table users
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("active_role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Erreur lors de la récupération du profil :", profileError);
      return;
    }

    console.log("LOGIN PROFILE:", profile);

    // Étape 4 — Synchronisation immédiate du contexte utilisateur
    setUser((prev) => ({
      ...prev,
      activeRole: profile?.active_role || "client",
    }));

    // Étape 5 — Redirection sans rechargement selon le rôle
    if (profile?.active_role === "pro") {
      navigate("/prodashboard", { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  // Déconnexion (sans rechargement complet)
  const logout = async () => {
    try {
      // Étape 1 — Déconnexion Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Étape 2 — Réinitialiser le contexte utilisateur
      setUser(null);

      // Étape 3 — Redirection douce vers la page d'accueil
      navigate("/", { replace: true });
      console.log("LOGOUT SUCCESS");
    } catch (err) {
      console.error("Erreur lors de la déconnexion :", err.message);
    }
  };

  // Changement de rôle (client ⇄ pro) sans rechargement
  const switchRole = async () => {
    if (!user) return;

    // Étape 1 — si le compte n’est pas pro, ouverture du modal d’upgrade
    if (user.roles[0] !== "pro" && user.activeRole !== "pro") {
      if (typeof openUpgradeModal === "function") {
        openUpgradeModal();
        return;
      }
    }

    try {
      // Étape 2 — Déterminer le rôle suivant
      const nextRole = user.activeRole === "client" ? "pro" : "client";

      // Étape 3 — Mettre à jour la base Supabase
      const { error } = await supabase
        .from("users")
        .update({ active_role: nextRole })
        .eq("id", user.id);
      if (error) throw error;

      // Étape 4 — Mettre à jour le contexte local
      setUser((prev) => ({ ...prev, activeRole: nextRole }));

      // Étape 5 — Navigation instantanée sans reload
      navigate(nextRole === "pro" ? "/prodashboard" : "/dashboard", {
        replace: true,
      });

      console.log("ROLE SWITCHED:", nextRole);
    } catch (err) {
      console.error("Erreur lors du changement de rôle :", err.message);
    }
  };

  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <UserContext.Provider
      value={{
        user,
        signup,
        login,
        logout,
        switchRole,
        isAuthenticated,
        isPro,
        isClient,
        proBadge,
        setProBadge,
        loading,
        showUpgradeModal,
        setShowUpgradeModal, // ✅ ajout manquant
      }}
    >
      {children}
      {showUpgradeModal && (
        <UpgradeToProModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </UserContext.Provider>
  );
}

export default UserProvider;
