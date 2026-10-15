export function userDisplayName(user, fallback = "there") {
  return (
    user?.first_name?.trim() || user?.username?.trim() || user?.business_name?.trim() || fallback
  );
}
