import { Navigate, Route, Routes } from "react-router-dom";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import AdminLayout from "./AdminLayout";
import AdminLogin from "./AdminLogin";
import AdminOverview from "./AdminOverview";
import VerificationReviewPage from "./VerificationReviewPage";
import AdminUsersPage from "./AdminUsersPage";
import AdminUserDetailPage from "./AdminUserDetailPage";
import AdminMissionsPage from "./AdminMissionsPage";
import AdminMissionDetailPage from "./AdminMissionDetailPage";
import AdminDisputesPage from "./AdminDisputesPage";
import AdminDisputeDetailPage from "./AdminDisputeDetailPage";
import AdminFinancePage from "./AdminFinancePage";
import AdminFinancialPaymentDetailPage from "./AdminFinancialPaymentDetailPage";
import AdminPaymentDisputesPage from "./AdminPaymentDisputesPage";
import AdminPaymentDisputeDetailPage from "./AdminPaymentDisputeDetailPage";
import AdminIncidentsPage from "./AdminIncidentsPage";
import AdminIncidentDetailPage from "./AdminIncidentDetailPage";
import AdminAuditPage from "./AdminAuditPage";
import AdminConfigurationPage from "./AdminConfigurationPage";
import AdminAdministratorsPage from "./AdminAdministratorsPage";
import { AdminI18nProvider } from "./AdminI18nContext";

const allowedHosts = new Set([
  "admin.glossed.app",
  "localhost",
  "127.0.0.1",
  ...(import.meta.env.VITE_ADMIN_ALLOWED_HOSTS || "").split(",").map((host) => host.trim()).filter(Boolean),
]);

function PermissionRoute({ permission, children }) {
  const { hasPermission } = useAdminAuth();
  return hasPermission(permission) ? children : <Navigate to="/" replace />;
}

function AdminWorkspace() {
  const { access, loading } = useAdminAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Chargement sécurisé…</div>;
  if (!access?.authorized) return <AdminLogin />;

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="verifications" element={<PermissionRoute permission="verification.read"><VerificationReviewPage /></PermissionRoute>} />
        <Route path="utilisateurs" element={<PermissionRoute permission="users.read"><AdminUsersPage /></PermissionRoute>} />
        <Route path="utilisateurs/:userId" element={<PermissionRoute permission="users.read"><AdminUserDetailPage /></PermissionRoute>} />
        <Route path="missions" element={<PermissionRoute permission="missions.read"><AdminMissionsPage /></PermissionRoute>} />
        <Route path="missions/:missionId" element={<PermissionRoute permission="missions.read"><AdminMissionDetailPage /></PermissionRoute>} />
        <Route path="litiges" element={<PermissionRoute permission="disputes.read"><AdminDisputesPage /></PermissionRoute>} />
        <Route path="litiges/:caseType/:caseId" element={<PermissionRoute permission="disputes.read"><AdminDisputeDetailPage /></PermissionRoute>} />
        <Route path="finance" element={<PermissionRoute permission="finance.read"><AdminFinancePage /></PermissionRoute>} />
        <Route path="finance/paiements/:paymentId" element={<PermissionRoute permission="finance.read"><AdminFinancialPaymentDetailPage /></PermissionRoute>} />
        <Route path="risque" element={<PermissionRoute permission="risk.read"><AdminPaymentDisputesPage /></PermissionRoute>} />
        <Route path="risque/:disputeId" element={<PermissionRoute permission="risk.read"><AdminPaymentDisputeDetailPage /></PermissionRoute>} />
        <Route path="incidents" element={<PermissionRoute permission="incidents.read"><AdminIncidentsPage /></PermissionRoute>} />
        <Route path="incidents/:incidentKey" element={<PermissionRoute permission="incidents.read"><AdminIncidentDetailPage /></PermissionRoute>} />
        <Route path="audit" element={<PermissionRoute permission="audit.read"><AdminAuditPage /></PermissionRoute>} />
        <Route path="configuration" element={<PermissionRoute permission="configuration.read"><AdminConfigurationPage /></PermissionRoute>} />
        <Route path="administrateurs" element={<PermissionRoute permission="administrators.read"><AdminAdministratorsPage /></PermissionRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function AdminApp() {
  if (!allowedHosts.has(window.location.hostname)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-md text-center"><h1 className="text-2xl font-bold">Page indisponible</h1><p className="mt-3 text-sm text-slate-400">L’administration Glossed est accessible uniquement depuis son domaine dédié.</p></div>
      </main>
    );
  }
  return <AdminI18nProvider><AdminAuthProvider><AdminWorkspace /></AdminAuthProvider></AdminI18nProvider>;
}
