import { supabase } from "@/lib/supabaseClient";

const STORAGE_PATH_PATTERN = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

export function parseStorageReference(value, defaultBucket) {
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    return {
      bucket: defaultBucket,
      path: value.replace(/^\/+/, "").split("?")[0],
    };
  }

  try {
    const url = new URL(value);
    const match = url.pathname.match(STORAGE_PATH_PATTERN);
    if (!match) return null;

    return {
      bucket: decodeURIComponent(match[1]),
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export async function createSignedStorageUrl(bucket, value, expiresIn = 3600) {
  const reference = parseStorageReference(value, bucket);
  if (!reference || reference.bucket !== bucket) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(reference.path, expiresIn);

  if (error) throw error;
  return data?.signedUrl || null;
}

export async function removeStorageObject(defaultBucket, value) {
  const reference = parseStorageReference(value, defaultBucket);
  if (!reference) return;

  const { error } = await supabase.storage.from(reference.bucket).remove([reference.path]);
  if (error) throw error;
}
