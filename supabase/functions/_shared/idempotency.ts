export function connectAccountIdempotencyKey(userId: string) {
  return `connect-account:${userId}`;
}
