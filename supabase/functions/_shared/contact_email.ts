export type ContactEmailInput = {
  requestId: string;
  category: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  locale: string;
  sourcePath: string;
  createdAt: string;
  userId: string | null;
};

const categoryLabels: Record<string, string> = {
  general: "General",
  booking: "Booking",
  account: "Account",
  professional: "Professional",
  safety: "Safety",
  privacy: "Privacy",
  partnership: "Partnership",
  press: "Press",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function singleLine(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildContactEmail(input: ContactEmailInput) {
  const category = categoryLabels[input.category] ?? "General";
  const reference = input.requestId.slice(0, 8).toUpperCase();
  const requestedSubject = singleLine(input.subject ?? "").slice(0, 100);
  const subject = `[Glossed ${category} · ${reference}] ${requestedSubject || "New contact request"}`;
  const metadata = [
    `Reference: ${reference}`,
    `Category: ${category}`,
    `From: ${input.name} <${input.email}>`,
    `Received: ${input.createdAt}`,
    `Locale: ${input.locale}`,
    `Source: ${input.sourcePath}`,
    `Authenticated user: ${input.userId ?? "No"}`,
  ].join("\n");

  const text = `${metadata}\n\nSubject: ${requestedSubject || "—"}\n\n${input.message}`;
  const htmlMessage = escapeHtml(input.message).replaceAll("\n", "<br />");
  const html = `
    <h1>New Glossed contact request</h1>
    <table role="presentation" cellpadding="6" cellspacing="0">
      <tr><th align="left">Reference</th><td>${escapeHtml(reference)}</td></tr>
      <tr><th align="left">Category</th><td>${escapeHtml(category)}</td></tr>
      <tr><th align="left">From</th><td>${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;</td></tr>
      <tr><th align="left">Received</th><td>${escapeHtml(input.createdAt)}</td></tr>
      <tr><th align="left">Locale</th><td>${escapeHtml(input.locale)}</td></tr>
      <tr><th align="left">Source</th><td>${escapeHtml(input.sourcePath)}</td></tr>
      <tr><th align="left">Authenticated user</th><td>${escapeHtml(input.userId ?? "No")}</td></tr>
    </table>
    <h2>${escapeHtml(requestedSubject || "No subject")}</h2>
    <p>${htmlMessage}</p>
  `.trim();

  return { subject, text, html, reference };
}
