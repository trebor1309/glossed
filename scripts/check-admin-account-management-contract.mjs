import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260827010000_admin_account_management.sql");
const page = read("src/admin/AdminAdministratorsPage.jsx");
const app = read("src/admin/AdminApp.jsx");
const layout = read("src/admin/AdminLayout.jsx");
const api = read("src/admin/adminOperationsApi.js");

const requirements = [
  [
    migration.includes("'administrators.read'") &&
      migration.includes("'administrators.manage', true"),
    "separate read and recent-MFA management permissions",
  ],
  [
    migration.includes("admin_account_change_previews") &&
      migration.includes("Administrator account changed after preview"),
    "expiring stale-safe previews",
  ],
  [
    migration.includes("raw_app_meta_data ->> 'account_type' is distinct from 'admin'") &&
      migration.includes("exists (select 1 from public.users"),
    "trusted non-consumer identity boundary",
  ],
  [
    migration.includes("Administrators cannot change their own account or roles"),
    "self-lockout protection",
  ],
  [
    migration.includes("The last active super administrator cannot be removed or suspended"),
    "last super-admin protection",
  ],
  [
    migration.includes("pg_advisory_xact_lock") && migration.includes("for update"),
    "atomic concurrency guard",
  ],
  [
    migration.includes("execution_operation_id") && migration.includes("idempotent', true"),
    "idempotent execution",
  ],
  [
    migration.includes("administrator_account_changed") && migration.includes("admin_audit_log"),
    "immutable administration audit integration",
  ],
  [
    app.includes('path="administrateurs"') && app.includes('permission="administrators.read"'),
    "permission-gated admin route",
  ],
  [
    layout.includes('to: "/administrateurs"') &&
      layout.includes('permission: "administrators.read"'),
    "permission-gated navigation",
  ],
  [
    page.includes("préprovisionnée") &&
      page.includes("Prévisualiser") &&
      page.includes("Confirmer explicitement"),
    "controlled activation and confirmation UX",
  ],
  [
    api.includes("admin_preview_administrator_change") &&
      api.includes("admin_execute_administrator_change"),
    "server RPC-only browser mutations",
  ],
  [!page.includes("service_role") && !api.includes("service_role"), "no service role in browser"],
  [
    !migration.includes("financial_feature_flags") && !migration.includes("set enabled = true"),
    "no financial engine changes",
  ],
];

const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length)
  throw new Error(`Admin account management contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin account management contract passed.");
