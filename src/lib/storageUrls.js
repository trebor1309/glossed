import { supabase } from "@/lib/supabaseClient";
import { parseStorageReference } from "@/lib/storageReference";

export { parseStorageReference } from "@/lib/storageReference";

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
