import { createContext, useContext, useState, useEffect } from "react";

const UserContext = createContext();

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);

  // 🔁 Charger le user depuis localStorage au démarrage
  useEffect(() => {
    const storedUser = localStorage.getItem("glossed_user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("glossed_user");
      }
    }
  }, []);

  // 💾 Sauvegarde automatique
  useEffect(() => {
    if (user) localStorage.setItem("glossed_user", JSON.stringify(user));
    else localStorage.removeItem("glossed_user");
  }, [user]);

  // ✅ Connexion simulée (création d’un compte)
  const login = (email = "guest@glossed.app", type = "client") => {
    const baseUser = {
      email,
      roles: type === "pro" ? ["pro"] : ["client"],
      activeRole: type,
    };
    setUser(baseUser);

    // Redirection immédiate selon le type
    window.location.href = type === "pro" ? "/prodashboard" : "/dashboard";
  };

  // ✅ Déconnexion complète
  const logout = () => {
    setUser(null);
    localStorage.removeItem("glossed_user");
    window.location.href = "/";
  };

  // 🔁 Changer de rôle actif avec redirection automatique
  const switchRole = () => {
    if (!user?.roles?.length) return;

    const nextRole = user.activeRole === "client" ? "pro" : "client";

    // Si l’utilisateur n’a pas encore l’autre rôle, on l’ajoute
    const updatedRoles = user.roles.includes(nextRole)
      ? user.roles
      : [...user.roles, nextRole];

    const updatedUser = { ...user, roles: updatedRoles, activeRole: nextRole };
    setUser(updatedUser);

    // 🚀 Redirection automatique
    if (nextRole === "pro") {
      window.location.href = "/prodashboard";
    } else {
      window.location.href = "/dashboard";
    }
  };

  // 🧠 Indicateurs utiles
  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        switchRole,
        isAuthenticated,
        isPro,
        isClient,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
