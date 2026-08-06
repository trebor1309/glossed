import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const allowedModes = new Set(["prepare", "switch", "cleanup", "audit"]);
if (!allowedModes.has(mode)) {
  throw new Error("Usage: node scripts/storage-security-reconcile.mjs <prepare|switch|cleanup|audit>");
}

const projectRef = process.env.GLOSSED_SUPABASE_PROJECT_REF;
const serviceKey = process.env.GLOSSED_STORAGE_SERVICE_KEY;
if (!projectRef || !serviceKey) {
  throw new Error("Missing GLOSSED_SUPABASE_PROJECT_REF or GLOSSED_STORAGE_SERVICE_KEY");
}

const sourceBucket = "glossed-media";
const privateBucket = "verification-documents";
const reportPath = new URL("../supabase/.temp/storage-reconciliation.json", import.meta.url);
const supabase = createClient(`https://${projectRef}.supabase.co`, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function objectPath(value) {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "").split("?")[0];

  const url = new URL(value);
  const match = url.pathname.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)$/
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listVerificationObjects() {
  const paths = [];
  for (const prefix of ["verification/id", "verification/certificate", "verification/certificates"]) {
    const { data, error } = await supabase.storage.from(sourceBucket).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const item of data || []) paths.push(`${prefix}/${item.name}`);
  }
  return [...new Set(paths)];
}

async function getActiveReferences() {
  const { data, error } = await supabase
    .from("users")
    .select("id,id_document,certificate_document")
    .or("id_document.not.is.null,certificate_document.not.is.null");
  if (error) throw error;

  const references = new Map();
  for (const row of data || []) {
    for (const field of ["id_document", "certificate_document"]) {
      const path = objectPath(row[field]);
      if (path) references.set(path, { userId: row.id, field, originalValue: row[field] });
    }
  }
  return references;
}

async function download(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function ensurePrivateBucket() {
  const options = {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  };
  const { data: existing, error: readError } = await supabase.storage.getBucket(privateBucket);
  if (readError && !/not found/i.test(readError.message)) throw readError;

  const result = existing
    ? await supabase.storage.updateBucket(privateBucket, options)
    : await supabase.storage.createBucket(privateBucket, options);
  if (result.error) throw result.error;
}

async function loadReport() {
  return JSON.parse(await readFile(reportPath, "utf8"));
}

async function prepare() {
  await ensurePrivateBucket();
  const activeReferences = await getActiveReferences();
  const sourcePaths = await listVerificationObjects();
  const migrationId = new Date().toISOString().replace(/[:.]/g, "-");
  const entries = [];

  for (const sourcePath of sourcePaths) {
    if (sourcePath.endsWith("/.emptyFolderPlaceholder")) continue;

    const reference = activeReferences.get(sourcePath) || null;
    const targetPath = reference ? sourcePath : `quarantine/${migrationId}/${sourcePath}`;
    const sourceBytes = await download(sourceBucket, sourcePath);
    const contentType = sourcePath.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : sourcePath.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";

    const { error: uploadError } = await supabase.storage
      .from(privateBucket)
      .upload(targetPath, sourceBytes, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const targetBytes = await download(privateBucket, targetPath);
    const sourceHash = sha256(sourceBytes);
    const targetHash = sha256(targetBytes);
    if (sourceBytes.length !== targetBytes.length || sourceHash !== targetHash) {
      throw new Error("Copied object failed size/hash verification");
    }

    entries.push({
      sourcePath,
      targetPath,
      bytes: sourceBytes.length,
      sha256: sourceHash,
      activeReference: reference,
    });
  }

  const report = {
    projectRef,
    preparedAt: new Date().toISOString(),
    sourcePaths,
    entries,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      copied: entries.length,
      active: entries.filter((entry) => entry.activeReference).length,
      quarantined: entries.filter((entry) => !entry.activeReference).length,
      placeholders: sourcePaths.length - entries.length,
    })
  );
}

async function switchReferences() {
  const report = await loadReport();
  let updated = 0;

  for (const entry of report.entries) {
    if (!entry.activeReference) continue;
    const { userId, field } = entry.activeReference;
    const targetBytes = await download(privateBucket, entry.targetPath);
    if (targetBytes.length !== entry.bytes || sha256(targetBytes) !== entry.sha256) {
      throw new Error("Private object changed before reference switch");
    }

    const { data, error } = await supabase
      .from("users")
      .update({ [field]: entry.targetPath })
      .eq("id", userId)
      .select("id");
    if (error) throw error;
    if (data?.length !== 1) throw new Error("Expected exactly one updated profile reference");
    updated += 1;
  }

  report.referencesSwitchedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ updated }));
}

async function cleanup() {
  const report = await loadReport();
  if (!report.referencesSwitchedAt) throw new Error("References must be switched before cleanup");

  for (const entry of report.entries) {
    const targetBytes = await download(privateBucket, entry.targetPath);
    if (targetBytes.length !== entry.bytes || sha256(targetBytes) !== entry.sha256) {
      throw new Error("Private object changed before public cleanup");
    }
  }

  const { error } = await supabase.storage.from(sourceBucket).remove(report.sourcePaths);
  if (error) throw error;

  const remaining = await listVerificationObjects();
  if (remaining.length) throw new Error("Public verification objects remain after cleanup");

  report.publicObjectsRemovedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ removed: report.sourcePaths.length, remaining: 0 }));
}

async function audit() {
  const [{ data: mediaBucket, error: mediaError }, { data: chatBucket, error: chatError }, {
    data: verificationBucket,
    error: verificationError,
  }] = await Promise.all([
    supabase.storage.getBucket(sourceBucket),
    supabase.storage.getBucket("chat_attachments"),
    supabase.storage.getBucket(privateBucket),
  ]);
  if (mediaError || chatError || verificationError) {
    throw mediaError || chatError || verificationError;
  }

  const publicVerificationObjects = await listVerificationObjects();
  const activeReferences = await getActiveReferences();
  const publicReferences = [...activeReferences.values()].filter(({ originalValue }) =>
    originalValue.includes("/object/public/glossed-media/verification/")
  );
  const report = await loadReport();
  let verifiedPrivateCopies = 0;
  let reachablePublicCopies = 0;
  for (const entry of report.entries) {
    const targetBytes = await download(privateBucket, entry.targetPath);
    if (targetBytes.length === entry.bytes && sha256(targetBytes) === entry.sha256) {
      verifiedPrivateCopies += 1;
    }

    const publicUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/${sourceBucket}/${entry.sourcePath}`;
    const response = await fetch(publicUrl);
    if (response.ok) reachablePublicCopies += 1;
  }

  const { data: chatRoots, error: chatRootError } = await supabase.storage
    .from("chat_attachments")
    .list("", { limit: 1000 });
  if (chatRootError) throw chatRootError;
  const chatPaths = [];
  for (const root of chatRoots || []) {
    if (root.id) {
      chatPaths.push(root.name);
      continue;
    }
    const { data: children, error: childError } = await supabase.storage
      .from("chat_attachments")
      .list(root.name, { limit: 1000 });
    if (childError) throw childError;
    for (const child of children || []) chatPaths.push(`${root.name}/${child.name}`);
  }

  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("attachment_url")
    .not("attachment_url", "is", null);
  if (messageError) throw messageError;
  const referencedChatPaths = new Set(
    (messages || []).map((message) => objectPath(message.attachment_url)).filter(Boolean)
  );

  console.log(
    JSON.stringify({
      mediaPublic: mediaBucket.public,
      chatPublic: chatBucket.public,
      verificationPublic: verificationBucket.public,
      publicVerificationObjects: publicVerificationObjects.length,
      activeVerificationReferences: activeReferences.size,
      publicVerificationReferences: publicReferences.length,
      copiedObjects: report.entries.length,
      verifiedPrivateCopies,
      reachablePublicCopies,
      referencesSwitched: Boolean(report.referencesSwitchedAt),
      publicObjectsRemoved: Boolean(report.publicObjectsRemovedAt),
      privateChatObjects: chatPaths.length,
      referencedChatObjects: chatPaths.filter((path) => referencedChatPaths.has(path)).length,
      quarantinedChatObjects: chatPaths.filter((path) => !referencedChatPaths.has(path)).length,
    })
  );
}

if (mode === "prepare") await prepare();
if (mode === "switch") await switchReferences();
if (mode === "cleanup") await cleanup();
if (mode === "audit") await audit();
