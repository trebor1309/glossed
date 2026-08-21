const credentialsByRole = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL,
    password: process.env.E2E_CLIENT_PASSWORD,
  },
  pro: {
    email: process.env.E2E_PRO_EMAIL,
    password: process.env.E2E_PRO_PASSWORD,
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
    totpSecret: process.env.E2E_ADMIN_TOTP_SECRET?.trim() || null,
  },
};

export function credentialsFor(role) {
  const credentials = credentialsByRole[role];

  if (!credentials?.email || !credentials?.password) {
    throw new Error(`Missing credentials for the ${role} E2E account.`);
  }

  return credentials;
}
