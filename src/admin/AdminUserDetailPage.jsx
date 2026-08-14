import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, CreditCard, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { getAdminUser } from "./adminOperationsApi";

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getAdminUser(userId)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingPanel />;
  if (error) return <ErrorPanel error={error} retry={load} />;
  const { profile, eligibility_declaration: declaration, eligibility_assessment: eligibility, connect_account: connect, activity } = data;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.business_name || profile.email;

  return (
    <div className="space-y-6">
      <Link to="/utilisateurs" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"><ArrowLeft size={16} /> Retour aux utilisateurs</Link>
      <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Fiche utilisateur</p><h1 className="mt-2 text-2xl font-bold">{name}</h1><p className="mt-1 text-sm text-slate-300">{profile.email} · {profile.id}</p>
        <div className="mt-4 flex flex-wrap gap-2"><StateBadge value={profile.active_role || profile.role} /><StateBadge value={profile.verification_status} /><StateBadge value={eligibility?.status} /></div>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Identité et compte"><DefinitionList items={[
          { label: "Identifiant", value: profile.id, mono: true }, { label: "Statut profil", value: profile.profile_status },
          { label: "Téléphone", value: profile.phone_number }, { label: "Localisation", value: [profile.city, profile.country].filter(Boolean).join(", ") },
          { label: "Entreprise", value: profile.business_name }, { label: "Numéro d’entreprise", value: profile.company_number },
          { label: "TVA", value: profile.no_vat ? "Non assujetti déclaré" : profile.vat_number }, { label: "Création", value: formatDate(profile.created_at) },
        ]} /></AdminPanel>
        <AdminPanel title="Éligibilité prestataire" description="Dernière déclaration et dernière évaluation versionnée.">
          {eligibility || declaration ? <DefinitionList items={[
            { label: "État", value: eligibility?.status }, { label: "Politique", value: eligibility?.policy_version, mono: true },
            { label: "Pays de résidence", value: declaration?.residence_country_code }, { label: "Pays de prestation", value: eligibility?.service_country_code || declaration?.service_country_code },
            { label: "Statut déclaré", value: declaration?.provider_status_code }, { label: "Trader", value: declaration?.trader_classification },
            { label: "Validité", value: formatDate(eligibility?.valid_until) }, { label: "Motif", value: eligibility?.reason },
          ]} /> : <p className="text-sm text-slate-500">Aucune déclaration d’éligibilité.</p>}
        </AdminPanel>
        <AdminPanel title="Vérification Glossed" description="Historique des décisions administratives.">
          <div className="mb-4 flex items-center gap-2"><BadgeCheck size={18} className="text-rose-600" /><StateBadge value={profile.verification_status} /></div>
          {data.verification_history.length === 0 ? <p className="text-sm text-slate-500">Aucune décision enregistrée.</p> : <ol className="space-y-3">{data.verification_history.map((review) => <li key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><StateBadge value={review.decision} /><span className="text-xs text-slate-500">{formatDate(review.reviewed_at)}</span></div>{review.reason && <p className="mt-2 text-slate-700">{review.reason}</p>}</li>)}</ol>}
        </AdminPanel>
        <AdminPanel title="Compte Stripe Connect" description="État synchronisé côté serveur, sans action financière.">
          {connect ? <><div className="mb-4 flex items-center gap-2"><CreditCard size={18} className="text-indigo-600" /><StateBadge value={connect.creation_state} /></div><DefinitionList items={[
            { label: "Compte", value: connect.stripe_account_id, mono: true }, { label: "API", value: connect.account_api_version },
            { label: "Transferts", value: connect.stripe_transfers_status }, { label: "Payouts", value: connect.payouts_status },
            { label: "Connexion", value: connect.connection_enabled && !connect.closed ? "Active" : "Action requise" }, { label: "Dernière synchronisation", value: formatDate(connect.last_synced_at) },
          ]} /></> : <p className="text-sm text-slate-500">Aucun compte Connect.</p>}
        </AdminPanel>
      </div>
      <AdminPanel title="Activité Glossed">
        <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><UserRound size={18} /><p className="mt-2 text-2xl font-bold">{activity.requests_created}</p><p className="text-xs text-slate-500">Demandes créées</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{activity.proposals_created}</p><p className="text-xs text-slate-500">Propositions envoyées</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-bold">{activity.missions_as_client}</p><p className="text-xs text-slate-500">Missions côté client</p></div></div>
        {activity.recent_missions.length === 0 ? <p className="text-sm text-slate-500">Aucune mission récente.</p> : <div className="divide-y divide-slate-100">{activity.recent_missions.map((mission) => <Link key={mission.id} to={`/missions/${mission.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-rose-700"><span><span className="font-semibold">{mission.service || "Mission"}</span><span className="ml-2 font-mono text-xs text-slate-400">{shortId(mission.id)}</span></span><StateBadge value={mission.status} /></Link>)}</div>}
      </AdminPanel>
    </div>
  );
}
