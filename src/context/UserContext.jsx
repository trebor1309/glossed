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
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [proBadge, setProBadge] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const navigate = useNavigate();

  // -----------------------------------------------------------
  // 🧩 Load Supabase session on startup
  // -----------------------------------------------------------
  useEffect(() => {
    console.log("🔍 Checking Supabase session...");
    setLoading(true);

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("Error getting session:", error);

      setSession(data.session);
      if (data.session?.user) {
        console.log("✅ Restored session user:", data.session.user.email);
        // 🧠 Reload full user profile (roles, activeRole, etc.)
        await fetchUserProfile(data.session.user);
      } else {
        console.log("ℹ️ No active session found");
        setUser(null);
      }

      setLoading(false);
    };

    restoreSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("🔄 Auth state changed:", _event);
        setSession(session);
        if (session?.user) {
          await fetchUserProfile(session.user);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // -----------------------------------------------------------
  // 🧠 Fetch user profile from Supabase
  // -----------------------------------------------------------
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

  // -----------------------------------------------------------
  // ✍️ Signup (client or pro)
  // -----------------------------------------------------------
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

    navigate(role === "pro" ? "/prodashboard" : "/dashboard", {
      replace: true,
    });
  };

  // -----------------------------------------------------------
  // 🔐 Login (redirect by role)
  // -----------------------------------------------------------
  const login = async (email, password) => {
    console.log("LOGIN START");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    const { user } = data;

    await fetchUserProfile(user);

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

    setUser((prev) => ({
      ...prev,
      activeRole: profile?.active_role || "client",
    }));

    navigate(profile?.active_role === "pro" ? "/prodashboard" : "/dashboard", {
      replace: true,
    });
  };

  // -----------------------------------------------------------
  // 🚪 Logout
  // -----------------------------------------------------------
  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      navigate("/", { replace: true });
      console.log("LOGOUT SUCCESS");
    } catch (err) {
      console.error("Erreur lors de la déconnexion :", err.message);
    }
  };

  // -----------------------------------------------------------
  // 🔁 Switch role (client ⇄ pro)
  // -----------------------------------------------------------
  const switchRole = async () => {
    if (!user) return;

    const isAlreadyPro =
      (user.roles && user.roles.includes("pro")) || user.activeRole === "pro";

    if (!isAlreadyPro) {
      if (typeof openUpgradeModal === "function") {
        openUpgradeModal();
        return;
      }
    }

    try {
      const nextRole = user.activeRole === "client" ? "pro" : "client";

      const { error } = await supabase
        .from("users")
        .update({ active_role: nextRole })
        .eq("id", user.id);
      if (error) throw error;

      setUser((prev) => ({ ...prev, activeRole: nextRole }));

      navigate(nextRole === "pro" ? "/prodashboard" : "/dashboard", {
        replace: true,
      });

      console.log("ROLE SWITCHED:", nextRole);
    } catch (err) {
      console.error("Erreur lors du changement de rôle :", err.message);
    }
  };

  // -----------------------------------------------------------
  // ⚙️ Context values
  // -----------------------------------------------------------
  const isAuthenticated = !!user;
  const isPro = user?.activeRole === "pro";
  const isClient = user?.activeRole === "client";

  // -----------------------------------------------------------
  // ⏳ Loading state (render nothing until session ready)
  // -----------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-600">
        Loading user session...
      </div>
    );
  }

  // -----------------------------------------------------------
  // 🧭 Provider
  // -----------------------------------------------------------
  return (
    <UserContext.Provider
      value={{
        session,
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
        setShowUpgradeModal,
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
