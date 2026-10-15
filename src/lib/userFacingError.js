const messageOf = (error) =>
  typeof error === "string" ? error : error?.message || error?.error_description || "";

export function userFacingError(error, fallback = "Something went wrong. Please try again.") {
  const message = messageOf(error);

  if (/users_username_key|users_username_unique_idx|duplicate.*username/i.test(message)) {
    return "This username is already taken. Please choose another one.";
  }
  if (/user is banned|account suspended|banned_until/i.test(message)) {
    return "This account has been suspended. Contact Glossed support if you think this is a mistake.";
  }
  if (/invalid login credentials|invalid.*password/i.test(message)) {
    return "The email address or password is incorrect.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Please confirm your email address before signing in.";
  }
  if (/user already registered|already been registered/i.test(message)) {
    return "An account already exists for this email address. Try signing in instead.";
  }
  if (/password should be at least|weak password/i.test(message)) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return "Too many attempts were made. Please wait a few minutes and try again.";
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "Glossed cannot reach the service right now. Check your connection and try again.";
  }
  if (/legal documents|terms.*accept/i.test(message)) {
    return "Please accept the required terms and privacy notice to continue.";
  }

  return fallback;
}

export function logUnexpectedError(context, error) {
  console.error(`[Glossed] ${context}`, error);
}
