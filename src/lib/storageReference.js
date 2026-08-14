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
