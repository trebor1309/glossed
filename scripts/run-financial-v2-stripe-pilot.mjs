import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const confirmation = process.env.FINANCIAL_V2_PILOT_CONFIRMATION;
if (confirmation !== "STRIPE_TEST_ONLY") {
  throw new Error("Set FINANCIAL_V2_PILOT_CONFIRMATION=STRIPE_TEST_ONLY");
}

const connectAccountId = process.env.STRIPE_PILOT_CONNECT_ACCOUNT_ID;
const paymentMethodConfigurationId = process.env.STRIPE_PILOT_PAYMENT_METHOD_CONFIGURATION_ID;
const webhookSecret = process.env.STRIPE_PILOT_WEBHOOK_SECRET;
if (!connectAccountId?.startsWith("acct_") || !paymentMethodConfigurationId?.startsWith("pmc_")) {
  throw new Error("Stripe Test Connect account and payment method configuration are required");
}
if (!webhookSecret?.startsWith("whsec_")) throw new Error("Stripe Test webhook secret is required");

function command(file, args) {
  return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function localSupabase() {
  const raw = command("cmd.exe", ["/d", "/s", "/c", "npx.cmd supabase status -o json"]);
  return JSON.parse(raw.slice(raw.indexOf("{")));
}

function stripeTestKey() {
  const config = readFileSync(join(homedir(), ".config", "stripe", "config.toml"), "utf8");
  const match = config.match(/^test_mode_api_key\s*=\s*['\"]?([^'\"\r\n]+)['\"]?$/m);
  const key = match?.[1]?.trim();
  if (!key?.match(/^[sr]k_test_/)) throw new Error("Stripe CLI Test key unavailable");
  return key;
}

async function stripeRequest(key, path, options = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2026-07-29.dahlia",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Stripe ${path}: ${payload.error?.message || response.status}`);
  return payload;
}

async function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function invokeFunction(local, token, name, body) {
  const response = await fetch(`${local.API_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: local.ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${name}: ${payload.error || response.status}`);
  return payload;
}

async function waitFor(label, callback, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await callback();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function localSql(sql) {
  return command("docker", [
    "exec", "-i", "supabase_db_glossed", "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-Atc", sql,
  ]).trim();
}

async function completeCheckout(url, key, sessionId) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2_000);
    const email = page.locator("#email");
    if (await email.isVisible()) await email.fill("pilot-client@example.test");
    await page.locator("#payment-method-accordion-item-title-card").check({ force: true });
    const card = page.locator('[name="cardNumber"]');
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await card.fill("4242424242424242");
    await page.locator('[name="cardExpiry"]').fill("1234");
    await page.locator('[name="cardCvc"]').fill("123");
    const billingName = page.locator('[name="billingName"]');
    if (await billingName.isVisible()) await billingName.fill("Glossed Pilot Client");
    const country = page.locator('[name="billingCountry"]');
    if (await country.isVisible()) await country.selectOption("BE");
    await page.getByTestId("hosted-payment-submit-button").click();
    await page.waitForTimeout(15_000);
  } finally {
    await browser.close();
  }
  await waitFor("Stripe Checkout completion", async () => {
    const session = await stripeRequest(key, `/v1/checkout/sessions/${sessionId}`);
    return session.status === "complete" && session.payment_status === "paid";
  }, 75_000);
}

async function forwardSignedCheckoutEvent(local, key, secret, sessionId) {
  const event = await waitFor("Stripe Checkout event", async () => {
    const events = await stripeRequest(key, "/v1/events?type=checkout.session.completed&limit=50");
    return events.data.find((candidate) => candidate.data?.object?.id === sessionId);
  }, 45_000);
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`, "utf8").digest("hex");
  for (let delivery = 0; delivery < 2; delivery += 1) {
    const response = await fetch(`${local.API_URL}/functions/v1/stripe-payment-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": `t=${timestamp},v1=${signature}`,
      },
      body: raw,
    });
    if (!response.ok) throw new Error(`signed webhook delivery ${delivery + 1}: ${await response.text()}`);
  }
  return event.id;
}

const local = localSupabase();
const stripeKey = stripeTestKey();
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const account = await stripeRequest(
  stripeKey,
  `/v2/core/accounts/${connectAccountId}?include[0]=configuration.recipient&include[1]=requirements`
);
const capabilities = account.configuration?.recipient?.capabilities?.stripe_balance;
if (account.livemode || capabilities?.stripe_transfers?.status !== "active") {
  throw new Error("The pilot Connect account is not an active Stripe Test recipient");
}
const pmc = await stripeRequest(stripeKey, `/v1/payment_method_configurations/${paymentMethodConfigurationId}`);
if (pmc.livemode || !pmc.active || pmc.card?.display_preference?.value !== "on" ||
    pmc.bancontact?.display_preference?.value !== "on" ||
    pmc.sepa_debit?.display_preference?.value !== "off") {
  throw new Error("The dedicated Stripe Test payment method configuration is invalid");
}

// Stripe-hosted Express onboarding presents a CAPTCHA, so this isolated pilot
// uses an API-controlled Test recipient. Relax only the disposable local DB
// constraint; migrations and production keep dashboard = 'express'.
localSql(`alter table public.provider_connect_accounts
  drop constraint provider_connect_accounts_dashboard_check;
  alter table public.provider_connect_accounts
  add constraint provider_connect_accounts_dashboard_check
  check (dashboard in ('express', 'none'));`);

const password = `Pilot-${crypto.randomUUID()}-Aa1!`;
const created = {};
for (const [role, email] of [
  ["client", "pilot-client@example.test"],
  ["provider", "pilot-provider@example.test"],
  ["otherProvider", "pilot-other-provider@example.test"],
]) {
  const requestedRole = role === "client" ? "client" : "pro";
  const user = await must(await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { requested_role: requestedRole },
  }), `create ${role}`);
  created[role] = user.user.id;
}
await must(await admin.from("users").update({ role: "pro", active_role: "pro" })
  .in("id", [created.provider, created.otherProvider]), "set providers");

const clientAuth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const providerAuth = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
const clientSession = await must(await clientAuth.auth.signInWithPassword({
  email: "pilot-client@example.test", password,
}), "client login");
const providerSession = await must(await providerAuth.auth.signInWithPassword({
  email: "pilot-provider@example.test", password,
}), "provider login");

await must(await admin.from("provider_eligibility_policy_versions").insert({
  version: "financial_v2_pilot_be_v1",
  jurisdiction_code: "BE",
  service_country_code: "BE",
  requirement_definitions: [],
  effective_from: new Date(Date.now() - 86_400_000).toISOString(),
  notes: "Stripe Test pilot only; no national rule is inferred.",
}), "eligibility policy");
await must(await admin.from("provider_eligibility_assessments").insert({
  provider_id: created.provider,
  policy_version: "financial_v2_pilot_be_v1",
  service_country_code: "BE",
  service_category_code: "beauty.general",
  revision: 1,
  status: "eligible",
  reason: "Isolated Stripe Test pilot assessment.",
  actor_type: "system",
  deduplication_key: "financial-v2-pilot:eligibility",
}), "eligibility assessment");

await must(await admin.rpc("reserve_provider_connect_account_creation", {
  p_provider_id: created.provider,
}), "reserve Connect account");
const connected = await must(await admin.rpc("complete_provider_connect_account_creation", {
  p_provider_id: created.provider,
  p_stripe_account_id: connectAccountId,
  p_livemode: false,
}), "complete Connect account");
await must(await admin.rpc("sync_provider_connect_account", {
  p_event_id: `financial-v2-pilot:connect:${crypto.randomUUID()}`,
  p_event_type: "account.pilot_sync",
  p_stripe_account_id: connectAccountId,
  p_stripe_created_at: new Date().toISOString(),
  p_livemode: false,
  p_dashboard: account.dashboard,
  p_stripe_transfers_status: capabilities.stripe_transfers.status,
  p_payouts_status: capabilities.payouts.status,
  p_stripe_transfers_status_details: capabilities.stripe_transfers.status_details || [],
  p_payouts_status_details: capabilities.payouts.status_details || [],
  p_requirements: account.requirements || {},
  p_future_requirements: account.future_requirements || {},
  p_applied_configurations: account.applied_configurations || [],
  p_closed: false,
  p_payload_summary: { source: "stripe_test_pilot" },
  p_expected_revision: connected.revision,
}), "sync Connect account");

await must(await admin.from("financial_limit_versions").insert({
  version: "financial_v2_pilot_limits",
  metric_code: "checkout_liquidity_exposure",
  currency: "eur",
  comparison_operator: "above",
  warning_threshold_cents: 100_000,
  blocking_threshold_cents: 200_000,
  notes: "Isolated Stripe Test pilot limit.",
}), "liquidity policy");
await must(await admin.from("checkout_v2_policy_versions").insert({
  version: "financial_v2_pilot_checkout",
  currency: "eur",
  payment_window_open_before_start_seconds: 10_800,
  payment_deadline_seconds: 14_400,
  checkout_ttl_seconds: 3_600,
  checkout_expiry_margin_before_start_seconds: 1_800,
  liquidity_limit_version: "financial_v2_pilot_limits",
  stripe_payment_method_configuration_reference: paymentMethodConfigurationId,
  notes: "Isolated Stripe Test pilot Checkout policy.",
}), "Checkout policy");
await must(await admin.from("provider_payout_policy_versions").insert({
  version: "financial_v2_pilot_payouts",
  currency: "eur",
  schedule_timezone: "Europe/Brussels",
  standard_payout_isodays: [new Date().getUTCDay() || 7],
  standard_payout_local_time: "00:00:00",
  minimum_payout_amount_cents: 0,
  instant_quote_ttl_seconds: 300,
  stripe_instant_cost_rate_bps: 100,
  instant_payout_margin_bps: 0,
  standard_fee_bearer: "platform",
  instant_fee_bearer: "provider",
  effective_from: new Date(Date.now() - 3_600_000).toISOString(),
  notes: "Current-day schedule for the isolated Stripe Test pilot only.",
}), "payout pilot policy");
await must(await admin.from("financial_feature_flags").update({
  enabled: true,
  reason: "Enabled only in the isolated local Stripe Test pilot database.",
}).in("flag_code", [
  "checkout_v2", "completion_release_v2", "financial_remediation_v2", "provider_payouts_v2",
]), "enable local flags");

const requestId = crypto.randomUUID();
const selectedProposalId = crypto.randomUUID();
const competingProposalId = crypto.randomUUID();
const termsId = crypto.randomUUID();
const scheduledStart = new Date(Date.now() + 2 * 3_600_000);
await must(await admin.from("bookings").insert({
  id: requestId,
  client_id: created.client,
  service: "Financial v2 Stripe Test pilot",
  date: scheduledStart.toISOString().slice(0, 10),
  time_slot: scheduledStart.toISOString().slice(11, 16),
  address: "Stripe Test",
  notes: "End-to-end marketplace_v2 pilot.",
  status: "pending",
}), "request fixture");
await must(await admin.from("missions").insert([
  {
    id: selectedProposalId, client_id: created.client, pro_id: created.provider,
    service: "Selected Stripe Test proposal", date: scheduledStart.toISOString(), price: 99,
    status: "proposed", booking_id: requestId, financial_flow_version: "marketplace_v2",
  },
  {
    id: competingProposalId, client_id: created.client, pro_id: created.otherProvider,
    service: "Competing Stripe Test proposal", date: scheduledStart.toISOString(), price: 110,
    status: "proposed", booking_id: requestId, financial_flow_version: "marketplace_v2",
  },
]), "proposal fixtures");

async function createAndPublishWorkflow(machine, subject, actorType, actorId, publishTransition, tag) {
  const workflow = await must(await admin.rpc("create_workflow_instance", {
    p_machine_code: machine, p_machine_version: "v1", p_subject_id: subject,
    p_financial_flow_version: "marketplace_v2", p_actor_type: actorType,
    p_actor_user_id: actorId, p_reason: "Stripe Test pilot fixture.", p_evidence: {},
    p_deduplication_key: `financial-v2-pilot:${tag}:create`,
  }), `${machine} workflow`);
  return await must(await admin.rpc("transition_workflow_instance", {
    p_instance_id: workflow.id, p_expected_revision: workflow.revision,
    p_transition_code: publishTransition, p_actor_type: actorType,
    p_actor_user_id: actorId, p_reason: "Stripe Test pilot publication.", p_evidence: {},
    p_deduplication_key: `financial-v2-pilot:${tag}:publish`,
  }), `${machine} publish`);
}
await createAndPublishWorkflow("request_lifecycle", requestId, "client", created.client,
  "request_publish", "request");
await createAndPublishWorkflow("proposal_lifecycle", selectedProposalId, "provider", created.provider,
  "proposal_publish", "proposal:selected");
await createAndPublishWorkflow("proposal_lifecycle", competingProposalId, "provider", created.otherProvider,
  "proposal_publish", "proposal:competing");
await must(await admin.from("financial_terms_snapshots").insert({
  id: termsId,
  financial_flow_version: "marketplace_v2",
  request_id: requestId,
  proposal_id: selectedProposalId,
  proposal_version: 1,
  currency: "eur",
  service_amount_cents: 8_000,
  travel_amount_cents: 1_000,
  provider_initial_gross_amount_cents: 9_000,
  platform_fee_rate_bps: 1_000,
  platform_fee_initial_amount_cents: 900,
  client_tax_initial_amount_cents: 0,
  client_total_amount_cents: 9_900,
  provider_initial_statutory_withholding_cents: 0,
  provider_initial_transfer_amount_cents: 9_000,
  scheduled_start_at: scheduledStart.toISOString(),
  scheduled_end_at: null,
  jurisdiction_code: "BE",
  contract_version: "financial-v2-pilot-v1",
  eligibility_policy_version: "financial_v2_pilot_be_v1",
  eligibility_service_category_code: "beauty.general",
  created_by_actor_type: "system",
  deduplication_key: "financial-v2-pilot:terms",
}), "financial terms");
const selection = await must(await admin.rpc("create_checkout_v2_selection", {
  p_terms_snapshot_id: termsId,
  p_policy_version: "financial_v2_pilot_checkout",
  p_client_id: created.client,
  p_deduplication_key: "financial-v2-pilot:selection",
}), "create selection");

const checkoutCalls = await Promise.all([
  invokeFunction(local, clientSession.session.access_token, "create-checkout-session-v2", {
    selection_id: selection.id,
  }),
  invokeFunction(local, clientSession.session.access_token, "create-checkout-session-v2", {
    selection_id: selection.id,
  }),
]);
if (checkoutCalls[0].session_id !== checkoutCalls[1].session_id) {
  throw new Error("Concurrent Checkout calls created different Stripe sessions");
}
await completeCheckout(checkoutCalls[0].url, stripeKey, checkoutCalls[0].session_id);
const checkoutEventId = await forwardSignedCheckoutEvent(
  local, stripeKey, webhookSecret, checkoutCalls[0].session_id,
);

const payment = await waitFor("signed Checkout webhook", async () => {
  const { data, error } = await admin.from("checkout_v2_payments").select("*")
    .eq("selection_id", selection.id).maybeSingle();
  if (error) throw error;
  return data;
}, 75_000);

localSql(`select set_config('app.completion_release_v2_mutation','on',false); update public.service_executions_v2 set completion_not_before_at=clock_timestamp()-interval '1 minute' where payment_id='${payment.id}';`);
await invokeFunction(local, providerSession.session.access_token, "service-execution-v2", {
  payment_id: payment.id, action: "provider_complete", operation_id: crypto.randomUUID(),
});
const releaseResult = await invokeFunction(local, clientSession.session.access_token,
  "service-execution-v2", {
    payment_id: payment.id, action: "client_confirm", operation_id: crypto.randomUUID(),
  });
if (releaseResult.transfer?.status !== "succeeded") {
  throw new Error(`Deferred transfer did not succeed: ${JSON.stringify(releaseResult.transfer)}`);
}

const worker = await fetch(`${local.API_URL}/functions/v1/process-provider-payouts-v2`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ limit: 25 }),
});
const workerPayload = await worker.json();
if (!worker.ok) throw new Error(`payout worker: ${workerPayload.error || worker.status}`);
const payoutResult = workerPayload.results?.find(
  (result) => result.provider_id === created.provider
);
if (workerPayload.processed !== 1 || payoutResult?.status !== "error" ||
    !/no positive (?:standard )?provider balance/i.test(payoutResult.message ?? "")) {
  throw new Error(`Unexpected standard payout outcome: ${JSON.stringify(workerPayload)}`);
}

const counts = {};
for (const [name, query] of Object.entries({
  payments: admin.from("checkout_v2_payments").select("id", { count: "exact", head: true })
    .eq("selection_id", selection.id),
  awards: admin.from("checkout_v2_awards").select("request_id", { count: "exact", head: true })
    .eq("selection_id", selection.id),
  transfers: admin.from("provider_transfers_v2").select("id", { count: "exact", head: true })
    .eq("payment_id", payment.id),
  refunds: admin.from("refunds_v2").select("id", { count: "exact", head: true })
    .eq("payment_id", payment.id),
})) {
  const result = await query;
  if (result.error) throw result.error;
  counts[name] = result.count;
}
const balance = localSql(`select coalesce(sum(case when direction='debit' then amount_cents else -amount_cents end),0) from public.financial_ledger_entries where batch_id in (select id from public.financial_ledger_batches where financial_flow_version='marketplace_v2');`);
const webhookEvents = localSql(`select count(*) from public.checkout_v2_webhook_events where event_id='${checkoutEventId}';`);
const workflows = localSql(`select string_agg(machine_code || ':' || current_state, ',' order by machine_code, current_state) from public.workflow_instances where financial_flow_version='marketplace_v2';`);
const notifications = localSql(`select string_agg(event_type || ':' || event_count, ',' order by event_type) from (select event_type, count(*) event_count from public.notifications group by event_type) events;`);
const audit = localSql(`select string_agg(event_type, ',' order by event_type) from public.financial_audit_log;`);
const stripeTransfer = await stripeRequest(stripeKey, `/v1/transfers/${releaseResult.transfer.stripe_transfer_id}`);
const expectedWorkflows = [
  "checkout_attempt:completed",
  "conditional_selection:fulfilled",
  "fund_release:released",
  "payment_lifecycle:paid",
  "proposal_lifecycle:accepted",
  "proposal_lifecycle:not_selected",
  "provider_transfer:succeeded",
  "request_lifecycle:awarded",
  "service_execution:concluded",
];
const expectedNotifications = [
  "proposal_not_selected:1",
  "service_confirmation_requested:1",
  "service_funds_released:2",
  "service_provider_completed:1",
];
const expectedAudit = [
  "checkout.payment_confirmed",
  "execution.provider_completed",
  "release.released",
  "transfer.succeeded",
];
if (counts.payments !== 1 || counts.awards !== 1 || counts.transfers !== 1 ||
    counts.refunds !== 0 || balance !== "0" || webhookEvents !== "1" ||
    expectedWorkflows.some((state) => !workflows.split(",").includes(state)) ||
    expectedNotifications.some((event) => !notifications.split(",").includes(event)) ||
    expectedAudit.some((event) => !audit.split(",").includes(event)) ||
    stripeTransfer.livemode || stripeTransfer.amount !== 9_000 ||
    stripeTransfer.currency !== "eur" || stripeTransfer.destination !== connectAccountId ||
    stripeTransfer.source_transaction !== payment.stripe_charge_id) {
  throw new Error(`Pilot invariants failed: ${JSON.stringify({
    counts, balance, webhookEvents, workflows, notifications, audit,
    stripeTransfer: {
      livemode: stripeTransfer.livemode,
      amount: stripeTransfer.amount,
      currency: stripeTransfer.currency,
      destination: stripeTransfer.destination,
      source_transaction: stripeTransfer.source_transaction,
    },
  })}`);
}

console.log(JSON.stringify({
  mode: "test",
  request_id: requestId,
  payment_id: payment.id,
  stripe_session_id: payment.stripe_session_id,
  stripe_payment_intent_id: payment.stripe_payment_intent_id,
  stripe_charge_id: payment.stripe_charge_id,
  checkout_event_id: checkoutEventId,
  transfer: releaseResult.transfer,
  payout_worker: workerPayload,
  local_counts: counts,
  webhook_event_count: Number(webhookEvents),
  workflow_states: workflows.split(","),
  notifications: notifications.split(","),
  audit_events: audit.split(","),
  ledger_net_cents: Number(balance),
}, null, 2));
