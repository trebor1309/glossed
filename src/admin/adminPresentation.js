const labels = {
  active: "Actif",
  true: "Activé",
  false: "Désactivé",
  inactive: "Inactif",
  accepted: "Accepté",
  available: "Disponible",
  blocked: "Bloqué",
  cancelled: "Annulé",
  cancel_requested: "Annulation demandée",
  closed: "Fermé",
  complete: "Complet",
  completed: "Terminé",
  created: "Compte créé",
  creating: "Création en cours",
  disabled: "Désactivé",
  failed: "Échoué",
  incomplete: "Incomplet",
  manual_review: "Revue manuelle requise",
  not_selected: "Non retenue",
  paid: "Payé",
  payment_pending: "Paiement en attente",
  pending: "En attente",
  rejected: "Refusé",
  restricted: "Restreint",
  succeeded: "Réussi",
  suspended: "Suspendu",
  sync_failed: "Synchronisation échouée",
  unknown: "État non déterminé",
  undefined: "Non renseigné",
  verified: "Vérifié",
  accounts_v1_legacy: "Compte Connect historique",
  accounts_v2: "Compte Connect actuel",
  support: "Support",
  verification: "Vérifications",
  disputes: "Litiges",
  finance: "Finance",
  super_admin: "Super administrateur",
  client: "Client",
  pro: "Prestataire",
  admin: "Administrateur",
  administration_read: "Consultation administrative",
};

const roleDescriptions = {
  support: "Assistance aux utilisateurs, missions et incidents opérationnels.",
  verification: "Contrôle des documents et de l’éligibilité des prestataires.",
  disputes: "Instruction et préparation des décisions sur les litiges de prestation.",
  finance: "Opérations financières, chargebacks et rapprochements.",
  super_admin: "Accès complet à l’administration, y compris la gestion des administrateurs.",
};

export function adminLabel(value, fallback = "Non renseigné") {
  if (value === null || value === undefined || value === "") return fallback;
  const code = String(value);
  return labels[code.toLowerCase()] || code.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function adminRoleLabel(code) {
  return labels[code] || adminLabel(code);
}

export function adminRoleDescription(code, fallback) {
  return roleDescriptions[code] || fallback || "Rôle administratif configuré côté serveur.";
}

export function isRecentMfaError(error) {
  const message = typeof error === "string" ? error : error?.message || "";
  return /recent MFA|Administrator permission or recent MFA required|MFA authentication required/i.test(message);
}

export function humanizeAdminError(error) {
  const message = typeof error === "string" ? error : error?.message || "Une erreur inattendue est survenue.";
  if (isRecentMfaError(message)) {
    return "Votre fenêtre de réauthentification MFA a expiré. Saisissez un nouveau code pour continuer.";
  }
  if (/Invalid TOTP|invalid.*code|challenge.*expired/i.test(message)) {
    return "Le code MFA est incorrect ou a expiré. Vérifiez le code actuel de votre application d’authentification.";
  }
  if (/Administrator change preview expired/i.test(message)) {
    return "Cette prévisualisation a expiré. Générez-en une nouvelle avant de confirmer.";
  }
  if (/Administrators cannot change their own account/i.test(message)) {
    return "Vous ne pouvez pas modifier votre propre compte administrateur depuis cette session.";
  }
  if (/last active super administrator/i.test(message)) {
    return "Le dernier super administrateur actif ne peut pas être suspendu, désactivé ou privé de ce rôle.";
  }
  if (/Trusted administrator identity not found/i.test(message)) {
    return "Aucune identité administrateur préprovisionnée ne correspond à cet email.";
  }
  if (/Identity is not eligible for administrator activation/i.test(message)) {
    return "Cette identité ne respecte pas tous les prérequis d’activation administrateur.";
  }
  return message;
}

export function formatRelativeFuture(value, now = Date.now()) {
  if (!value) return "expiration inconnue";
  const remaining = new Date(value).getTime() - now;
  if (remaining <= 0) return "expirée";
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `expire dans ${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `expire dans ${minutes} min`;
  return `expire dans ${Math.ceil(minutes / 60)} h`;
}

function requirementCount(requirements) {
  if (!requirements || typeof requirements !== "object") return 0;
  return ["currently_due", "past_due", "pending_verification"].reduce(
    (total, key) => total + (Array.isArray(requirements[key]) ? requirements[key].length : 0),
    0
  );
}

export function connectAccountPresentation(connect) {
  if (!connect) {
    return {
      state: "missing",
      label: "Aucun compte Connect",
      reason: "Le prestataire n’a pas encore lié de compte Stripe Connect.",
      action: "Le prestataire doit démarrer son onboarding Stripe avant une proposition payante.",
      tone: "warning",
    };
  }
  if (connect.closed) {
    return {
      state: "closed",
      label: "Compte Stripe fermé",
      reason: "Stripe indique que ce compte Connect est fermé.",
      action: "Vérifier la situation du prestataire et relancer un onboarding si nécessaire.",
      tone: "danger",
    };
  }
  if (connect.creation_state === "sync_failed") {
    return {
      state: "sync_failed",
      label: "Synchronisation Stripe échouée",
      reason: "La dernière tentative de mise à jour du compte n’a pas abouti.",
      action: "Actualiser l’état Stripe, puis examiner les détails techniques si l’échec persiste.",
      tone: "danger",
    };
  }
  if (connect.creation_state === "creating") {
    return {
      state: "creating",
      label: "Création du compte en cours",
      reason: "L’identité Connect est réservée mais sa création n’est pas encore finalisée.",
      action: "Actualiser l’état Stripe ou laisser le prestataire reprendre son onboarding.",
      tone: "warning",
    };
  }
  if (!connect.connection_enabled) {
    return {
      state: "disconnected",
      label: "Connexion Glossed désactivée",
      reason: "Le compte existe, mais Glossed ne l’autorise actuellement pas à recevoir des opérations.",
      action: "Examiner la raison de la désactivation avant toute remise en service.",
      tone: "danger",
    };
  }
  if (connect.account_api_version === "accounts_v1_legacy") {
    return {
      state: "legacy",
      label: "Compte Connect historique",
      reason: "Ce compte utilise encore la projection Accounts v1 et son état détaillé peut être incomplet.",
      action: "Vérifier sa migration vers Accounts v2 avant de conclure à son éligibilité financière.",
      tone: "warning",
    };
  }
  const requirementsDue = requirementCount(connect.requirements);
  if (connect.stripe_transfers_status !== "active") {
    return {
      state: "transfers_unavailable",
      label: "Transferts non disponibles",
      reason: requirementsDue
        ? `${requirementsDue} exigence(s) Stripe restent à compléter ou à vérifier.`
        : "Stripe n’autorise pas encore la réception de transferts sur ce compte.",
      action: "Actualiser l’état puis demander au prestataire de compléter les éléments requis dans Glossed.",
      tone: "warning",
    };
  }
  if (connect.payouts_status !== "active") {
    return {
      state: "payouts_unavailable",
      label: "Versements bancaires non disponibles",
      reason: requirementsDue
        ? `${requirementsDue} exigence(s) Stripe empêchent encore les payouts.`
        : "Le compte peut recevoir des transferts, mais Stripe n’autorise pas encore les payouts.",
      action: "Actualiser l’état puis faire compléter les coordonnées ou exigences bancaires requises.",
      tone: "warning",
    };
  }
  return {
    state: "ready",
    label: "Compte Stripe opérationnel",
    reason: "Le compte est lié et les transferts comme les payouts sont actifs.",
    action: "Aucune action requise.",
    tone: "positive",
  };
}
