export function connectAccountIdempotencyKey(userId: string) {
  return `connect-account:${userId}`;
}

export function refundIdempotencyKey(missionId: string, mode: string) {
  return `mission:${missionId}:${mode}`;
}
