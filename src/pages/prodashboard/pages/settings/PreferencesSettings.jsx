import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

// Petites listes “safe” côté UI
const LANGS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "nl", label: "Nederlands" },
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const CURRENCIES = [
  { value: "EUR", label: "EUR (€)" },
  { value: "USD", label: "USD ($)" },
  { value: "GBP", label: "GBP (£)" },
];

export default function PreferencesSettings() {
  const { user, session } = useUser();

  // -------- UI State
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // -------- Preferences form (toujours “controlled”)
  const [prefs, setPrefs] = useState({
    preferred_language: "en",
    theme: "light",
    notifications_email: true,
    notifications_push: true,
    currency: "EUR",
    // on affiche aussi l'email “auth” pour info
    email_current: "",
  });

  // -------- Account Security forms
  const [emailForm, setEmailForm] = useState({
    new_email: "",
    confirm_email: "",
  });

  const [pwdForm, setPwdForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });

  // ------- Load from Supabase (users + auth email)
  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(
          "preferred_language, theme, notifications_email, notifications_push, currency, email"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ preferences load error:", error.message);
      }

      // Patch anti-null + cohérence avec auth email
      const safe = Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [
          k,
          v === null || v === undefined
            ? k === "notifications_email" || k === "notifications_push"
              ? false
              : ""
            : v,
        ])
      );

      setPrefs((prev) => ({
        ...prev,
        preferred_language: safe.preferred_language || "en",
        theme: safe.theme || "light",
        notifications_email: !!safe.notifications_email,
        notifications_push: !!safe.notifications_push,
        currency: safe.currency || "EUR",
        email_current: session?.user?.email || safe.email || "",
      }));

      setLoading(false);
    };

    load();
  }, [user?.id, session?.user?.email]);

  // ------- Helpers
  const onPrefChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPrefs((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // ------- Save Preferences (users table)
  const savePreferences = async () => {
    if (!user?.id) return;
    setSavingPrefs(true);

    const updates = {
      preferred_language: prefs.preferred_language || "en",
      theme: prefs.theme || "light",
      notifications_email: !!prefs.notifications_email,
      notifications_push: !!prefs.notifications_push,
      currency: prefs.currency || "EUR",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(updates).eq("id", user.id);

    setSavingPrefs(false);

    if (error) {
      setToast({ type: "error", message: "❌ Error saving preferences." });
    } else {
      setToast({ type: "success", message: "✅ Preferences saved!" });
    }
  };

  // ------- Change login email (auth + users.email)
  const changeEmail = async () => {
    if (!user?.id) return;
    if (!emailForm.new_email || !emailForm.confirm_email) {
      return setToast({ type: "error", message: "Please fill both email fields." });
    }
    if (emailForm.new_email !== emailForm.confirm_email) {
      return setToast({ type: "error", message: "New email and confirmation do not match." });
    }
    if (emailForm.new_email === prefs.email_current) {
      return setToast({ type: "error", message: "This is already your current email." });
    }

    setSavingEmail(true);

    // 1) update auth email
    const { error: authErr } = await supabase.auth.updateUser({
      email: emailForm.new_email,
    });

    if (authErr) {
      setSavingEmail(false);
      return setToast({ type: "error", message: `Auth email update failed: ${authErr.message}` });
    }

    // 2) mirror into users.email for convenience (facultatif mais propre)
    const { error: userErr } = await supabase
      .from("users")
      .update({ email: emailForm.new_email, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    setSavingEmail(false);

    if (userErr) {
      return setToast({
        type: "error",
        message: `Email saved in profile with a warning: ${userErr.message}`,
      });
    }

    // refresh UI
    setPrefs((p) => ({ ...p, email_current: emailForm.new_email }));
    setEmailForm({ new_email: "", confirm_email: "" });
    setToast({
      type: "success",
      message:
        "✅ Login email updated. You may need to confirm this change via the verification link.",
    });
  };

  // ------- Change password (verify old first)
  const changePassword = async () => {
    if (!user?.id) return;

    const { old_password, new_password, confirm_password } = pwdForm;

    if (!old_password || !new_password || !confirm_password) {
      return setToast({ type: "error", message: "Please fill all password fields." });
    }
    if (new_password.length < 8) {
      return setToast({ type: "error", message: "Password must be at least 8 characters." });
    }
    if (new_password !== confirm_password) {
      return setToast({ type: "error", message: "New password and confirmation do not match." });
    }

    setSavingPwd(true);

    // 1) re-auth with old password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: prefs.email_current,
      password: old_password,
    });

    if (signInErr) {
      setSavingPwd(false);
      return setToast({ type: "error", message: "Old password is incorrect." });
    }

    // 2) update to new password
    const { error: updErr } = await supabase.auth.updateUser({
      password: new_password,
    });

    setSavingPwd(false);

    if (updErr) {
      return setToast({ type: "error", message: `Password update failed: ${updErr.message}` });
    }

    setPwdForm({ old_password: "", new_password: "", confirm_password: "" });
    setToast({ type: "success", message: "✅ Password updated successfully." });
  };

  if (loading) {
    return <div className="text-gray-600 text-sm p-4">Loading your preferences…</div>;
  }

  return (
    <div className="space-y-10">
      {/* -------- Preferences -------- */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Preferences</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              name="preferred_language"
              value={prefs.preferred_language || "en"}
              onChange={onPrefChange}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
            <select
              name="theme"
              value={prefs.theme || "light"}
              onChange={onPrefChange}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              name="currency"
              value={prefs.currency || "EUR"}
              onChange={onPrefChange}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Notifications</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="notifications_email"
                  checked={!!prefs.notifications_email}
                  onChange={onPrefChange}
                  className="h-4 w-4 text-rose-600 border-gray-300 rounded"
                />
                Email
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="notifications_push"
                  checked={!!prefs.notifications_push}
                  onChange={onPrefChange}
                  className="h-4 w-4 text-rose-600 border-gray-300 rounded"
                />
                Push
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={savePreferences}
            disabled={savingPrefs}
            className={`px-5 py-2 rounded-full font-medium text-white transition
              ${savingPrefs ? "bg-gray-300 cursor-not-allowed" : "bg-gradient-to-r from-rose-600 to-red-600 hover:scale-[1.02]"}`}
          >
            {savingPrefs ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      </section>

      {/* -------- Account Security -------- */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">Account Security</h3>
        <p className="text-sm text-gray-500 mt-1">
          Logged in as <span className="font-medium text-gray-700">{prefs.email_current}</span>
        </p>

        {/* Change Email */}
        <div className="mt-6">
          <h4 className="font-semibold text-gray-800 mb-2">Change Email</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="email"
              placeholder="New email"
              value={emailForm.new_email}
              onChange={(e) => setEmailForm((f) => ({ ...f, new_email: e.target.value }))}
              className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="email"
              placeholder="Confirm new email"
              value={emailForm.confirm_email}
              onChange={(e) => setEmailForm((f) => ({ ...f, confirm_email: e.target.value }))}
              className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={changeEmail}
              disabled={savingEmail}
              className={`px-5 py-2 rounded-full font-medium text-white transition
                ${savingEmail ? "bg-gray-300 cursor-not-allowed" : "bg-gray-800 hover:opacity-90"}`}
            >
              {savingEmail ? "Updating…" : "Update Email"}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="mt-8">
          <h4 className="font-semibold text-gray-800 mb-2">Change Password</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="password"
              placeholder="Current password"
              value={pwdForm.old_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, old_password: e.target.value }))}
              className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={pwdForm.new_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, new_password: e.target.value }))}
              className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pwdForm.confirm_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, confirm_password: e.target.value }))}
              className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={changePassword}
              disabled={savingPwd}
              className={`px-5 py-2 rounded-full font-medium text-white transition
                ${savingPwd ? "bg-gray-300 cursor-not-allowed" : "bg-gray-800 hover:opacity-90"}`}
            >
              {savingPwd ? "Updating…" : "Update Password"}
            </button>
          </div>
        </div>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
