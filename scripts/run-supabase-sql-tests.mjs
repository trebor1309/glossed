import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const localTests = [
  "stripe_concurrency.sql",
  "functional_flows.sql",
  "storage_security.sql",
  "professional_verification.sql",
  "notifications.sql",
  "chat_reliability.sql",
  "booking_offer_e2e_support.sql",
  "financial_v2_foundation.sql",
  "financial_state_models_v1.sql",
  "provider_eligibility_connect_v2.sql",
  "checkout_v2_payment_accounting.sql",
  "completion_release_deferred_transfer.sql",
  "mission_lifecycle_ux_v2.sql",
  "financial_remediation_v2.sql",
  "provider_balances_payouts_v2.sql",
  "admin_backoffice_foundation.sql",
  "admin_operations_read_models.sql",
  "admin_disputes_cancellations.sql",
  "admin_finance_payment_disputes.sql",
  "admin_incidents_audit_configuration.sql",
  "admin_account_management.sql",
  "admin_ux_consolidation_1.sql",
  "admin_ux_consolidation_2.sql",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }

  return result.stdout ?? "";
}

const containers = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
  .split(/\r?\n/)
  .map((name) => name.trim())
  .filter(Boolean);

if (containers.length !== 1) {
  throw new Error(
    `Expected exactly one running local Supabase database container, found ${containers.length}.`
  );
}

const databaseContainer = containers[0];
const concurrencyRole = "glossed_local_sql_test";
const concurrencyPassword = "glossed-local-sql-test-only";
const databaseUrl = `postgresql://${concurrencyRole}:${concurrencyPassword}@127.0.0.1:5432/postgres`;

// PostgreSQL 16 no longer lets a non-superuser open a passwordless dblink
// connection. Create a login used exclusively inside the disposable local
// Supabase database so the concurrency tests never need the real local DB
// password (and cannot accidentally target a linked remote project).
run("docker", [
  "exec",
  databaseContainer,
  "psql",
  "--username",
  "postgres",
  "--dbname",
  "postgres",
  "--set",
  "ON_ERROR_STOP=on",
  "--command",
  `do $setup$ begin
     if not exists (select 1 from pg_roles where rolname = '${concurrencyRole}') then
       create role ${concurrencyRole} login inherit password '${concurrencyPassword}';
     end if;
   end $setup$;
   alter role ${concurrencyRole} password '${concurrencyPassword}';
   grant service_role to ${concurrencyRole};`,
]);

// Supabase's local pg_hba uses a trusted loopback connection. PostgreSQL 16
// therefore requires dblink_connect_u even when a password is present in the
// connection string. Grant it only to the local test runner role (postgres)
// from the container's extension-owner role; this never touches the linked
// project and disappears with the local database.
const dblinkSetupSource = resolve("supabase/tests/setup_local_dblink.sql");
const dblinkSetupTarget = "/tmp/setup_local_dblink.sql";
run("docker", ["cp", dblinkSetupSource, `${databaseContainer}:${dblinkSetupTarget}`]);
run("docker", [
  "exec",
  databaseContainer,
  "sh",
  "-c",
  `PGPASSWORD="$POSTGRES_PASSWORD" psql --username supabase_admin --dbname postgres --set ON_ERROR_STOP=on --file ${dblinkSetupTarget}`,
]);

for (const testFile of localTests) {
  const source = resolve("supabase/tests", testFile);
  const target = `/tmp/${testFile}`;

  process.stdout.write(`\nRunning ${testFile}\n`);
  run("docker", ["cp", source, `${databaseContainer}:${target}`], { stdio: "inherit" });
  run(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=on",
      "--set",
      `TEST_DATABASE_URL=${databaseUrl}`,
      "--file",
      target,
    ],
    { stdio: "inherit" }
  );
}

process.stdout.write("\nAll local Supabase SQL tests passed.\n");
