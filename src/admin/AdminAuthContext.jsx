import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminSupabase } from "./adminSupabase";

const AdminAuthContext = createContext(null);

function clientContext() {
  return {
    hostname: window.location.hostname,
    path: window.location.pathname,
    user_agent: navigator.userAgent.slice(0, 512),
  };
}

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [access, setAccess] = useState(null);
  const [factors, setFactors] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFactors = useCallback(async () => {
    const { data, error: factorError } = await adminSupabase.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const verified = [...(data?.totp || []), ...(data?.phone || [])].filter(
      (factor) => factor.status === "verified"
    );
    setFactors(verified);
    return verified;
  }, []);

  const loadAccess = useCallback(async () => {
    const { data, error: accessError } = await adminSupabase.rpc("get_my_admin_access", {
      p_client_context: clientContext(),
    });
    if (accessError) throw accessError;
    setAccess(data);
    if (!data?.account_exists) {
      await adminSupabase.auth.signOut({ scope: "local" });
      throw new Error("Ce compte n’est pas autorisé à accéder à l’administration Glossed.");
    }
    if (!data.authorized) await loadFactors();
    return data;
  }, [loadFactors]);

  const hydrate = useCallback(
    async (nextSession) => {
      setSession(nextSession || null);
      setAccess(null);
      setEnrollment(null);
      if (!nextSession) {
        setFactors([]);
        setLoading(false);
        return;
      }
      setError(null);
      try {
        await loadAccess();
      } catch (hydrateError) {
        setError(hydrateError.message);
      } finally {
        setLoading(false);
      }
    },
    [loadAccess]
  );

  useEffect(() => {
    let active = true;
    adminSupabase.auth.getSession().then(({ data }) => {
      if (active) hydrate(data.session);
    });
    const { data: listener } = adminSupabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        return;
      }
      if (["SIGNED_IN", "SIGNED_OUT", "INITIAL_SESSION", "MFA_CHALLENGE_VERIFIED"].includes(event)) {
        queueMicrotask(() => hydrate(nextSession));
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [hydrate]);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    const { data, error: loginError } = await adminSupabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) {
      setLoading(false);
      throw loginError;
    }
    await hydrate(data.session);
  };

  const beginMfaEnrollment = async () => {
    setError(null);
    const { data, error: enrollError } = await adminSupabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Glossed Admin",
    });
    if (enrollError) throw enrollError;
    const nextEnrollment = {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
    setEnrollment(nextEnrollment);
    return nextEnrollment;
  };

  const verifyMfa = async (code, factorId = null) => {
    setLoading(true);
    setError(null);
    try {
      const selectedFactor = factorId || enrollment?.factorId || factors[0]?.id;
      if (!selectedFactor) throw new Error("Aucun facteur MFA n’est disponible.");
      const { error: verifyError } = await adminSupabase.auth.mfa.challengeAndVerify({
        factorId: selectedFactor,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      const { data, error: refreshError } = await adminSupabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      setEnrollment(null);
      await hydrate(data.session);
    } finally {
      setLoading(false);
    }
  };

  const refreshAccess = async () => {
    setLoading(true);
    try {
      return await loadAccess();
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setError(null);
    await adminSupabase.rpc("record_admin_logout");
    await adminSupabase.auth.signOut();
    setSession(null);
    setAccess(null);
  };

  const permissions = access?.permissions || [];
  const value = {
    session,
    access,
    permissions,
    factors,
    enrollment,
    loading,
    error,
    login,
    logout,
    beginMfaEnrollment,
    verifyMfa,
    refreshAccess,
    hasPermission: (permission) => permissions.includes(permission),
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return context;
}
