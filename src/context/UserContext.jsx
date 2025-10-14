// src/context/UserContext.jsx
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

  // Charger la session Supabase au démarrage
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (sessionUser) await fetchUserProfile(sessionUser);
      setLoading(false);
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
  };

  // Connexion (redirige automatiquement selon le rôle)
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    const { user } = data;
    await fetchUserProfile(user);

    // Récupère le profil complet pour déterminer le rôle actif
    const { data: profile } = await supabase
      .from("users")
      .select("active_role")
      .eq("id", user.id)
      .single();

    if (profile?.active_role === "pro") {
      window.location.href = "/prodashboard";
    } else {
      window.location.href = "/dashboard";
    }
  };

  // Déconnexion
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  };

  // Basculement entre rôles (et déclenchement modal)
  const switchRole = async () => {
    if (!user) return;

    // si le compte n'est pas pro → ouverture du modal d’upgrade
    if (user.roles[0] !== "pro" && user.activeRole !== "pro") {
      if (typeof openUpgradeModal === "function") openUpgradeModal();
      return;
    }

    const nextRole = user.activeRole === "client" ? "pro" : "client";

    await supabase
      .from("users")
      .update({ active_role: nextRole })
      .eq("id", user.id);

    setUser({ ...user, activeRole: nextRole });
    window.location.href = nextRole === "pro" ? "/prodashboard" : "/dashboard";
  };

  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";

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
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
